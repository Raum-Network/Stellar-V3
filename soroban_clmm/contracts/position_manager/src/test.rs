#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::Address as _, Address, Env, IntoVal, String,
    TryFromVal,
};

#[contracttype]
enum MockFactoryKey {
    Pool,
}

#[contract]
struct MockFactory;

#[contractimpl]
impl MockFactory {
    pub fn set_pool(env: Env, pool: Address) {
        env.storage().instance().set(&MockFactoryKey::Pool, &pool);
    }

    pub fn get_pool(env: Env, _token0: Address, _token1: Address, _fee: u32) -> Address {
        env.storage().instance().get(&MockFactoryKey::Pool).unwrap()
    }
}

#[contracttype]
enum MockPoolKey {
    AddCalls,
    RemoveCalls,
    CollectCalls,
}

#[contract]
struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn add_liquidity(
        env: Env,
        _provider: Address,
        _tick_lower: i32,
        _tick_upper: i32,
        liquidity: u128,
    ) -> (u128, u128) {
        let calls: u32 = env
            .storage()
            .instance()
            .get(&MockPoolKey::AddCalls)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&MockPoolKey::AddCalls, &(calls + 1));
        (liquidity / 2 + 1, liquidity / 3 + 1)
    }

    pub fn remove_liquidity(
        env: Env,
        _recipient: Address,
        _tick_lower: i32,
        _tick_upper: i32,
        liquidity: u128,
    ) -> (u128, u128) {
        let calls: u32 = env
            .storage()
            .instance()
            .get(&MockPoolKey::RemoveCalls)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&MockPoolKey::RemoveCalls, &(calls + 1));
        (liquidity / 2, liquidity / 4)
    }

    pub fn collect_fees(
        env: Env,
        _recipient: Address,
        _tick_lower: i32,
        _tick_upper: i32,
        _liquidity: u128,
        fee_growth_inside_0_last: (u128, u128),
        fee_growth_inside_1_last: (u128, u128),
    ) -> (u128, u128, (u128, u128), (u128, u128)) {
        let calls: u32 = env
            .storage()
            .instance()
            .get(&MockPoolKey::CollectCalls)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&MockPoolKey::CollectCalls, &(calls + 1));
        (11, 22, fee_growth_inside_0_last, fee_growth_inside_1_last)
    }

    pub fn get_fee_growth_inside(
        _env: Env,
        _tick_lower: i32,
        _tick_upper: i32,
    ) -> ((u128, u128), (u128, u128)) {
        ((0, 0), (0, 0))
    }

    pub fn add_calls(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MockPoolKey::AddCalls)
            .unwrap_or(0)
    }

    pub fn remove_calls(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MockPoolKey::RemoveCalls)
            .unwrap_or(0)
    }

    pub fn collect_calls(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MockPoolKey::CollectCalls)
            .unwrap_or(0)
    }
}

fn setup() -> (Env, Address, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register_contract(None, MockPool);
    let factory_id = env.register_contract(None, MockFactory);
    let manager_id = env.register_contract(None, PositionManager);

    let factory = MockFactoryClient::new(&env, &factory_id);
    factory.set_pool(&pool_id);

    let manager = PositionManagerClient::new(&env, &manager_id);
    let admin = Address::generate(&env);
    manager.initialize(
        &admin,
        &factory_id,
        &String::from_str(&env, "RAUM LP Position"),
        &String::from_str(&env, "RAUM-LP"),
    );

    let owner = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    (
        env, manager_id, factory_id, pool_id, owner, token_a, token_b,
    )
}

#[test]
fn test_mint_get_position_and_owned_tokens() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);

    let (amount0, amount1, token_id) =
        manager.mint(&token_a, &token_b, &3000, &owner, &-120, &120, &1_000);
    assert!(amount0 > 0);
    assert!(amount1 > 0);
    assert_eq!(pool.add_calls(), 1);

    let pos = manager.get_position(&token_id);
    assert_eq!(pos.tick_lower, -120);
    assert_eq!(pos.tick_upper, 120);
    assert_eq!(pos.liquidity, 1_000);

    let owned = manager.get_owned_tokens(&owner);
    assert_eq!(owned.len(), 1);
    assert_eq!(owned.get(0).unwrap(), token_id);
    assert_eq!(manager.balance_of(&owner), 1);

    let operator = Address::generate(&env);
    manager.set_approval_for_all(&owner, &operator, &false);
}

#[test]
fn test_get_owned_tokens_page_paginates() {
    let (env, manager_id, _factory_id, _pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);

    for _ in 0..3 {
        let _ = manager.mint(&token_a, &token_b, &3000, &owner, &-120, &120, &1_000);
    }

    let first_page = manager.get_owned_tokens_page(&owner, &0, &2);
    assert_eq!(first_page.len(), 2);
    assert_eq!(first_page.get(0).unwrap(), 0);
    assert_eq!(first_page.get(1).unwrap(), 1);

    let second_page = manager.get_owned_tokens_page(&owner, &2, &2);
    assert_eq!(second_page.len(), 1);
    assert_eq!(second_page.get(0).unwrap(), 2);
}

