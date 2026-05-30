#![cfg(test)]
extern crate std;

use soroban_sdk::token::Client as TokenClient;
use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
use soroban_sdk::{testutils::Address as _, vec, Address, Env};

use crate::{PathElement, Router, RouterClient};
use clmm_factory::{Factory, FactoryClient};
use clmm_position_manager::{PositionManager, PositionManagerClient};

#[test]
fn test_end_to_end_swap() {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Setup Tokens
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());

    // Sort tokens as required by Factory
    let (token0, token1) = if token0 < token1 {
        (token0, token1)
    } else {
        (token1, token0)
    };

    let user = Address::generate(&env);

    // Mint initial balances (1M each)
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000_000);

    // 2. Setup Factory
    let factory_id = env.register_contract(None, Factory);
    let factory_client = FactoryClient::new(&env, &factory_id);
    let admin = Address::generate(&env);
    let position_manager = env.register_contract(None, PositionManager);
    let position_manager_client = PositionManagerClient::new(&env, &position_manager);
    let position_manager_admin = Address::generate(&env);

    // Upload Pool WASM
    // We use the WASM code we built or just register the contract generic for testutils
    // Since we are in testutils, `register_contract_wasm` is ideal but we can also
    // just use `register_contract` if we want to valid actual deploy logic we need WASM.
    // However, `Factory` uses `deployer.deploy(wasm_hash)`.
    // So we must register the WASM code.
    // We will use the include_bytes! macro to load the built WASM.
    // Ensure the path is correct relative to this file.
    // Path: ../../../target/wasm32-unknown-unknown/release/clmm_pool.wasm

    let wasm_hash = env
        .deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(
            &env,
            include_bytes!("../../../target/wasm32v1-none/release/clmm_pool.wasm"),
        ));

    factory_client.initialize(&admin, &wasm_hash, &position_manager);
    position_manager_client.initialize(
        &position_manager_admin,
        &factory_id,
        &soroban_sdk::String::from_str(&env, "RAUM LP Position"),
        &soroban_sdk::String::from_str(&env, "RAUM-LP"),
    );

    // 3. Create Pool
    // Fee: 3000 (0.3%), TickSpacing: 60, InitialTick: 0 (Price = 1.0)
    let pool_address = factory_client.create_pool(&token0, &token1, &3000, &0);

    // 4. Setup Router
    let router_id = env.register_contract(None, Router);
    let router_client = RouterClient::new(&env, &router_id);
    let xlm_mock = Address::generate(&env); // Placeholder for native if needed
    let router_admin = Address::generate(&env);

    router_client.initialize(&router_admin, &factory_id, &xlm_mock);

    // 5. Add Liquidity via Router (Stub: Router doesn't have add_liquidity fully linked to user tokens automatically?)
    // The `add_liquidity` function in router code (from previous view) takes `liquidity: u128`.
    // It calls `pool.mint`. `pool.mint` transfers tokens from `to` (User).
    // So we just call it.

    // We need tick range. -60 to 60.
    // Liquidity amount: let's verify how much token0/token1 is needed.
    // At tick 0, P=1. Range symmetric around 0. Amount0 approx Amount1.
    // Liquidity = 1,000,000.

    // In NFT-based path, Pool pulls tokens via transfer_from, so user approves pool.
    TokenClient::new(&env, &token0).approve(&user, &pool_address, &1_000_000_000, &1000);
    TokenClient::new(&env, &token1).approve(&user, &pool_address, &1_000_000_000, &1000);

    router_client.add_liquidity(&token0, &token1, &3000, &-60, &60, &1_000_000, &user);

    // Verify liquidity is added by checking user balance decrease ?
    // Or just check pool state?
    // We'll trust it worked if no panic.

    // 6. Perform Swap
    // User swaps 1000 Token0 -> Token1
    // Path: [Token0, Token1, Fee]

    // Construct Path
    // PathElement { token_in, token_out, fee }
    use crate::PathElement;
    let path = vec![
        &env,
        PathElement {
            token_in: token0.clone(),
            token_out: token1.clone(),
            fee: 3000,
        },
    ];

    let balance0_before = TokenClient::new(&env, &token0).balance(&user);
    let balance1_before = TokenClient::new(&env, &token1).balance(&user);

    // Allow pool to pull token0 from user for swap input.
    TokenClient::new(&env, &token0).approve(&user, &pool_address, &1_000_000, &1000);

    let amount_out = router_client.swap_exact_input(
        &path,
        &1000, // Amount In
        &0,    // Min Amount Out
        &user,
        &user,
        &u64::MAX,
        &(0, 0),
    );

    let balance0_after = TokenClient::new(&env, &token0).balance(&user);
    let balance1_after = TokenClient::new(&env, &token1).balance(&user);

    // Assert balances
    // User spent 1000 token0
    assert_eq!(balance0_before - balance0_after, 1000);

    // User received some token1
    assert!(amount_out > 0);
    assert_eq!(balance1_after - balance1_before, amount_out);
}

