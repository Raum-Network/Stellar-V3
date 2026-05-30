#![no_std]

use ethnum::u256;
use soroban_sdk::{
    contract, contractimpl, contracttype, vec, Address, Env, IntoVal, Map, Symbol, TryFromVal, Val,
};

#[cfg(test)]
mod test;

#[contract]
pub struct Quoter;

#[contracttype]
#[derive(Clone, Debug)]
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

#[contracttype]
#[derive(Clone, Debug)]
pub struct TickData {
    pub liquidity_gross: u128,
    pub liquidity_net: i128,
    pub fee_growth_outside_0: (u128, u128),
    pub fee_growth_outside_1: (u128, u128),
    pub tick_cumulative_outside: i64,
    pub liquidity_cumulative_outside: u128,
    pub initialized: bool,
}

const Q96: u256 = u256::new(79228162514264337593543950336); // 2^96
const MIN_SQRT_PRICE_LIMIT_X96: (u128, u128) = (0, 4_295_128_740);
const MAX_SQRT_PRICE_LIMIT_X96: (u128, u128) = (
    4_294_805_859,
    318_775_800_626_314_356_294_205_765_087_544_249_638,
);
const DEFAULT_MAX_TICK_CROSSES_PER_QUOTE: u32 = 256;
const ABSOLUTE_MAX_TICK_CROSSES_PER_QUOTE: u32 = 4096;

#[derive(Clone)]
struct PoolView {
    token0: Address,
    token1: Address,
    fee: u32,
    tick_spacing: u32,
    current_tick: i32,
    liquidity: u128,
    sqrt_price_x96: (u128, u128),
    max_tick_crosses_per_swap: u32,
    paused: bool,
}

fn map_get_required<T>(env: &Env, state: &Map<Symbol, Val>, key: &str) -> T
where
    T: TryFromVal<Env, Val>,
{
    let key_sym = Symbol::new(env, key);
    let val = state.get(key_sym).expect("Pool state missing key");
    T::try_from_val(env, &val).expect("Invalid pool state value")
}

fn load_pool_view(env: &Env, pool: &Address) -> PoolView {
    let state: Map<Symbol, Val> =
        env.invoke_contract(pool, &Symbol::new(env, "get_state"), vec![env]);
    let max_tick_crosses_per_swap = state
        .get(Symbol::new(env, "max_tick_crosses_per_swap"))
        .map(|v| u32::try_from_val(env, &v).unwrap_or(DEFAULT_MAX_TICK_CROSSES_PER_QUOTE))
        .unwrap_or(DEFAULT_MAX_TICK_CROSSES_PER_QUOTE);
    let paused = state
        .get(Symbol::new(env, "paused"))
        .map(|v| bool::try_from_val(env, &v).unwrap_or(false))
        .unwrap_or(false);

    PoolView {
        token0: map_get_required(env, &state, "token0"),
        token1: map_get_required(env, &state, "token1"),
        fee: map_get_required(env, &state, "fee"),
        tick_spacing: map_get_required(env, &state, "tick_spacing"),
        current_tick: map_get_required(env, &state, "current_tick"),
        liquidity: map_get_required(env, &state, "liquidity"),
        sqrt_price_x96: map_get_required(env, &state, "sqrt_price_x96"),
        max_tick_crosses_per_swap,
        paused,
    }
}

fn tuple_to_u256(v: (u128, u128)) -> u256 {
    (u256::from(v.0) << 128) | u256::from(v.1)
}

