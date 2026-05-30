#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Ledger as _},
    BytesN, Env, IntoVal, TryFromVal,
};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let wasm_hash = BytesN::random(&env);
    let position_manager = Address::generate(&env);

    client.initialize(&admin, &wasm_hash, &position_manager);

    // Verify admin is set (via enabling fee tier which requires auth)
    // We can't read storage directly easily unless we expose a getter or look at instance storage.
    // simpler: enable_fee_tier should fail if not admin.
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let wasm_hash = BytesN::random(&env);
    let position_manager = Address::generate(&env);

    client.initialize(&admin, &wasm_hash, &position_manager);
    client.initialize(&admin, &wasm_hash, &position_manager);
}

#[test]
fn test_enable_fee_tier() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let wasm_hash = BytesN::random(&env);
    let position_manager = Address::generate(&env);

    client.initialize(&admin, &wasm_hash, &position_manager);

    client.enable_fee_tier(&10000, &200); // Should succeed (mock auth)

    // TODO: Verify state change using a getter if available, or try to use it.
}

#[test]
fn test_create_pool_deterministic() {
    // This test might be tricky without the actual pool wasm or mocking deployer.
    // Soroban testenv mocks deployer.

    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let position_manager = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(*include_bytes!(
        "../../../target/wasm32v1-none/release/clmm_pool.wasm"
    ));

    client.initialize(&admin, &wasm_hash, &position_manager);

    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);

    // Ensure token ordering for deterministic check
    let (t0, t1) = if token0 < token1 {
        (token0.clone(), token1.clone())
    } else {
        (token1.clone(), token0.clone())
    };

    let _pool_addr = client.create_pool(&t0, &t1, &3000, &0);

    // Check if pool exists
    // We can try to create again and verify panic
}

#[test]
#[should_panic(expected = "Pool already exists")]
fn test_create_duplicate_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let position_manager = Address::generate(&env);
    // Use an empty wasm or dummy for speed if possible, but we need valid wasm for 'deploy' to work?
    // Actually, we can use the pool wasm we built.
    let wasm_hash = env.deployer().upload_contract_wasm(*include_bytes!(
        "../../../target/wasm32v1-none/release/clmm_pool.wasm"
    ));

    client.initialize(&admin, &wasm_hash, &position_manager);

    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);

    client.create_pool(&token0, &token1, &3000, &0);
    client.create_pool(&token0, &token1, &3000, &0);
}

#[test]
fn test_get_pool_returns_created_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let position_manager = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(*include_bytes!(
        "../../../target/wasm32v1-none/release/clmm_pool.wasm"
    ));

    client.initialize(&admin, &wasm_hash, &position_manager);

    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let pool = client.create_pool(&token0, &token1, &3000, &0);
    let fetched = client.get_pool(&token1, &token0, &3000);
    assert_eq!(pool, fetched);
}

#[test]
fn test_set_admin_and_enable_new_fee_tier() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &factory_id);

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let position_manager = Address::generate(&env);
    let wasm_hash = BytesN::random(&env);
    client.initialize(&admin, &wasm_hash, &position_manager);

    client.set_admin(&new_admin);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + ADMIN_TRANSFER_DELAY_SECONDS + 1);
    client.accept_admin_transfer();
    client.enable_fee_tier(&250, &5);
}

#[test]
fn test_contracttype_roundtrip() {
    let env = Env::default();
    let tier = FeeTier {
        fee: 3000,
        tick_spacing: 60,
    };
    let tier_val: soroban_sdk::Val = tier.clone().into_val(&env);
    let tier_back = FeeTier::try_from_val(&env, &tier_val).unwrap();
    assert_eq!(tier_back.fee, 3000);
    assert_eq!(tier_back.tick_spacing, 60);

    let key = DataKey::Pools(Address::generate(&env), Address::generate(&env), 3000);
    let key_val: soroban_sdk::Val = key.into_val(&env);
    let _key_back = DataKey::try_from_val(&env, &key_val).unwrap();
}