#[test]
fn test_exact_output_charges_input_and_delivers_output() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let (token0, token1) = if token0 < token1 {
        (token0, token1)
    } else {
        (token1, token0)
    };

    let user = Address::generate(&env);
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000_000);

    let factory_id = env.register_contract(None, Factory);
    let factory_client = FactoryClient::new(&env, &factory_id);
    let admin = Address::generate(&env);
    let position_manager = env.register_contract(None, PositionManager);
    let position_manager_client = PositionManagerClient::new(&env, &position_manager);
    let position_manager_admin = Address::generate(&env);

    let wasm_hash = env
        .deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(
            &env,
            include_bytes!("../../../target/wasm32v1-none/release/clmm_pool.wasm"),
        ));

    factory_client.initialize(&admin, &wasm_hash, &position_manager);
    position_manager_client.initialize(
        &position_manager_admin,
        &factory_id,
        &soroban_sdk::String::from_str(&env, "RAUM LP Position"),
        &soroban_sdk::String::from_str(&env, "RAUM-LP"),
    );

    let pool_address = factory_client.create_pool(&token0, &token1, &3000, &0);

    let router_id = env.register_contract(None, Router);
    let router_client = RouterClient::new(&env, &router_id);
    let xlm_mock = Address::generate(&env);
    let router_admin = Address::generate(&env);
    router_client.initialize(&router_admin, &factory_id, &xlm_mock);

    TokenClient::new(&env, &token0).approve(&user, &pool_address, &1_000_000_000, &1000);
    TokenClient::new(&env, &token1).approve(&user, &pool_address, &1_000_000_000, &1000);

    let _ = router_client.add_liquidity(&token0, &token1, &3000, &-60, &60, &1_000_000, &user);

    let path = vec![
        &env,
        PathElement {
            token_in: token0.clone(),
            token_out: token1.clone(),
            fee: 3000,
        },
    ];

    let balance0_before = TokenClient::new(&env, &token0).balance(&user);
    let balance1_before = TokenClient::new(&env, &token1).balance(&user);

    let desired_out = 100i128;
    let required_in = router_client.swap_exact_output(
        &path,
        &desired_out,
        &1_000_000,
        &user,
        &user,
        &u64::MAX,
        &(0, 0),
    );

    let balance0_after = TokenClient::new(&env, &token0).balance(&user);
    let balance1_after = TokenClient::new(&env, &token1).balance(&user);

    assert!(required_in > 0);
    assert_eq!(balance0_before - balance0_after, required_in);
    assert_eq!(balance1_after - balance1_before, desired_out);
}

#[test]
fn test_swap_exact_input_uses_explicit_payer_not_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let (token0, token1) = if token0 < token1 {
        (token0, token1)
    } else {
        (token1, token0)
    };

    let lp = Address::generate(&env);
    let victim = Address::generate(&env);
    let attacker = Address::generate(&env);

    TokenAdminClient::new(&env, &token0).mint(&lp, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&lp, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token0).mint(&attacker, &10_000_000);
    TokenAdminClient::new(&env, &token1).mint(&attacker, &10_000_000);
    TokenAdminClient::new(&env, &token0).mint(&victim, &10_000_000);
    TokenAdminClient::new(&env, &token1).mint(&victim, &10_000_000);

    let factory_id = env.register_contract(None, Factory);
    let factory_client = FactoryClient::new(&env, &factory_id);
    let admin = Address::generate(&env);
    let position_manager = env.register_contract(None, PositionManager);
    let position_manager_client = PositionManagerClient::new(&env, &position_manager);
    let position_manager_admin = Address::generate(&env);

    let wasm_hash = env
        .deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(
            &env,
            include_bytes!("../../../target/wasm32v1-none/release/clmm_pool.wasm"),
        ));

    factory_client.initialize(&admin, &wasm_hash, &position_manager);
    position_manager_client.initialize(
        &position_manager_admin,
        &factory_id,
        &soroban_sdk::String::from_str(&env, "RAUM LP Position"),
        &soroban_sdk::String::from_str(&env, "RAUM-LP"),
    );

    let pool_address = factory_client.create_pool(&token0, &token1, &3000, &0);

    let router_id = env.register_contract(None, Router);
    let router_client = RouterClient::new(&env, &router_id);
    let xlm_mock = Address::generate(&env);
    let router_admin = Address::generate(&env);
    router_client.initialize(&router_admin, &factory_id, &xlm_mock);

    // LP provisions liquidity.
    TokenClient::new(&env, &token0).approve(&lp, &pool_address, &1_000_000_000, &1000);
    TokenClient::new(&env, &token1).approve(&lp, &pool_address, &1_000_000_000, &1000);
    let _ = router_client.add_liquidity(&token0, &token1, &3000, &-60, &60, &1_000_000, &lp);

    // Attacker is explicit payer and grants allowance.
    TokenClient::new(&env, &token0).approve(&attacker, &pool_address, &5_000_000, &1000);

    let path = vec![
        &env,
        PathElement {
            token_in: token0.clone(),
            token_out: token1.clone(),
            fee: 3000,
        },
    ];

    let a0_before = TokenClient::new(&env, &token0).balance(&attacker);
    let a1_before = TokenClient::new(&env, &token1).balance(&attacker);
    let v0_before = TokenClient::new(&env, &token0).balance(&victim);
    let v1_before = TokenClient::new(&env, &token1).balance(&victim);

    let out =
        router_client.swap_exact_input(&path, &1000, &0, &attacker, &victim, &u64::MAX, &(0, 0));

    let a0_after = TokenClient::new(&env, &token0).balance(&attacker);
    let a1_after = TokenClient::new(&env, &token1).balance(&attacker);
    let v0_after = TokenClient::new(&env, &token0).balance(&victim);
    let v1_after = TokenClient::new(&env, &token1).balance(&victim);
    assert_eq!(a0_before - a0_after, 1000);
    assert_eq!(a1_after, a1_before);
    assert_eq!(v0_after, v0_before);
    assert_eq!(v1_after - v1_before, out);
}