fn tick_to_sqrt_price_x96(tick: i32) -> u256 {
    const MIN_TICK: i32 = -887_272;
    const MAX_TICK: i32 = 887_272;
    if tick < MIN_TICK || tick > MAX_TICK {
        panic!("Tick out of bounds");
    }

    let abs_tick = if tick < 0 {
        (-tick) as u32
    } else {
        tick as u32
    };
    let mut ratio = if (abs_tick & 0x1) != 0 {
        u256::from(0xfffcb933bd6fad37aa2d162d1a594001u128)
    } else {
        u256::new(1) << 128
    };

    if (abs_tick & 0x2) != 0 {
        ratio = (ratio * u256::from(0xfff97272373d413259a46990580e213au128)) >> 128;
    }
    if (abs_tick & 0x4) != 0 {
        ratio = (ratio * u256::from(0xfff2e50f5f656932ef12357cf3c7fdccu128)) >> 128;
    }
    if (abs_tick & 0x8) != 0 {
        ratio = (ratio * u256::from(0xffe5caca7e10e4e61c3624eaa0941cd0u128)) >> 128;
    }
    if (abs_tick & 0x10) != 0 {
        ratio = (ratio * u256::from(0xffcb9843d60f6159c9db58835c926644u128)) >> 128;
    }
    if (abs_tick & 0x20) != 0 {
        ratio = (ratio * u256::from(0xff973b41fa98c081472e6896dfb254c0u128)) >> 128;
    }
    if (abs_tick & 0x40) != 0 {
        ratio = (ratio * u256::from(0xff2ea16466c96a3843ec78b326b52861u128)) >> 128;
    }
    if (abs_tick & 0x80) != 0 {
        ratio = (ratio * u256::from(0xfe5dee046a99a2a811c461f1969c3053u128)) >> 128;
    }
    if (abs_tick & 0x100) != 0 {
        ratio = (ratio * u256::from(0xfcbe86c7900a88aedcffc83b479aa3a4u128)) >> 128;
    }
    if (abs_tick & 0x200) != 0 {
        ratio = (ratio * u256::from(0xf987a7253ac413176f2b074cf7815e54u128)) >> 128;
    }
    if (abs_tick & 0x400) != 0 {
        ratio = (ratio * u256::from(0xf3392b0822b70005940c7a398e4b70f3u128)) >> 128;
    }
    if (abs_tick & 0x800) != 0 {
        ratio = (ratio * u256::from(0xe7159475a2c29b7443b29c7fa6e889d9u128)) >> 128;
    }
    if (abs_tick & 0x1000) != 0 {
        ratio = (ratio * u256::from(0xd097f3bdfd2022b8845ad8f792aa5825u128)) >> 128;
    }
    if (abs_tick & 0x2000) != 0 {
        ratio = (ratio * u256::from(0xa9f746462d870fdf8a65dc1f90e061e5u128)) >> 128;
    }
    if (abs_tick & 0x4000) != 0 {
        ratio = (ratio * u256::from(0x70d869a156d2a1b890bb3df62baf32f7u128)) >> 128;
    }
    if (abs_tick & 0x8000) != 0 {
        ratio = (ratio * u256::from(0x31be135f97d08fd981231505542fcfa6u128)) >> 128;
    }
    if (abs_tick & 0x10000) != 0 {
        ratio = (ratio * u256::from(0x09aa508b5b7a84e1c677de54f3e99bc9u128)) >> 128;
    }
    if (abs_tick & 0x20000) != 0 {
        ratio = (ratio * u256::from(0x005d6af8dedb81196699c329225ee604u128)) >> 128;
    }
    if (abs_tick & 0x40000) != 0 {
        ratio = (ratio * u256::from(0x0002216e584f5fa1ea926041bedfe98u128)) >> 128;
    }
    if (abs_tick & 0x80000) != 0 {
        ratio = (ratio * u256::from(0x000048a170391f7dc42444e8fa2u128)) >> 128;
    }

    if tick > 0 {
        ratio = u256::MAX / ratio;
    }

    let q32 = u256::new(1) << 32;
    let remainder_mask = q32 - u256::new(1);
    let mut sqrt_price_x96 = ratio >> 32;
    if (ratio & remainder_mask) != u256::new(0) {
        sqrt_price_x96 += u256::new(1);
    }
    sqrt_price_x96
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

fn compute_swap_step(
    sqrt_price_current: u256,
    sqrt_price_target: u256,
    liquidity: u128,
    amount_remaining: i128,
    zero_for_one: bool,
    fee: u32,
) -> (i128, i128, u256, i128) {
    fn ceil_div(n: u256, d: u256) -> u256 {
        if n == u256::new(0) {
            u256::new(0)
        } else {
            ((n - u256::new(1)) / d) + u256::new(1)
        }
    }

    if liquidity == 0 {
        return (0, 0, sqrt_price_current, 0);
    }

    let fee_denom = 1_000_000u128;
    let fee_pips = fee as u128;
    if fee_pips >= fee_denom {
        panic!("Invalid fee");
    }

    let liquidity_u256 = u256::from(liquidity);
    let exact_input = amount_remaining >= 0;
    let mut next_sqrt_price = sqrt_price_target;
    let mut amount_in_post_fee = u256::new(0);
    let mut amount_out_u256 = u256::new(0);
    let mut amount_in_total_u256 = u256::new(0);

    if exact_input {
        let amount_remaining_u256 = u256::from(amount_remaining as u128);
        let amount_remaining_less_fee =
            (amount_remaining_u256 * u256::from(fee_denom - fee_pips)) / u256::from(fee_denom);

        if zero_for_one {
            let num = (liquidity_u256 * (sqrt_price_current - sqrt_price_target)) << 96;
            let den = sqrt_price_current * sqrt_price_target;
            if den == u256::new(0) {
                return (0, 0, sqrt_price_current, 0);
            }
            let amount_in_max = ceil_div(num, den);

            if amount_remaining_less_fee >= amount_in_max {
                amount_in_post_fee = amount_in_max;
                amount_out_u256 = (liquidity_u256 * (sqrt_price_current - sqrt_price_target)) >> 96;
                next_sqrt_price = sqrt_price_target;
                amount_in_total_u256 = ceil_div(
                    amount_in_post_fee * u256::from(fee_denom),
                    u256::from(fee_denom - fee_pips),
                );
            } else {
                amount_in_post_fee = amount_remaining_less_fee;
                let numerator = (liquidity_u256 << 96) * sqrt_price_current;
                let denominator =
                    (liquidity_u256 << 96) + (amount_in_post_fee * sqrt_price_current);
                if denominator == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                next_sqrt_price = numerator / denominator;
                amount_out_u256 = (liquidity_u256 * (sqrt_price_current - next_sqrt_price)) >> 96;
                amount_in_total_u256 = amount_remaining_u256;
            }
        } else {
            let amount_in_max = ceil_div(
                liquidity_u256 * (sqrt_price_target - sqrt_price_current),
                Q96,
            );

            if amount_remaining_less_fee >= amount_in_max {
                amount_in_post_fee = amount_in_max;
                let num = (liquidity_u256 * (sqrt_price_target - sqrt_price_current)) << 96;
                let den = sqrt_price_current * sqrt_price_target;
                if den == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                amount_out_u256 = num / den;
                next_sqrt_price = sqrt_price_target;
                amount_in_total_u256 = ceil_div(
                    amount_in_post_fee * u256::from(fee_denom),
                    u256::from(fee_denom - fee_pips),
                );
            } else {
                amount_in_post_fee = amount_remaining_less_fee;
                let delta = (amount_in_post_fee << 96) / liquidity_u256;
                next_sqrt_price = sqrt_price_current + delta;
                let num = (liquidity_u256 * (next_sqrt_price - sqrt_price_current)) << 96;
                let den = sqrt_price_current * next_sqrt_price;
                if den == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                amount_out_u256 = num / den;
                amount_in_total_u256 = amount_remaining_u256;
            }
        }
    } else {
        panic!("Unsupported exact output quote path");
    }

    let max_i128 = u256::from(i128::MAX as u128);
    if amount_in_total_u256 > max_i128 || amount_out_u256 > max_i128 {
        panic!("Swap amount overflow");
    }
    let fee_amount_u256 = amount_in_total_u256
        .checked_sub(amount_in_post_fee)
        .expect("Swap fee underflow");
    if fee_amount_u256 > max_i128 {
        panic!("Swap fee overflow");
    }

    (
        amount_in_total_u256.as_u128() as i128,
        amount_out_u256.as_u128() as i128,
        next_sqrt_price,
        fee_amount_u256.as_u128() as i128,
    )
}

fn resolve_max_tick_crosses(max_tick_crosses_per_swap: u32) -> u32 {
    if max_tick_crosses_per_swap == 0 {
        return DEFAULT_MAX_TICK_CROSSES_PER_QUOTE;
    }
    if max_tick_crosses_per_swap > ABSOLUTE_MAX_TICK_CROSSES_PER_QUOTE {
        panic!("max_tick_crosses_per_swap too high");
    }
    max_tick_crosses_per_swap
}

fn validate_sqrt_price_limit(
    zero_for_one: bool,
    current_sqrt_price: u256,
    sqrt_price_limit_x96: (u128, u128),
) {
    let limit = tuple_to_u256(sqrt_price_limit_x96);
    let min = tuple_to_u256(MIN_SQRT_PRICE_LIMIT_X96);
    let max = tuple_to_u256(MAX_SQRT_PRICE_LIMIT_X96);
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

fn quote_exact_input_internal(
    env: &Env,
    pool: &Address,
    zero_for_one: bool,
    amount_in: i128,
    sqrt_price_limit_x96: (u128, u128),
) -> i128 {
    let pool_state = load_pool_view(env, pool);
    if pool_state.liquidity == 0 {
        panic!("Insufficient liquidity");
    }
    if pool_state.paused {
        panic!("Pool is paused");
    }
    let mut remaining_in = amount_in;
    let mut amount_out = 0i128;
    let mut current_tick = pool_state.current_tick;
    let mut current_sqrt_price = tuple_to_u256(pool_state.sqrt_price_x96);
    let mut current_liquidity = pool_state.liquidity;
    validate_sqrt_price_limit(zero_for_one, current_sqrt_price, sqrt_price_limit_x96);
    let limit = tuple_to_u256(sqrt_price_limit_x96);
    let tick_step = if pool_state.tick_spacing == 0 {
        1
    } else {
        pool_state.tick_spacing as i32
    };
    let max_tick_crosses = resolve_max_tick_crosses(pool_state.max_tick_crosses_per_swap);
    let mut tick_crosses: u32 = 0;

    while remaining_in > 0 && current_sqrt_price != limit {
        if tick_crosses >= max_tick_crosses {
            panic!("Quote exceeds tick-cross limit; split order");
        }

        let next_tick = if zero_for_one {
            current_tick.saturating_sub(tick_step)
        } else {
            current_tick.saturating_add(tick_step)
        };
        let next_sqrt_price = tick_to_sqrt_price_x96(next_tick);
        let target_price = if zero_for_one {
            if next_sqrt_price < limit {
                limit
            } else {
                next_sqrt_price
            }
        } else if next_sqrt_price > limit {
            limit
        } else {
            next_sqrt_price
        };

        let (amount_in_step, amount_out_step, result_sqrt_price, _fee_amount_step) =
            compute_swap_step(
                current_sqrt_price,
                target_price,
                current_liquidity,
                remaining_in,
                zero_for_one,
                pool_state.fee,
            );
        if amount_in_step == 0 && amount_out_step == 0 {
            break;
        }
        if amount_in_step > remaining_in {
            panic!("Quote input accounting mismatch");
        }

        remaining_in -= amount_in_step;
        amount_out = amount_out
            .checked_add(amount_out_step)
            .expect("Quote output overflow");
        current_sqrt_price = result_sqrt_price;

        if result_sqrt_price == target_price && target_price != limit {
            let tick_data: TickData = env.invoke_contract(
                pool,
                &Symbol::new(env, "get_tick"),
                vec![env, next_tick.into_val(env)],
            );
            if tick_data.initialized {
                let signed_delta = if zero_for_one {
                    tick_data
                        .liquidity_net
                        .checked_neg()
                        .expect("Liquidity delta overflow")
                } else {
                    tick_data.liquidity_net
                };
                current_liquidity = apply_signed_liquidity_delta(current_liquidity, signed_delta);
            }
            current_tick = next_tick;
            tick_crosses += 1;
        } else {
            break;
        }
    }

    amount_out
}

#[contractimpl]
impl Quoter {
    pub fn quote_exact_input(
        env: Env,
        pool: Address,
        token_in: Address,
        token_out: Address,
        fee: u32,
        amount_in: i128,
        sqrt_price_limit_x96: (u128, u128),
    ) -> i128 {
        if amount_in <= 0 {
            panic!("amount_in must be positive");
        }
        if token_in == token_out {
            panic!("Identical token addresses");
        }
        let pool_state = load_pool_view(&env, &pool);
        if pool_state.fee != fee {
            panic!("Fee tier mismatch");
        }

        let zero_for_one = if token_in == pool_state.token0 && token_out == pool_state.token1 {
            true
        } else if token_in == pool_state.token1 && token_out == pool_state.token0 {
            false
        } else {
            panic!("Token pair does not match pool");
        };

        let limit = if sqrt_price_limit_x96 == (0, 0) {
            if zero_for_one {
                MIN_SQRT_PRICE_LIMIT_X96
            } else {
                MAX_SQRT_PRICE_LIMIT_X96
            }
        } else {
            sqrt_price_limit_x96
        };

        quote_exact_input_internal(&env, &pool, zero_for_one, amount_in, limit)
    }

    pub fn quote(
        env: Env,
        pool: Address,
        zero_for_one: bool,
        amount_in: i128,
        sqrt_price_limit_x96: (u128, u128),
    ) -> i128 {
        if amount_in <= 0 {
            panic!("amount_in must be positive");
        }
        let limit = if sqrt_price_limit_x96 == (0, 0) {
            if zero_for_one {
                MIN_SQRT_PRICE_LIMIT_X96
            } else {
                MAX_SQRT_PRICE_LIMIT_X96
            }
        } else {
            sqrt_price_limit_x96
        };
        quote_exact_input_internal(&env, &pool, zero_for_one, amount_in, limit)
    }
}
