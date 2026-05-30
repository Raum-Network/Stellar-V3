#![cfg(test)]

use super::*;
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env};

#[contract]
struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn get_state(env: Env) -> PoolState {
        PoolState {
            factory: Address::generate(&env),
            token0: Address::generate(&env),
            token1: Address::generate(&env),
            fee: 3000,
            tick_spacing: 60,
            current_tick: 0,
            liquidity: 1_000_000,
            sqrt_price_x96: (0, 79_228_162_514_264_337_593_543_950_336),
            protocol_fee: 0,
            fees_uncollected_0: 0,
            fees_uncollected_1: 0,
            protocol_fees_0: 0,
            protocol_fees_1: 0,
            max_tick_crosses_per_swap: 256,
            paused: false,
            position_manager: Address::generate(&env),
        }
    }

    pub fn get_tick(_env: Env, tick: i32) -> TickData {
        TickData {
            liquidity_gross: tick.unsigned_abs() as u128,
            liquidity_net: tick as i128,
            fee_growth_outside_0: (0, 0),
            fee_growth_outside_1: (0, 0),
            tick_cumulative_outside: 0,
            liquidity_cumulative_outside: 0,
            initialized: tick % 120 == 0,
        }
    }
}

#[test]
fn test_get_pool_state() {
    let env = Env::default();
    let pool_id = env.register_contract(None, MockPool);
    let lens_id = env.register_contract(None, TickLens);
    let lens = TickLensClient::new(&env, &lens_id);

    let state = lens.get_pool_state(&pool_id);
    assert_eq!(state.fee, 3000);
    assert_eq!(state.tick_spacing, 60);
}

#[test]
fn test_get_ticks_page() {
    let env = Env::default();
    let pool_id = env.register_contract(None, MockPool);
    let lens_id = env.register_contract(None, TickLens);
    let lens = TickLensClient::new(&env, &lens_id);

    let ticks = lens.get_ticks_page(&pool_id, &-120, &60, &3);
    assert_eq!(ticks.len(), 3);
    assert_eq!(ticks.get(0).unwrap().0, -120);
    assert_eq!(ticks.get(1).unwrap().0, -60);
    assert_eq!(ticks.get(2).unwrap().0, 0);
}

#[test]
#[should_panic(expected = "limit exceeds max page size")]
fn test_page_limit_guard() {
    let env = Env::default();
    let pool_id = env.register_contract(None, MockPool);
    let lens_id = env.register_contract(None, TickLens);
    let lens = TickLensClient::new(&env, &lens_id);
    let _ = lens.get_ticks_page(&pool_id, &0, &60, &65);
}
