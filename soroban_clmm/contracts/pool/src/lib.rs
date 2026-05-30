#![no_std]

mod math;
mod oracle;
mod storage;
mod test;
mod types;

use crate::math::{
    calc_amount_from_liquidity, compute_swap_step, tick_to_sqrt_price_x96, tuple_to_u256,
    u256_to_tuple,
};
use crate::storage::{
    get_fee_growth_global_0, get_fee_growth_global_1, get_oracle_config, get_pool_state,
    get_tick_data, set_fee_growth_global_0, set_fee_growth_global_1, set_oracle_config,
    set_pool_state, set_tick_data,
};
use crate::types::{DataKey, OracleConfig, PoolState, TickData};
use ethnum::u256;
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, token, vec, Address, Env, IntoVal, Symbol, Val, Vec,
};

#[contract]
pub struct Pool;

const MIN_SQRT_PRICE_LIMIT_X96: (u128, u128) = (0, 4_295_128_740);
const MAX_SQRT_PRICE_LIMIT_X96: (u128, u128) = (
    4_294_805_859,
    318_775_800_626_314_356_294_205_765_087_544_249_638,
);
const DEFAULT_MAX_TICK_CROSSES_PER_SWAP: u32 = 256;
const ABSOLUTE_MAX_TICK_CROSSES_PER_SWAP: u32 = 4096;
const MAX_OBSERVE_WINDOWS: u32 = 8;
const FEE_GROWTH_SCALING_BITS: u32 = 128;
const PROTOCOL_FEE_DENOMINATOR: u128 = 1_000_000;
const MAX_PROTOCOL_FEE_PPM: u32 = 500_000;

fn is_tick_aligned(tick: i32, tick_spacing: u32) -> bool {
    tick_spacing != 0 && tick % tick_spacing as i32 == 0
}

fn apply_signed_liquidity_delta(liquidity: u128, delta: i128) -> u128 {
    if delta >= 0 {
        liquidity
            .checked_add(delta as u128)
            .expect("Liquidity overflow")
    } else {
        liquidity
            .checked_sub(delta.unsigned_abs())
            .expect("Liquidity underflow")
    }
}

fn checked_u256_sub(lhs: u256, rhs: u256, msg: &str) -> u256 {
    lhs.checked_sub(rhs).expect(msg)
}

fn validate_protocol_fee(protocol_fee: u32) {
    if protocol_fee > MAX_PROTOCOL_FEE_PPM {
        panic!("Protocol fee too high");
    }
}

fn resolve_max_tick_crosses(max_tick_crosses_per_swap: u32) -> u32 {
    if max_tick_crosses_per_swap == 0 {
        return DEFAULT_MAX_TICK_CROSSES_PER_SWAP;
    }
    if max_tick_crosses_per_swap > ABSOLUTE_MAX_TICK_CROSSES_PER_SWAP {
        panic!("max_tick_crosses_per_swap too high");
    }
    max_tick_crosses_per_swap
}

fn validate_sqrt_price_limit(
    zero_for_one: bool,
    current_sqrt_price: u256,
    sqrt_price_limit_x96_tuple: (u128, u128),
) {
    let min = tuple_to_u256(MIN_SQRT_PRICE_LIMIT_X96);
    let max = tuple_to_u256(MAX_SQRT_PRICE_LIMIT_X96);
    let limit = tuple_to_u256(sqrt_price_limit_x96_tuple);
    if limit < min || limit > max {
        panic!("sqrt_price_limit_x96 out of bounds");
    }
    if zero_for_one {
        if limit >= current_sqrt_price {
            panic!("Invalid sqrt_price_limit_x96 for zero_for_one");
        }
    } else if limit <= current_sqrt_price {
        panic!("Invalid sqrt_price_limit_x96 for one_for_zero");
    }
}

fn initialize_tick_fee_growth_if_needed(
    tick_data: &mut TickData,
    tick: i32,
    current_tick: i32,
    fee_growth_global_0: u256,
    fee_growth_global_1: u256,
) {
    if !tick_data.initialized {
        if tick <= current_tick {
            tick_data.fee_growth_outside_0 = u256_to_tuple(fee_growth_global_0);
            tick_data.fee_growth_outside_1 = u256_to_tuple(fee_growth_global_1);
        } else {
            tick_data.fee_growth_outside_0 = (0, 0);
            tick_data.fee_growth_outside_1 = (0, 0);
        }
    }
}

