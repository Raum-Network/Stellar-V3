#![no_std]

use core::cmp::Ordering;
use soroban_sdk::{
    contract, contractimpl, contracttype, vec, Address, Env, IntoVal, Map, Symbol, TryFromVal, Val,
};

#[cfg(test)]
mod integration_test;
mod test;

#[contract]
pub struct Router;

// Uniswap V3-compatible sqrt price bounds encoded as (high, low) u128 limbs.
const MIN_SQRT_PRICE_LIMIT_X96: (u128, u128) = (0, 4_295_128_740);
const MAX_SQRT_PRICE_LIMIT_X96: (u128, u128) = (
    4_294_805_859,
    318_775_800_626_314_356_294_205_765_087_544_249_638,
);

#[contracttype]
pub enum DataKey {
    Admin,
    Factory,
    Xlm,
}

#[contracttype]
#[derive(Clone)]
pub struct PathElement {
    pub token_in: Address,
    pub token_out: Address,
    pub fee: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct PoolState {
    pub factory: Address,
    pub token0: Address,
    pub token1: Address,
    pub fee: u32,
    pub tick_spacing: u32,
    pub current_tick: i32,
    pub liquidity: u128,
    pub sqrt_price_x96: (u128, u128),
    pub protocol_fee: u32,
    pub fees_uncollected_0: u128,
    pub fees_uncollected_1: u128,
    pub protocol_fees_0: u128,
    pub protocol_fees_1: u128,
    pub max_tick_crosses_per_swap: u32,
    pub paused: bool,
    pub position_manager: Address,
}

fn load_pool_sqrt_price_and_paused(env: &Env, pool: &Address) -> ((u128, u128), bool) {
    let state: Map<Symbol, Val> =
        env.invoke_contract(pool, &Symbol::new(env, "get_state"), vec![env]);
    let sqrt_price_val = state
        .get(Symbol::new(env, "sqrt_price_x96"))
        .expect("Pool state missing sqrt_price_x96");
    let sqrt_price_x96 =
        <(u128, u128)>::try_from_val(env, &sqrt_price_val).expect("Invalid pool sqrt_price_x96");
    let paused = state
        .get(Symbol::new(env, "paused"))
        .map(|val| bool::try_from_val(env, &val).unwrap_or(false))
        .unwrap_or(false);
    (sqrt_price_x96, paused)
}

fn tuple_cmp(a: (u128, u128), b: (u128, u128)) -> Ordering {
    if a.0 != b.0 {
        a.0.cmp(&b.0)
    } else {
        a.1.cmp(&b.1)
    }
}

fn validate_deadline(env: &Env, deadline: u64) {
    if env.ledger().timestamp() > deadline {
        panic!("Transaction expired");
    }
}

fn resolve_and_validate_sqrt_price_limit(
    zero_for_one: bool,
    sqrt_price_limit_x96: (u128, u128),
    current_sqrt_price_x96: (u128, u128),
) -> (u128, u128) {
    let limit = if sqrt_price_limit_x96 == (0, 0) {
        if zero_for_one {
            MIN_SQRT_PRICE_LIMIT_X96
        } else {
            MAX_SQRT_PRICE_LIMIT_X96
        }
    } else {
        sqrt_price_limit_x96
    };
    if tuple_cmp(limit, MIN_SQRT_PRICE_LIMIT_X96) == Ordering::Less
        || tuple_cmp(limit, MAX_SQRT_PRICE_LIMIT_X96) == Ordering::Greater
    {
        panic!("sqrt_price_limit_x96 out of bounds");
    }
    if zero_for_one {
        if tuple_cmp(limit, current_sqrt_price_x96) != Ordering::Less {
            panic!("Invalid sqrt_price_limit_x96 for zero_for_one");
        }
    } else if tuple_cmp(limit, current_sqrt_price_x96) != Ordering::Greater {
        panic!("Invalid sqrt_price_limit_x96 for one_for_zero");
    }
    limit
}

#[contractimpl]
impl Router {
    pub fn initialize(env: Env, admin: Address, factory: Address, xlm: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::Xlm, &xlm);
    }