#[test]
fn test_get_owned_tokens_returns_bounded_first_page() {
    let (env, manager_id, _factory_id, _pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);

    for _ in 0..26 {
        let _ = manager.mint(&token_a, &token_b, &3000, &owner, &-120, &120, &1_000);
    }

    let owned = manager.get_owned_tokens(&owner);
    assert_eq!(owned.len(), 25);
    assert_eq!(owned.get(0).unwrap(), 0);
    assert_eq!(owned.get(24).unwrap(), 24);
}

#[test]
fn test_burn_partial_reduces_liquidity() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &1_000);

    let (out0_partial, out1_partial) = manager.burn(&pool.address, &owner, &token_id, &400);
    assert_eq!(out0_partial, 200);
    assert_eq!(out1_partial, 100);
    assert_eq!(pool.remove_calls(), 1);
    assert_eq!(pool.collect_calls(), 1);

    let pos_after_partial = manager.get_position(&token_id);
    assert_eq!(pos_after_partial.liquidity, 600);
    assert_eq!(manager.balance_of(&owner), 1);
}

#[test]
fn test_burn_full_removes_nft() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &1_000);

    let (out0_full, out1_full) = manager.burn(&pool.address, &owner, &token_id, &1_000);
    assert_eq!(out0_full, 500);
    assert_eq!(out1_full, 250);
    assert_eq!(pool.remove_calls(), 1);
    assert_eq!(pool.collect_calls(), 1);

    let owned = manager.get_owned_tokens(&owner);
    assert_eq!(owned.len(), 0);
    assert_eq!(manager.balance_of(&owner), 0);
}

#[test]
fn test_collect_success() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &500);

    let (fee0, fee1) = manager.collect(&pool.address, &owner, &token_id);
    assert_eq!((fee0, fee1), (11, 22));
    assert_eq!(pool.collect_calls(), 1);

    let pos = manager.get_position(&token_id);
    assert_eq!(pos.fees_owed_0, 0);
    assert_eq!(pos.fees_owed_1, 0);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let manager_id = env.register_contract(None, PositionManager);
    let manager = PositionManagerClient::new(&env, &manager_id);
    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let name = String::from_str(&env, "RAUM LP Position");
    let symbol = String::from_str(&env, "RAUM-LP");
    manager.initialize(&admin, &factory, &name, &symbol);
    manager.initialize(&admin, &factory, &name, &symbol);
}

#[test]
#[should_panic(expected = "Not the owner")]
fn test_burn_wrong_owner_panics() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &500);
    let other = Address::generate(&env);
    manager.burn(&pool.address, &other, &token_id, &100);
}

#[test]
#[should_panic(expected = "Wrong pool")]
fn test_burn_wrong_pool_panics() {
    let (env, manager_id, _factory_id, _pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &500);
    let wrong_pool = Address::generate(&env);
    manager.burn(&wrong_pool, &owner, &token_id, &100);
}

#[test]
#[should_panic(expected = "Insufficient liquidity")]
fn test_burn_insufficient_liquidity_panics() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &500);
    manager.burn(&pool.address, &owner, &token_id, &501);
}

#[test]
#[should_panic(expected = "Not the owner")]
fn test_collect_wrong_owner_panics() {
    let (env, manager_id, _factory_id, pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let pool = MockPoolClient::new(&env, &pool_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &500);
    let other = Address::generate(&env);
    manager.collect(&pool.address, &other, &token_id);
}

#[test]
#[should_panic(expected = "Wrong pool")]
fn test_collect_wrong_pool_panics() {
    let (env, manager_id, _factory_id, _pool_id, owner, token_a, token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    let (_a0, _a1, token_id) = manager.mint(&token_a, &token_b, &3000, &owner, &-60, &60, &500);
    let wrong_pool = Address::generate(&env);
    manager.collect(&wrong_pool, &owner, &token_id);
}

#[test]
#[should_panic(expected = "Position not found")]
fn test_get_position_missing_panics() {
    let (env, manager_id, _factory_id, _pool_id, _owner, _token_a, _token_b) = setup();
    let manager = PositionManagerClient::new(&env, &manager_id);
    manager.get_position(&999_999);
}

#[test]
fn test_contracttype_roundtrip() {
    let env = Env::default();
    let pos = PositionData {
        pool: Address::generate(&env),
        tick_lower: -60,
        tick_upper: 60,
        liquidity: 1000,
        fees_owed_0: 1,
        fees_owed_1: 2,
        fee_growth_inside_0_last: (0, 1),
        fee_growth_inside_1_last: (2, 3),
    };
    let pos_val: soroban_sdk::Val = pos.clone().into_val(&env);
    let pos_back = PositionData::try_from_val(&env, &pos_val).unwrap();
    assert_eq!(pos_back.liquidity, 1000);

    let key = DataKey::Position(7);
    let key_val: soroban_sdk::Val = key.into_val(&env);
    let _key_back = DataKey::try_from_val(&env, &key_val).unwrap();

    let mf_key = MockFactoryKey::Pool;
    let mf_val: soroban_sdk::Val = mf_key.into_val(&env);
    let _mf_back = MockFactoryKey::try_from_val(&env, &mf_val).unwrap();

    let mp_key = MockPoolKey::AddCalls;
    let mp_val: soroban_sdk::Val = mp_key.into_val(&env);
    let _mp_back = MockPoolKey::try_from_val(&env, &mp_val).unwrap();
}