fn compute_fee_growth_inside(
    current_tick: i32,
    tick_lower: i32,
    tick_upper: i32,
    tick_lower_data: &TickData,
    tick_upper_data: &TickData,
    fee_growth_global_0: u256,
    fee_growth_global_1: u256,
) -> (u256, u256) {
    let lower_outside_0 = tuple_to_u256(tick_lower_data.fee_growth_outside_0);
    let lower_outside_1 = tuple_to_u256(tick_lower_data.fee_growth_outside_1);
    let upper_outside_0 = tuple_to_u256(tick_upper_data.fee_growth_outside_0);
    let upper_outside_1 = tuple_to_u256(tick_upper_data.fee_growth_outside_1);

    let fee_growth_below_0 = if current_tick >= tick_lower {
        lower_outside_0
    } else {
        checked_u256_sub(
            fee_growth_global_0,
            lower_outside_0,
            "Fee growth below underflow token0",
        )
    };
    let fee_growth_below_1 = if current_tick >= tick_lower {
        lower_outside_1
    } else {
        checked_u256_sub(
            fee_growth_global_1,
            lower_outside_1,
            "Fee growth below underflow token1",
        )
    };

    let fee_growth_above_0 = if current_tick < tick_upper {
        upper_outside_0
    } else {
        checked_u256_sub(
            fee_growth_global_0,
            upper_outside_0,
            "Fee growth above underflow token0",
        )
    };
    let fee_growth_above_1 = if current_tick < tick_upper {
        upper_outside_1
    } else {
        checked_u256_sub(
            fee_growth_global_1,
            upper_outside_1,
            "Fee growth above underflow token1",
        )
    };

    let fee_growth_inside_0 = checked_u256_sub(
        checked_u256_sub(
            fee_growth_global_0,
            fee_growth_below_0,
            "Fee growth inside underflow token0",
        ),
        fee_growth_above_0,
        "Fee growth inside underflow token0",
    );
    let fee_growth_inside_1 = checked_u256_sub(
        checked_u256_sub(
            fee_growth_global_1,
            fee_growth_below_1,
            "Fee growth inside underflow token1",
        ),
        fee_growth_above_1,
        "Fee growth inside underflow token1",
    );

    (fee_growth_inside_0, fee_growth_inside_1)
}

fn authorize_transfer(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) {
    let args: Vec<Val> = vec![
        env,
        from.clone().into_val(env),
        to.clone().into_val(env),
        amount.into_val(env),
    ];
    let context = ContractContext {
        contract: token.clone(),
        fn_name: Symbol::new(env, "transfer"),
        args,
    };
    let invocation = InvokerContractAuthEntry::Contract(SubContractInvocation {
        context,
        sub_invocations: Vec::new(env),
    });
    env.authorize_as_current_contract(vec![env, invocation]);
}

fn authorize_transfer_from(
    env: &Env,
    token: &Address,
    spender: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) {
    let args: Vec<Val> = vec![
        env,
        spender.clone().into_val(env),
        from.clone().into_val(env),
        to.clone().into_val(env),
        amount.into_val(env),
    ];
    let context = ContractContext {
        contract: token.clone(),
        fn_name: Symbol::new(env, "transfer_from"),
        args,
    };
    let invocation = InvokerContractAuthEntry::Contract(SubContractInvocation {
        context,
        sub_invocations: Vec::new(env),
    });
    env.authorize_as_current_contract(vec![env, invocation]);
}

#[contractimpl]
impl Pool {
    pub fn initialize(
        env: Env,
        factory: Address,
        token0: Address,
        token1: Address,
        fee: u32,
        tick_spacing: u32,
        initial_tick: i32,
        position_manager: Address, // NEW: Add position manager address
    ) {
        if env.storage().instance().has(&DataKey::Pool) {
            panic!("Already initialized");
        }
        factory.require_auth();
        if token0 == token1 {
            panic!("Identical token addresses");
        }
        if tick_spacing == 0 {
            panic!("Invalid tick spacing");
        }
        if initial_tick % tick_spacing as i32 != 0 {
            panic!("Initial tick must align with tick spacing");
        }

        let sqrt_price_x96_u256 = tick_to_sqrt_price_x96(initial_tick);
        let sqrt_price_x96 = u256_to_tuple(sqrt_price_x96_u256);

        let pool = PoolState {
            factory,
            token0,
            token1,
            fee,
            tick_spacing,
            current_tick: initial_tick,
            liquidity: 0,
            sqrt_price_x96,
            protocol_fee: 0,
            fees_uncollected_0: 0,
            fees_uncollected_1: 0,
            protocol_fees_0: 0,
            protocol_fees_1: 0,
            max_tick_crosses_per_swap: DEFAULT_MAX_TICK_CROSSES_PER_SWAP,
            paused: false,
            position_manager, // NEW: Store position manager
        };

        // Initialize Oracle
        let oracle_config = OracleConfig {
            index: 0,
            cardinality: 1,
            cardinality_next: 1,
        };
        set_oracle_config(&env, &oracle_config);

        crate::oracle::write(
            &env,
            oracle_config.index,
            env.ledger().timestamp(),
            initial_tick,
            0, // Initial liquidity is 0
            oracle_config.cardinality,
            oracle_config.cardinality_next,
        );

        set_pool_state(&env, &pool);
        set_fee_growth_global_0(&env, &(0, 0));
        set_fee_growth_global_1(&env, &(0, 0));
    }