    /// Exact Input Swap
    /// Executes a swap where the input amount is fixed, and the output amount is calculated.
    pub fn swap_exact_input(
        env: Env,
        path: soroban_sdk::Vec<PathElement>,
        amount_in: i128,
        amount_out_minimum: i128,
        payer: Address,
        recipient: Address,
        deadline: u64,
        sqrt_price_limit_x96: (u128, u128),
    ) -> i128 {
        validate_deadline(&env, deadline);
        if amount_in <= 0 {
            panic!("amount_in must be positive");
        }
        if amount_out_minimum < 0 {
            panic!("amount_out_minimum must be non-negative");
        }
        if path.len() != 1 {
            panic!("Only single-hop swaps supported");
        }
        payer.require_auth();

        let factory: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let mut current_amount = amount_in;

        for i in 0..path.len() {
            let element = path.get(i).unwrap();
            if element.token_in == element.token_out {
                panic!("Invalid path element");
            }

            // 1. Get pool address from Factory
            let (token0, token1) = if element.token_in < element.token_out {
                (element.token_in.clone(), element.token_out.clone())
            } else {
                (element.token_out.clone(), element.token_in.clone())
            };

            let pool_address: Address = env.invoke_contract(
                &factory,
                &soroban_sdk::Symbol::new(&env, "get_pool"),
                soroban_sdk::vec![
                    &env,
                    token0.into_val(&env),
                    token1.into_val(&env),
                    element.fee.into_val(&env)
                ],
            );

            // 2. Perform Swap
            // zero_for_one = element.token_in == token0
            let zero_for_one = element.token_in == token0;
            let (current_sqrt_price_x96, paused) =
                load_pool_sqrt_price_and_paused(&env, &pool_address);
            if paused {
                panic!("Pool is paused");
            }
            let user_limit = if i == 0 { sqrt_price_limit_x96 } else { (0, 0) };
            let sqrt_price_limit = resolve_and_validate_sqrt_price_limit(
                zero_for_one,
                user_limit,
                current_sqrt_price_x96,
            );

            // Output of this swap is the input for the next hop
            // OR final output to recipient
            let final_hop = i == path.len() - 1;
            let target = if final_hop {
                recipient.clone()
            } else {
                env.current_contract_address()
            };
            let hop_payer = if i == 0 {
                payer.clone()
            } else {
                env.current_contract_address()
            };

            let (amount0, amount1): (i128, i128) = env.invoke_contract(
                &pool_address,
                &soroban_sdk::Symbol::new(&env, "swap"),
                soroban_sdk::vec![
                    &env,
                    hop_payer.into_val(&env),
                    target.into_val(&env),
                    zero_for_one.into_val(&env),
                    current_amount.into_val(&env),
                    sqrt_price_limit.into_val(&env)
                ],
            );

            current_amount = if zero_for_one { -amount1 } else { -amount0 };
        }

        if current_amount < amount_out_minimum {
            panic!("Insufficient output amount");
        }

        current_amount
    }

    /// Exact Output Swap
    /// Executes a swap where the output amount is fixed, and the input amount is calculated.
    pub fn swap_exact_output(
        env: Env,
        path: soroban_sdk::Vec<PathElement>,
        amount_out: i128,
        amount_in_maximum: i128,
        payer: Address,
        recipient: Address,
        deadline: u64,
        sqrt_price_limit_x96: (u128, u128),
    ) -> i128 {
        validate_deadline(&env, deadline);
        if amount_out <= 0 {
            panic!("amount_out must be positive");
        }
        if amount_in_maximum <= 0 {
            panic!("amount_in_maximum must be positive");
        }
        if path.len() != 1 {
            panic!("Only single-hop swaps supported");
        }
        payer.require_auth();

        let factory: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let mut current_amount = amount_out;

        // For exact output, we iterate the path in reverse to find the required input
        for i in (0..path.len()).rev() {
            let element = path.get(i).unwrap();
            if element.token_in == element.token_out {
                panic!("Invalid path element");
            }

            let (token0, token1) = if element.token_in < element.token_out {
                (element.token_in.clone(), element.token_out.clone())
            } else {
                (element.token_out.clone(), element.token_in.clone())
            };

            let pool_address: Address = env.invoke_contract(
                &factory,
                &Symbol::new(&env, "get_pool"),
                vec![
                    &env,
                    token0.into_val(&env),
                    token1.into_val(&env),
                    element.fee.into_val(&env),
                ],
            );

            let zero_for_one = element.token_in == token0;
            let (current_sqrt_price_x96, paused) =
                load_pool_sqrt_price_and_paused(&env, &pool_address);
            if paused {
                panic!("Pool is paused");
            }
            let user_limit = if i == path.len() - 1 {
                sqrt_price_limit_x96
            } else {
                (0, 0)
            };
            let sqrt_price_limit = resolve_and_validate_sqrt_price_limit(
                zero_for_one,
                user_limit,
                current_sqrt_price_x96,
            );

            // For exact output, we pass -current_amount (negative means output is specified)
            let hop_payer = if i == 0 {
                payer.clone()
            } else {
                env.current_contract_address()
            };
            let target = if i == path.len() - 1 {
                recipient.clone()
            } else {
                env.current_contract_address()
            };
            let (amount_in, _amount_out): (i128, i128) = env.invoke_contract(
                &pool_address,
                &Symbol::new(&env, "swap"),
                vec![
                    &env,
                    hop_payer.into_val(&env),
                    target.into_val(&env),
                    zero_for_one.into_val(&env),
                    (-current_amount).into_val(&env),
                    sqrt_price_limit.into_val(&env),
                ],
            );

            current_amount = amount_in;
        }

        if current_amount > amount_in_maximum {
            panic!("Excessive input amount");
        }

        current_amount
    }

    // Add Liquidity Helper
    pub fn add_liquidity(
        env: Env,
        token_a: Address,
        token_b: Address,
        fee: u32,
        tick_lower: i32,
        tick_upper: i32,
        liquidity: u128,
        to: Address,
    ) -> (u128, u128, u64) {
        to.require_auth();
        if token_a == token_b {
            panic!("Identical token addresses");
        }
        if liquidity == 0 {
            panic!("Liquidity must be positive");
        }
        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }

        let factory: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let position_manager: Address = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_position_manager"),
            vec![&env],
        );

        let (amount0, amount1, token_id): (u128, u128, u32) = env.invoke_contract(
            &position_manager,
            &Symbol::new(&env, "mint"),
            vec![
                &env,
                token_a.to_val(),
                token_b.to_val(),
                fee.into_val(&env),
                to.to_val(),
                tick_lower.into_val(&env),
                tick_upper.into_val(&env),
                liquidity.into_val(&env),
            ],
        );

        (amount0, amount1, token_id as u64)
    }
}