#[test]
fn test_position_manager_collects_fees_after_router_swap() {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let (token0, token1) = if token0 < token1 {
        (token0, token1)
    } else {
        (token1, token0)
    };

    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    TokenAdminClient::new(&env, &token0).mint(&lp, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&lp, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token0).mint(&trader, &1_000_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&trader, &1_000_000_000_000);

    let factory_id = env.register_contract(None, Factory);
    let factory_client = FactoryClient::new(&env, &factory_id);
    let admin = Address::generate(&env);
    let position_manager = env.register_contract(None, PositionManager);
    let position_manager_client = PositionManagerClient::new(&env, &position_manager);
    let position_manager_admin = Address::generate(&env);

    let wasm_hash = env
        .deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(
            &env,
            include_bytes!("../../../target/wasm32v1-none/release/clmm_pool.wasm"),
        ));

    factory_client.initialize(&admin, &wasm_hash, &position_manager);
    position_manager_client.initialize(
        &position_manager_admin,
        &factory_id,
        &soroban_sdk::String::from_str(&env, "RAUM LP Position"),
        &soroban_sdk::String::from_str(&env, "RAUM-LP"),
    );

    let pool_address = factory_client.create_pool(&token0, &token1, &3000, &0);

    let router_id = env.register_contract(None, Router);
    let router_client = RouterClient::new(&env, &router_id);
    let xlm_mock = Address::generate(&env);
    let router_admin = Address::generate(&env);
    router_client.initialize(&router_admin, &factory_id, &xlm_mock);

    TokenClient::new(&env, &token0).approve(&lp, &pool_address, &1_000_000_000, &1000);
    TokenClient::new(&env, &token1).approve(&lp, &pool_address, &1_000_000_000, &1000);

    let (_, _, token_id) =
        router_client.add_liquidity(&token0, &token1, &3000, &-60, &60, &1_000_000, &lp);
    let token_id_u32 = token_id as u32;

    let path_0_to_1 = vec![
        &env,
        PathElement {
            token_in: token0.clone(),
            token_out: token1.clone(),
            fee: 3000,
        },
    ];

    let path_1_to_0 = vec![
        &env,
        PathElement {
            token_in: token1.clone(),
            token_out: token0.clone(),
            fee: 3000,
        },
    ];

    TokenClient::new(&env, &token0).approve(&trader, &pool_address, &1_000_000_000, &1000);
    TokenClient::new(&env, &token1).approve(&trader, &pool_address, &1_000_000_000, &1000);

    for _ in 0..10 {
        let _ = router_client.swap_exact_input(
            &path_0_to_1,
            &1_000,
            &0,
            &trader,
            &trader,
            &u64::MAX,
            &(0, 0),
        );
        let _ = router_client.swap_exact_input(
            &path_1_to_0,
            &1_000,
            &0,
            &trader,
            &trader,
            &u64::MAX,
            &(0, 0),
        );
    }

    let lp0_before = TokenClient::new(&env, &token0).balance(&lp);
    let lp1_before = TokenClient::new(&env, &token1).balance(&lp);

    let (fee0, fee1) = position_manager_client.collect(&pool_address, &lp, &token_id_u32);

    let lp0_after = TokenClient::new(&env, &token0).balance(&lp);
    let lp1_after = TokenClient::new(&env, &token1).balance(&lp);

    assert!(fee0 > 0 || fee1 > 0);
    assert_eq!(lp0_after - lp0_before, fee0 as i128);
    assert_eq!(lp1_after - lp1_before, fee1 as i128);
}