    /// Add liquidity to the pool (called by PositionManager NFT contract)
    /// Returns (amount0, amount1) transferred
    pub fn add_liquidity(
        env: Env,
        provider: Address, // User providing liquidity
        tick_lower: i32,
        tick_upper: i32,
        liquidity: u128,
    ) -> (u128, u128) {
        // Only position manager can call this
        let pool = get_pool_state(&env);
        pool.position_manager.require_auth();
        if pool.paused {
            panic!("Pool is paused");
        }
        provider.require_auth(); // User must also authorize token transfer
        if liquidity == 0 {
            panic!("Liquidity must be positive");
        }
        if liquidity > i128::MAX as u128 {
            panic!("Liquidity too large");
        }

        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }
        if !is_tick_aligned(tick_lower, pool.tick_spacing)
            || !is_tick_aligned(tick_upper, pool.tick_spacing)
        {
            panic!("Tick must align with tick spacing");
        }

        // Calculate amounts
        let (amount0, amount1) =
            calc_amount_from_liquidity(liquidity, tick_lower, tick_upper, pool.current_tick);

        let fee_growth_global_0 = tuple_to_u256(get_fee_growth_global_0(&env));
        let fee_growth_global_1 = tuple_to_u256(get_fee_growth_global_1(&env));

        // Update Ticks
        let mut tick_lower_data = get_tick_data(&env, tick_lower);
        initialize_tick_fee_growth_if_needed(
            &mut tick_lower_data,
            tick_lower,
            pool.current_tick,
            fee_growth_global_0,
            fee_growth_global_1,
        );
        tick_lower_data.liquidity_gross += liquidity;
        tick_lower_data.liquidity_net += liquidity as i128;
        tick_lower_data.initialized = true;
        set_tick_data(&env, tick_lower, &tick_lower_data);

        let mut tick_upper_data = get_tick_data(&env, tick_upper);
        initialize_tick_fee_growth_if_needed(
            &mut tick_upper_data,
            tick_upper,
            pool.current_tick,
            fee_growth_global_0,
            fee_growth_global_1,
        );
        tick_upper_data.liquidity_gross += liquidity;
        tick_upper_data.liquidity_net -= liquidity as i128;
        tick_upper_data.initialized = true;
        set_tick_data(&env, tick_upper, &tick_upper_data);

        // Update Pool liquidity if in range
        let mut pool = get_pool_state(&env);
        if pool.current_tick >= tick_lower && pool.current_tick < tick_upper {
            pool.liquidity += liquidity;
        }
        set_pool_state(&env, &pool);

        // Transfer tokens from provider to pool
        let token0_client = token::Client::new(&env, &pool.token0);
        let token1_client = token::Client::new(&env, &pool.token1);
        let pool_addr = env.current_contract_address();

        if amount0 > 0 {
            authorize_transfer_from(
                &env,
                &pool.token0,
                &pool_addr,
                &provider,
                &pool_addr,
                amount0 as i128,
            );
            token0_client.transfer_from(&pool_addr, &provider, &pool_addr, &(amount0 as i128));
        }
        if amount1 > 0 {
            authorize_transfer_from(
                &env,
                &pool.token1,
                &pool_addr,
                &provider,
                &pool_addr,
                amount1 as i128,
            );
            token1_client.transfer_from(&pool_addr, &provider, &pool_addr, &(amount1 as i128));
        }

