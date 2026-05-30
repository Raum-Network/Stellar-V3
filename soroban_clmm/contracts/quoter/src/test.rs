#![cfg(test)]

use super::*;
use soroban_sdk::{contract, contractimpl, contracttype, testutils::Address as _, Address, Env};

#[contracttype]
enum MockKey {
    Token0,
    Token1,
}

#[contract]
struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn set_tokens(env: Env, token0: Address, token1: Address) {
        env.storage().instance().set(&MockKey::Token0, &token0);
        env.storage().instance().set(&MockKey::Token1, &token1);
    }

    pub fn get_state(env: Env) -> PoolState {
        let token0: Address = env.storage().instance().get(&MockKey::Token0).unwrap();
        let token1: Address = env.storage().instance().get(&MockKey::Token1).unwrap();
        PoolState {
            factory: Address::generate(&env),
            token0,
            token1,
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

    pub fn get_tick(env: Env, _tick: i32) -> TickData {
        TickData {
            liquidity_gross: 0,
            liquidity_net: 0,
            fee_growth_outside_0: (0, 0),
            fee_growth_outside_1: (0, 0),
            tick_cumulative_outside: 0,
            liquidity_cumulative_outside: 0,
            initialized: false,
        }
    }
}

#[test]
fn test_quote_exact_input_returns_positive_amount() {
    let env = Env::default();
    let quoter_id = env.register_contract(None, Quoter);
    let pool_id = env.register_contract(None, MockPool);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    MockPoolClient::new(&env, &pool_id).set_tokens(&token0, &token1);
    let client = QuoterClient::new(&env, &quoter_id);

    let amount = client.quote_exact_input(&pool_id, &token0, &token1, &3000, &1_000, &(0, 0));

    assert!(amount > 0);
}

#[test]
#[should_panic(expected = "Token pair does not match pool")]
fn test_quote_exact_input_invalid_pair_panics() {
    let env = Env::default();
    let quoter_id = env.register_contract(None, Quoter);
    let pool_id = env.register_contract(None, MockPool);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    MockPoolClient::new(&env, &pool_id).set_tokens(&token0, &token1);
    let client = QuoterClient::new(&env, &quoter_id);
    let other = Address::generate(&env);

    let _ = client.quote_exact_input(&pool_id, &token0, &other, &3000, &1_000, &(0, 0));
}

#[test]
fn test_quote_low_level_directional() {
    let env = Env::default();
    let quoter_id = env.register_contract(None, Quoter);
    let pool_id = env.register_contract(None, MockPool);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    MockPoolClient::new(&env, &pool_id).set_tokens(&token0, &token1);
    let client = QuoterClient::new(&env, &quoter_id);

    let out = client.quote(&pool_id, &true, &2_000, &(0, 0));
    assert!(out > 0);
}