        (amount0, amount1)
    }

    /// Remove liquidity from the pool (called by PositionManager NFT contract)
    /// Returns (amount0, amount1) to be transferred to user
    pub fn remove_liquidity(
        env: Env,
        recipient: Address, // User receiving tokens
        tick_lower: i32,
        tick_upper: i32,
        liquidity: u128,
    ) -> (u128, u128) {
        // Only position manager can call this
        let pool = get_pool_state(&env);
        pool.position_manager.require_auth();
        if liquidity == 0 {
            panic!("Liquidity must be positive");
        }
        if liquidity > i128::MAX as u128 {
            panic!("Liquidity too large");
        }
        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }
        if !is_tick_aligned(tick_lower, pool.tick_spacing)
            || !is_tick_aligned(tick_upper, pool.tick_spacing)
        {
            panic!("Tick must align with tick spacing");
        }

        let (amount0, amount1) =
            calc_amount_from_liquidity(liquidity, tick_lower, tick_upper, pool.current_tick);

        // Update ticks
        let mut tick_lower_data = get_tick_data(&env, tick_lower);
        tick_lower_data.liquidity_gross -= liquidity;
        tick_lower_data.liquidity_net -= liquidity as i128;
        set_tick_data(&env, tick_lower, &tick_lower_data);

        let mut tick_upper_data = get_tick_data(&env, tick_upper);
        tick_upper_data.liquidity_gross -= liquidity;
        tick_upper_data.liquidity_net += liquidity as i128;
        set_tick_data(&env, tick_upper, &tick_upper_data);

        // Update pool liquidity
        let mut pool = get_pool_state(&env);
        if pool.current_tick >= tick_lower && pool.current_tick < tick_upper {
            pool.liquidity -= liquidity;
        }
        set_pool_state(&env, &pool);

        // Transfer tokens to recipient
        let token0_client = token::Client::new(&env, &pool.token0);
        let token1_client = token::Client::new(&env, &pool.token1);
        let pool_addr = env.current_contract_address();

        if amount0 > 0 {
            authorize_transfer(&env, &pool.token0, &pool_addr, &recipient, amount0 as i128);
            token0_client.transfer(&pool_addr, &recipient, &(amount0 as i128));
        }
        if amount1 > 0 {
            authorize_transfer(&env, &pool.token1, &pool_addr, &recipient, amount1 as i128);
            token1_client.transfer(&pool_addr, &recipient, &(amount1 as i128));
        }

        (amount0, amount1)
    }

    pub fn get_fee_growth_inside(
        env: Env,
        tick_lower: i32,
        tick_upper: i32,
    ) -> ((u128, u128), (u128, u128)) {
        let pool = get_pool_state(&env);
        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }
        if !is_tick_aligned(tick_lower, pool.tick_spacing)
            || !is_tick_aligned(tick_upper, pool.tick_spacing)
        {
            panic!("Tick must align with tick spacing");
        }

        let tick_lower_data = get_tick_data(&env, tick_lower);
        let tick_upper_data = get_tick_data(&env, tick_upper);
        let fee_growth_global_0 = tuple_to_u256(get_fee_growth_global_0(&env));
        let fee_growth_global_1 = tuple_to_u256(get_fee_growth_global_1(&env));

        let (fee_growth_inside_0, fee_growth_inside_1) = compute_fee_growth_inside(
            pool.current_tick,
            tick_lower,
            tick_upper,
            &tick_lower_data,
            &tick_upper_data,
            fee_growth_global_0,
            fee_growth_global_1,
        );

        (
            u256_to_tuple(fee_growth_inside_0),
            u256_to_tuple(fee_growth_inside_1),
        )
    }

    /// Collect fees for a specific NFT position snapshot.
    /// Returns `(amount0, amount1, fee_growth_inside_0, fee_growth_inside_1)`.
    pub fn collect_fees(
        env: Env,
        recipient: Address,
        tick_lower: i32,
        tick_upper: i32,
        liquidity: u128,
        fee_growth_inside_0_last: (u128, u128),
        fee_growth_inside_1_last: (u128, u128),
    ) -> (u128, u128, (u128, u128), (u128, u128)) {
        // Only position manager can call this
        let mut pool = get_pool_state(&env);
        pool.position_manager.require_auth();
        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }
        if !is_tick_aligned(tick_lower, pool.tick_spacing)
            || !is_tick_aligned(tick_upper, pool.tick_spacing)
        {
            panic!("Tick must align with tick spacing");
        }

        let tick_lower_data = get_tick_data(&env, tick_lower);
        let tick_upper_data = get_tick_data(&env, tick_upper);
        let fee_growth_global_0 = tuple_to_u256(get_fee_growth_global_0(&env));
        let fee_growth_global_1 = tuple_to_u256(get_fee_growth_global_1(&env));
        let (fee_growth_inside_0, fee_growth_inside_1) = compute_fee_growth_inside(
            pool.current_tick,
            tick_lower,
            tick_upper,
            &tick_lower_data,
            &tick_upper_data,
            fee_growth_global_0,
            fee_growth_global_1,
        );

        let fee_growth_inside_0_last_u256 = tuple_to_u256(fee_growth_inside_0_last);
        let fee_growth_inside_1_last_u256 = tuple_to_u256(fee_growth_inside_1_last);
        let delta_0 = checked_u256_sub(
            fee_growth_inside_0,
            fee_growth_inside_0_last_u256,
            "Fee growth regression token0",
        );
        let delta_1 = checked_u256_sub(
            fee_growth_inside_1,
            fee_growth_inside_1_last_u256,
            "Fee growth regression token1",
        );

        let liquidity_u256 = u256::from(liquidity);
        let mut amount0_u256 = (liquidity_u256 * delta_0) >> FEE_GROWTH_SCALING_BITS;
        let mut amount1_u256 = (liquidity_u256 * delta_1) >> FEE_GROWTH_SCALING_BITS;
        let max_u128 = u256::from(u128::MAX);
        if amount0_u256 > max_u128 || amount1_u256 > max_u128 {
            panic!("Fee amount overflow");
        }

        if amount0_u256 > u256::from(pool.fees_uncollected_0) {
            amount0_u256 = u256::from(pool.fees_uncollected_0);
        }
        if amount1_u256 > u256::from(pool.fees_uncollected_1) {
            amount1_u256 = u256::from(pool.fees_uncollected_1);
        }

        let amount0 = amount0_u256.as_u128();
        let amount1 = amount1_u256.as_u128();

        pool.fees_uncollected_0 = pool
            .fees_uncollected_0
            .checked_sub(amount0)
            .expect("Fee reserve underflow token0");
        pool.fees_uncollected_1 = pool
            .fees_uncollected_1
            .checked_sub(amount1)
            .expect("Fee reserve underflow token1");
        set_pool_state(&env, &pool);

        // Transfer fees to recipient
        if amount0 > 0 || amount1 > 0 {
            let token0_client = token::Client::new(&env, &pool.token0);
            let token1_client = token::Client::new(&env, &pool.token1);
            let pool_addr = env.current_contract_address();

            if amount0 > 0 {
                if amount0 > i128::MAX as u128 {
                    panic!("Fee amount too large token0");
                }
                let amount0_i128 = amount0 as i128;
                let pool_token0_balance = token0_client.balance(&pool_addr);
                if pool_token0_balance < amount0_i128 {
                    panic!("Insufficient pool token0 balance for fee collection");
                }
                authorize_transfer(&env, &pool.token0, &pool_addr, &recipient, amount0_i128);
                token0_client.transfer(&pool_addr, &recipient, &amount0_i128);
            }
            if amount1 > 0 {
                if amount1 > i128::MAX as u128 {
                    panic!("Fee amount too large token1");
                }
                let amount1_i128 = amount1 as i128;
                let pool_token1_balance = token1_client.balance(&pool_addr);
                if pool_token1_balance < amount1_i128 {
                    panic!("Insufficient pool token1 balance for fee collection");
                }
                authorize_transfer(&env, &pool.token1, &pool_addr, &recipient, amount1_i128);
                token1_client.transfer(&pool_addr, &recipient, &amount1_i128);
            }
        }

        (
            amount0,
            amount1,
            u256_to_tuple(fee_growth_inside_0),
            u256_to_tuple(fee_growth_inside_1),
        )
    }

    /// Configure the protocol fee switch as a share of swap fee (parts-per-million).
    pub fn set_protocol_fee(env: Env, protocol_fee: u32) {
        let mut pool = get_pool_state(&env);
        pool.factory.require_auth();
        validate_protocol_fee(protocol_fee);
        pool.protocol_fee = protocol_fee;
        set_pool_state(&env, &pool);
    }

    /// Pause/unpause swap and add-liquidity entrypoints.
    pub fn set_paused(env: Env, paused: bool) {
        let mut pool = get_pool_state(&env);
        pool.factory.require_auth();
        pool.paused = paused;
        set_pool_state(&env, &pool);
    }

    /// Update max number of initialized tick boundaries traversed per swap.
    pub fn set_max_tick_crosses_per_swap(env: Env, max_tick_crosses_per_swap: u32) {
        let mut pool = get_pool_state(&env);
        pool.factory.require_auth();
        pool.max_tick_crosses_per_swap = resolve_max_tick_crosses(max_tick_crosses_per_swap);
        set_pool_state(&env, &pool);
    }

    /// Collect protocol fees accrued in this pool.
    pub fn collect_protocol_fees(env: Env, recipient: Address) -> (u128, u128) {
        let mut pool = get_pool_state(&env);
        pool.factory.require_auth();

        let amount0 = pool.protocol_fees_0;
        let amount1 = pool.protocol_fees_1;
        pool.protocol_fees_0 = 0;
        pool.protocol_fees_1 = 0;
        set_pool_state(&env, &pool);

        if amount0 > 0 || amount1 > 0 {
            let token0_client = token::Client::new(&env, &pool.token0);
            let token1_client = token::Client::new(&env, &pool.token1);
            let pool_addr = env.current_contract_address();

            if amount0 > 0 {
                if amount0 > i128::MAX as u128 {
                    panic!("Protocol fee amount too large token0");
                }
                let amount0_i128 = amount0 as i128;
                let pool_token0_balance = token0_client.balance(&pool_addr);
                if pool_token0_balance < amount0_i128 {
                    panic!("Insufficient pool token0 balance for protocol fee collection");
                }
                authorize_transfer(&env, &pool.token0, &pool_addr, &recipient, amount0_i128);
                token0_client.transfer(&pool_addr, &recipient, &amount0_i128);
            }
            if amount1 > 0 {
                if amount1 > i128::MAX as u128 {
                    panic!("Protocol fee amount too large token1");
                }
                let amount1_i128 = amount1 as i128;
                let pool_token1_balance = token1_client.balance(&pool_addr);
                if pool_token1_balance < amount1_i128 {
                    panic!("Insufficient pool token1 balance for protocol fee collection");
                }
                authorize_transfer(&env, &pool.token1, &pool_addr, &recipient, amount1_i128);
                token1_client.transfer(&pool_addr, &recipient, &amount1_i128);
            }
        }

        (amount0, amount1)
    }

    // ========== LEGACY FUNCTIONS (kept for compatibility during migration) ==========

    /// Legacy mint function - redirects to add_liquidity
    /// DEPRECATED: Use PositionManager.mint() instead
    pub fn mint(
        env: Env,
        to: Address,
        tick_lower: i32,
        tick_upper: i32,
        liquidity_desired: u128,
    ) -> (u128, u128, u64) {
        to.require_auth();
        if liquidity_desired == 0 {
            panic!("Liquidity must be positive");
        }
        if liquidity_desired > i128::MAX as u128 {
            panic!("Liquidity too large");
        }

        let mut pool = get_pool_state(&env);

        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }
        if !is_tick_aligned(tick_lower, pool.tick_spacing)
            || !is_tick_aligned(tick_upper, pool.tick_spacing)
        {
            panic!("Tick must align with tick spacing");
        }

        // Calculate amounts
        let (amount0, amount1) = calc_amount_from_liquidity(
            liquidity_desired,
            tick_lower,
            tick_upper,
            pool.current_tick,
        );
        let fee_growth_global_0 = tuple_to_u256(get_fee_growth_global_0(&env));
        let fee_growth_global_1 = tuple_to_u256(get_fee_growth_global_1(&env));

        // Generate position ID (legacy behavior)
        let key = DataKey::ProtocolFees(100); // Hack: 100 = Position Counter
        let mut position_id: u64 = env.storage().instance().get(&key).unwrap_or(0);
        position_id += 1;
        env.storage().instance().set(&key, &position_id);

        // Update Ticks
        let mut tick_lower_data = get_tick_data(&env, tick_lower);
        initialize_tick_fee_growth_if_needed(
            &mut tick_lower_data,
            tick_lower,
            pool.current_tick,
            fee_growth_global_0,
            fee_growth_global_1,
        );
        tick_lower_data.liquidity_gross += liquidity_desired;
        tick_lower_data.liquidity_net += liquidity_desired as i128;
        tick_lower_data.initialized = true;
        set_tick_data(&env, tick_lower, &tick_lower_data);

        let mut tick_upper_data = get_tick_data(&env, tick_upper);
        initialize_tick_fee_growth_if_needed(
            &mut tick_upper_data,
            tick_upper,
            pool.current_tick,
            fee_growth_global_0,
            fee_growth_global_1,
        );
        tick_upper_data.liquidity_gross += liquidity_desired;
        tick_upper_data.liquidity_net -= liquidity_desired as i128;
        tick_upper_data.initialized = true;
        set_tick_data(&env, tick_upper, &tick_upper_data);

        // Update Pool
        if pool.current_tick >= tick_lower && pool.current_tick < tick_upper {
            pool.liquidity += liquidity_desired;
        }
        set_pool_state(&env, &pool);

        // Transfer tokens from user to pool
        let token0_client = token::Client::new(&env, &pool.token0);
        let token1_client = token::Client::new(&env, &pool.token1);

        if amount0 > 0 {
            token0_client.transfer(&to, &env.current_contract_address(), &(amount0 as i128));
        }
        if amount1 > 0 {
            token1_client.transfer(&to, &env.current_contract_address(), &(amount1 as i128));
        }

        (amount0, amount1, position_id)
    }

    pub fn swap(
        env: Env,
        payer: Address,
        recipient: Address,
        zero_for_one: bool,
        amount_specified: i128,
        sqrt_price_limit_x96_tuple: (u128, u128),
    ) -> (i128, i128) {
        let mut pool = get_pool_state(&env);
        payer.require_auth();
        if pool.paused {
            panic!("Pool is paused");
        }
        if amount_specified == 0 {
            panic!("Amount specified must be non-zero");
        }
        if pool.liquidity == 0 {
            panic!("Insufficient liquidity");
        }

        // Write Oracle Observation
        if let Some(oracle_config) = get_oracle_config(&env) {
            let (next_index, next_cardinality) = crate::oracle::write(
                &env,
                oracle_config.index,
                env.ledger().timestamp(),
                pool.current_tick,
                pool.liquidity,
                oracle_config.cardinality,
                oracle_config.cardinality_next,
            );

            if next_index != oracle_config.index || next_cardinality != oracle_config.cardinality {
                let mut new_config = oracle_config.clone();
                new_config.index = next_index;
                new_config.cardinality = next_cardinality;
                set_oracle_config(&env, &new_config);
            }
        }

        validate_sqrt_price_limit(
            zero_for_one,
            tuple_to_u256(pool.sqrt_price_x96),
            sqrt_price_limit_x96_tuple,
        );
        let sqrt_price_limit_x96 = tuple_to_u256(sqrt_price_limit_x96_tuple);
        let exact_input = amount_specified > 0;
        let mut amount_remaining = if exact_input {
            amount_specified
        } else {
            amount_specified
                .checked_neg()
                .expect("amount_specified out of bounds")
        };
        let mut amount_in_total = 0i128;
        let mut amount_out_total = 0i128;
        let mut current_tick = pool.current_tick;
        let mut current_sqrt_price = tuple_to_u256(pool.sqrt_price_x96);
        let mut current_liquidity = pool.liquidity;
        let max_tick_crosses_per_swap = resolve_max_tick_crosses(pool.max_tick_crosses_per_swap);
        let mut fee_growth_global_0 = tuple_to_u256(get_fee_growth_global_0(&env));
        let mut fee_growth_global_1 = tuple_to_u256(get_fee_growth_global_1(&env));
        let mut fee_accrued_0: u128 = 0;
        let mut fee_accrued_1: u128 = 0;
        let mut protocol_fee_accrued_0: u128 = 0;
        let mut protocol_fee_accrued_1: u128 = 0;
        let tick_step = if pool.tick_spacing == 0 {
            1
        } else {
            pool.tick_spacing as i32
        };
        let mut tick_crosses: u32 = 0;

        // Swap loop
        while amount_remaining > 0 && current_sqrt_price != sqrt_price_limit_x96 {
            if tick_crosses >= max_tick_crosses_per_swap {
                panic!("Swap exceeds tick-cross limit; split order");
            }
            // Simplified: Try to complete swap in one step (no tick crossings simulated here for brevity)
            let next_tick = if zero_for_one {
                current_tick.saturating_sub(tick_step)
            } else {
                current_tick.saturating_add(tick_step)
            };
            let next_sqrt_price = tick_to_sqrt_price_x96(next_tick);

            let target_price = if zero_for_one {
                if next_sqrt_price < sqrt_price_limit_x96 {
                    sqrt_price_limit_x96
                } else {
                    next_sqrt_price
                }
            } else {
                if next_sqrt_price > sqrt_price_limit_x96 {
                    sqrt_price_limit_x96
                } else {
                    next_sqrt_price
                }
            };

            let signed_remaining = if exact_input {
                amount_remaining
            } else {
                -amount_remaining
            };

            let (amount_in_step, amount_out_step, result_sqrt_price, fee_amount_step) =
                compute_swap_step(
                    current_sqrt_price,
                    target_price,
                    current_liquidity,
                    signed_remaining,
                    zero_for_one,
                    pool.fee,
                );

            if amount_in_step == 0 && amount_out_step == 0 {
                break;
            }

            if exact_input {
                if amount_in_step > amount_remaining {
                    panic!("Swap input accounting mismatch");
                }
                amount_remaining -= amount_in_step;
                amount_in_total = amount_in_total
                    .checked_add(amount_in_step)
                    .expect("Swap input overflow");
                amount_out_total = amount_out_total
                    .checked_add(amount_out_step)
                    .expect("Swap output overflow");
            } else {
                if amount_out_step <= 0 {
                    break;
                }
                let consumed_out = if amount_out_step > amount_remaining {
                    amount_remaining
                } else {
                    amount_out_step
                };
                amount_remaining -= consumed_out;
                amount_in_total = amount_in_total
                    .checked_add(amount_in_step)
                    .expect("Swap input overflow");
                amount_out_total = amount_out_total
                    .checked_add(consumed_out)
                    .expect("Swap output overflow");
            }

            if fee_amount_step > 0 && current_liquidity > 0 {
                let fee_u128 = fee_amount_step as u128;
                let protocol_cut =
                    (fee_u128 * u128::from(pool.protocol_fee)) / PROTOCOL_FEE_DENOMINATOR;
                let lp_fee = fee_u128
                    .checked_sub(protocol_cut)
                    .expect("LP fee underflow");
                let fee_growth_increment =
                    (u256::from(lp_fee) << FEE_GROWTH_SCALING_BITS) / u256::from(current_liquidity);
                if zero_for_one {
                    fee_growth_global_0 = fee_growth_global_0
                        .checked_add(fee_growth_increment)
                        .expect("Fee growth overflow token0");
                    fee_accrued_0 = fee_accrued_0
                        .checked_add(lp_fee)
                        .expect("Fee reserve overflow token0");
                    protocol_fee_accrued_0 = protocol_fee_accrued_0
                        .checked_add(protocol_cut)
                        .expect("Protocol fee reserve overflow token0");
                } else {
                    fee_growth_global_1 = fee_growth_global_1
                        .checked_add(fee_growth_increment)
                        .expect("Fee growth overflow token1");
                    fee_accrued_1 = fee_accrued_1
                        .checked_add(lp_fee)
                        .expect("Fee reserve overflow token1");
                    protocol_fee_accrued_1 = protocol_fee_accrued_1
                        .checked_add(protocol_cut)
                        .expect("Protocol fee reserve overflow token1");
                }
            }

            current_sqrt_price = result_sqrt_price;

            // Determine if we crossed a tick
            if result_sqrt_price == target_price && target_price != sqrt_price_limit_x96 {
                // Crossed the tick, update liquidity
                let mut tick_data = get_tick_data(&env, next_tick);
                if tick_data.initialized {
                    tick_data.fee_growth_outside_0 = u256_to_tuple(checked_u256_sub(
                        fee_growth_global_0,
                        tuple_to_u256(tick_data.fee_growth_outside_0),
                        "Tick fee growth flip underflow token0",
                    ));
                    tick_data.fee_growth_outside_1 = u256_to_tuple(checked_u256_sub(
                        fee_growth_global_1,
                        tuple_to_u256(tick_data.fee_growth_outside_1),
                        "Tick fee growth flip underflow token1",
                    ));
                    set_tick_data(&env, next_tick, &tick_data);

                    let signed_delta = if zero_for_one {
                        tick_data
                            .liquidity_net
                            .checked_neg()
                            .expect("Liquidity delta overflow")
                    } else {
                        tick_data.liquidity_net
                    };
                    current_liquidity =
                        apply_signed_liquidity_delta(current_liquidity, signed_delta);
                    current_tick = next_tick;
                } else {
                    // Just moving past uninitialized tick
                    current_tick = next_tick;
                }
                tick_crosses += 1;
            } else {
                // Did not cross tick, meaning we used up all input or hit limit
                break;
            }
        }

        if !exact_input && amount_remaining != 0 {
            panic!("Exact output not fully filled");
        }

        // Update state
        pool.sqrt_price_x96 = u256_to_tuple(current_sqrt_price);
        pool.current_tick = current_tick;
        pool.liquidity = current_liquidity;
        pool.fees_uncollected_0 = pool
            .fees_uncollected_0
            .checked_add(fee_accrued_0)
            .expect("Fee reserve overflow token0");
        pool.fees_uncollected_1 = pool
            .fees_uncollected_1
            .checked_add(fee_accrued_1)
            .expect("Fee reserve overflow token1");
        pool.protocol_fees_0 = pool
            .protocol_fees_0
            .checked_add(protocol_fee_accrued_0)
            .expect("Protocol fee reserve overflow token0");
        pool.protocol_fees_1 = pool
            .protocol_fees_1
            .checked_add(protocol_fee_accrued_1)
            .expect("Protocol fee reserve overflow token1");

        set_pool_state(&env, &pool);
        set_fee_growth_global_0(&env, &u256_to_tuple(fee_growth_global_0));
        set_fee_growth_global_1(&env, &u256_to_tuple(fee_growth_global_1));

        // Transfer output to recipient
        let token0_client = token::Client::new(&env, &pool.token0);
        let token1_client = token::Client::new(&env, &pool.token1);
        let pool_addr = env.current_contract_address();

        let amount_in_filled = amount_in_total;
        let amount_out_filled = amount_out_total;

        if zero_for_one {
            // User sends token0, receives token1
            authorize_transfer_from(
                &env,
                &pool.token0,
                &pool_addr,
                &payer,
                &pool_addr,
                amount_in_filled,
            );
            token0_client.transfer_from(&pool_addr, &payer, &pool_addr, &amount_in_filled);
            if amount_out_filled > 0 {
                let pool_token1_balance = token1_client.balance(&pool_addr);
                if pool_token1_balance < amount_out_filled {
                    panic!("Insufficient pool token1 balance for swap output");
                }
                authorize_transfer(
                    &env,
                    &pool.token1,
                    &pool_addr,
                    &recipient,
                    amount_out_filled,
                );
                token1_client.transfer(&pool_addr, &recipient, &amount_out_filled);
            }
        } else {
            // User sends token1, receives token0
            authorize_transfer_from(
                &env,
                &pool.token1,
                &pool_addr,
                &payer,
                &pool_addr,
                amount_in_filled,
            );
            token1_client.transfer_from(&pool_addr, &payer, &pool_addr, &amount_in_filled);
            if amount_out_filled > 0 {
                let pool_token0_balance = token0_client.balance(&pool_addr);
                if pool_token0_balance < amount_out_filled {
                    panic!("Insufficient pool token0 balance for swap output");
                }
                authorize_transfer(
                    &env,
                    &pool.token0,
                    &pool_addr,
                    &recipient,
                    amount_out_filled,
                );
                token0_client.transfer(&pool_addr, &recipient, &amount_out_filled);
            }
        }

        if zero_for_one {
            (amount_in_filled, -amount_out_filled)
        } else {
            (-amount_out_filled, amount_in_filled)
        }
    }

    /// Legacy burn - kept for backward compatibility but no longer stores positions
    pub fn burn(env: Env, to: Address, position_id: u64, liquidity: u128) -> (u128, u128) {
        // This is a legacy function - in the new architecture, use remove_liquidity via PositionManager
        panic!("Use PositionManager.burn() with NFT-based positions");
    }

    /// Legacy collect - kept for backward compatibility
    pub fn collect(env: Env, to: Address, position_id: u64) -> (u128, u128) {
        // This is a legacy function - in the new architecture, use collect_fees via PositionManager
        panic!("Use PositionManager.collect() with NFT-based positions");
    }

    pub fn observe(env: Env, seconds_ago: Vec<u32>) -> Vec<(i64, u128)> {
        if seconds_ago.len() > MAX_OBSERVE_WINDOWS {
            panic!("Too many observe windows");
        }

        let mut res = Vec::new(&env);
        let oracle_config = get_oracle_config(&env).unwrap();
        let time = env.ledger().timestamp();
        let pool = get_pool_state(&env);

        for seconds_ago in seconds_ago {
            if seconds_ago as u64 > time {
                panic!("seconds_ago exceeds current time");
            }
            let (tick_cum, liq_cum) = crate::oracle::observe_single(
                &env,
                time,
                seconds_ago,
                pool.current_tick,
                oracle_config.index,
                oracle_config.cardinality,
            );
            res.push_back((tick_cum, liq_cum));
        }
        res
    }

    /// Get pool state (useful for frontend queries)
    pub fn get_state(env: Env) -> PoolState {
        get_pool_state(&env)
    }

    pub fn get_tick(env: Env, tick: i32) -> TickData {
        get_tick_data(&env, tick)
    }

    /// Increase oracle history target size. Growth is applied gradually on each new write.
    pub fn increase_obs_cardinality_next(env: Env, cardinality_next: u32) -> u32 {
        crate::oracle::increase_cardinality_next(&env, cardinality_next)
    }

    /// Returns the current oracle index/cardinality settings.
    pub fn get_oracle_config(env: Env) -> OracleConfig {
        get_oracle_config(&env).expect("Oracle not initialized")
    }
}
