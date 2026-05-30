#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, Env, IntoVal, TryFromVal,
};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let position_manager = Address::generate(&env);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
}

#[test]
fn test_mint() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1000000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1000000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );

    // Mint position -100 to 100
    // tick spacing is 60, so we must use valid ticks: -60, 60
    client.mint(&user, &-60, &60, &1000000);
}

#[test]
#[should_panic(expected = "Invalid tick range")]
fn test_mint_invalid_range() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    client.mint(&user, &100, &-100, &1000);
}

#[test]
fn test_swap() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    // Mint tokens to user so they can swap
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1000000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1000000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    client.mint(&user, &-60, &60, &1000000); // 1 unit logic

    // Allow pool contract to spend token0 for swap input.
    let token0_client = soroban_sdk::token::Client::new(&env, &token0);
    token0_client.approve(&user, &client.address, &100_000, &1000);

    // Swap 0 -> 1
    // Price starts at 1.0 (tick 0)
    // We swap enough input to avoid rounding to zero on output.
    let limit_tuple = (0, 4295128740); // MIN SQRT RATIO approx

    let (amount0, amount1) = client.swap(
        &user,
        &user,
        &true, // zero_for_one
        &10_000,
        &limit_tuple,
    );

    // Check amounts
    // Swap may stop early if price limit is reached.
    assert!(amount0 > 0);
    assert!(amount0 <= 10_000);
    let _ = amount1;
}

#[test]
fn test_oracle_init() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let position_manager = Address::generate(&env);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );

    // observe current
    let obs = client.observe(&vec![&env, 0]);
    assert_eq!(obs.len(), 1);
    // tick cumulative should be 0 at init with 0 tick
}

#[test]
fn test_math_monotonicity() {
    // Verify that tick_to_sqrt_price_x96 is monotonic
    // P(-60) > P(-120) > P(-180)

    use crate::math::tick_to_sqrt_price_x96;

    let p_0 = tick_to_sqrt_price_x96(0);
    let p_neg_60 = tick_to_sqrt_price_x96(-60);
    let p_neg_120 = tick_to_sqrt_price_x96(-120);
    let p_neg_240 = tick_to_sqrt_price_x96(-240);

    // Q96 = 79228162514264337593543950336
    // p_neg_60 should be < p_0 (since price at negative tick is < 1.0)
    // Wait. 1.0001^-60 < 1.
    // So sqrt(1.0001^-60) < 1.
    assert!(p_neg_60 < p_0);

    // p_neg_120 should be < p_neg_60
    assert!(p_neg_120 < p_neg_60);

    assert!(p_neg_240 < p_neg_120);
}

#[test]
fn test_tick_math_zero_matches_q96() {
    let q96 = crate::math::tick_to_sqrt_price_x96(0);
    assert_eq!(
        q96,
        ethnum::u256::new(79_228_162_514_264_337_593_543_950_336)
    );
}

#[test]
fn test_tick_math_extreme_bounds_are_ordered() {
    let p_min = crate::math::tick_to_sqrt_price_x96(-887_220);
    let p_zero = crate::math::tick_to_sqrt_price_x96(0);
    let p_max = crate::math::tick_to_sqrt_price_x96(887_220);

    assert!(p_min > ethnum::u256::new(0));
    assert!(p_min < p_zero);
    assert!(p_zero < p_max);
}

#[test]
fn test_full_range_amount_ratio_tracks_target_price() {
    // tick ~ 18_300 corresponds to ~0.16 USDC/XLM when token0=USDC and token1=XLM.
    // For a full-range position, token1/token0 deposited should stay near ~6.25.
    let (amount0, amount1) =
        crate::math::calc_amount_from_liquidity(3_125_000_000_000u128, -887_220, 887_220, 18_300);

    assert!(amount0 > 0);
    assert!(amount1 > 0);

    let ratio = (amount1 as f64) / (amount0 as f64);
    assert!(
        ratio > 5.5 && ratio < 7.0,
        "unexpected token1/token0 ratio: {ratio}"
    );
}

#[test]
fn test_mint_insolvency() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);

    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    // Fund user
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &10_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &10_000_000_000);

    // Init Pool: Tick 0, Spacing 60
    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );

    // Mint Liquidity: Range [-60, 60], Liquidity 1_000_000
    // Current tick 0 is in range.
    // Price at tick 0 is 1.0.
    // Amount0 ~= L / sqrt(P) * (sqrt(P) - sqrt(PL)) ... complex formula.
    // But since P=1, we expect symmetric-ish amounts if range is symmetric around 0?
    // Wait, Tick 0 is exactly 1.0. -60 is < 1.0. 60 is > 1.0.
    // So we should need both tokens.

    let (a0, a1, _) = client.mint(&user, &-60, &60, &1_000_000);

    // Check Pool Balances
    let pool_address = client.address;
    let t0_client = soroban_sdk::token::Client::new(&env, &token0);
    let t1_client = soroban_sdk::token::Client::new(&env, &token1);

    let b0 = t0_client.balance(&pool_address);
    let b1 = t1_client.balance(&pool_address);

    // Ensure we minted something > 0
    assert!(a0 > 0);
    assert!(a1 > 0);

    // Verify balances match minted amounts
    assert_eq!(b0, a0 as i128, "Token 0 balance mismatch");
    assert_eq!(b1, a1 as i128, "Token 1 balance mismatch");

    assert!(b0 > 0, "Pool has 0 balance for Token 0");
    assert!(b1 > 0, "Pool has 0 balance for Token 1");
}

#[test]
fn test_mint_small_liquidity() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );

    // Mint VERY small liquidity.
    // If we simply truncated, we might get 0.
    // L=10. Range [0, 60].
    // Current=0.
    // amount0 > 0. amount1 = 0 (since current <= lower is false, current >= upper false).
    // range [0, 60] means Lower=0, Upper=60. Current=0.
    // prop=sqrt(P)=1.
    // amount0 = L * (1/1 - 1/sqrt(Upper)) > 0.
    // amount1 = L * (1 - 1) = 0.
    // Wait. If range [0, 60]. Lower=0 (P=1). Upper=60 (P>1).
    // Current=0 (P=1).
    // Split branch.
    // amount0 = L * (sqrt(Upper) - sqrt(Current)) / ...
    // amount1 = L * (sqrt(Current) - sqrt(Lower)) = L * (1-1) = 0.
    // So amount1 IS 0. This is correct?
    // Yes, if price is exactly at Lower tick, we hold all Token0.

    // Let's use range [-60, 60]. Current 0.
    // amount0 > 0, amount1 > 0.
    // L=1.
    // Diff P(0) and P(-60) is small.
    // 0.003
    // L*0.003 approx 0.003.
    // Floor = 0.
    // Ceiling = 1.

    let (a0, a1, _) = client.mint(&user, &-60, &60, &1);

    // With fix, a0 should be >= 1, a1 >= 1.
    assert!(a0 >= 1, "Amount 0 should round up to at least 1");
    assert!(a1 >= 1, "Amount 1 should round up to at least 1");
}

#[test]
fn test_remove_liquidity_transfers_tokens_back() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &10_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &10_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.mint(&user, &-60, &60, &1_000_000);

    let token0_client = TokenClient::new(&env, &token0);
    let token1_client = TokenClient::new(&env, &token1);
    let before0 = token0_client.balance(&user);
    let before1 = token1_client.balance(&user);

    let (out0, out1) = client.remove_liquidity(&user, &-60, &60, &500_000);
    assert!(out0 > 0);
    assert!(out1 > 0);

    let after0 = token0_client.balance(&user);
    let after1 = token1_client.balance(&user);
    assert!(after0 > before0);
    assert!(after1 > before1);
}

#[test]
fn test_collect_fees_without_accrual_is_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let (f0, f1, next0, next1) =
        client.collect_fees(&user, &-60, &60, &1_000_000, &(0, 0), &(0, 0));
    assert_eq!((f0, f1), (0, 0));
    assert_eq!(next0, (0, 0));
    assert_eq!(next1, (0, 0));
}

#[test]
fn test_collect_fees_after_swap_accrues_for_in_range_liquidity() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let liquidity = 1_000_000u128;
    let tick_lower = -887_220i32;
    let tick_upper = 887_220i32;
    let _ = client.mint(&user, &tick_lower, &tick_upper, &liquidity);

    TokenClient::new(&env, &token0).approve(&user, &client.address, &200_000, &1000);
    let low_limit = (0, 4295128740);
    let _ = client.swap(&user, &user, &true, &20_000, &low_limit);

    let state = client.get_state();
    assert!(state.fees_uncollected_0 > 0);
    assert_eq!(state.fees_uncollected_1, 0);

    let (inside0, inside1) = client.get_fee_growth_inside(&tick_lower, &tick_upper);
    assert!(inside0 != (0, 0));
    assert_eq!(inside1, (0, 0));

    let token0_client = TokenClient::new(&env, &token0);
    let pre_collect_token0 = token0_client.balance(&user);
    let (fee0, fee1, next0, next1) = client.collect_fees(
        &user,
        &tick_lower,
        &tick_upper,
        &liquidity,
        &(0, 0),
        &(0, 0),
    );
    let post_collect_token0 = token0_client.balance(&user);

    assert!(fee0 > 0);
    assert_eq!(fee1, 0);
    assert_eq!(next0, inside0);
    assert_eq!(next1, inside1);
    assert_eq!(post_collect_token0 - pre_collect_token0, fee0 as i128);
}

#[test]
fn test_swap_one_for_zero_path() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.mint(&user, &-60, &60, &1_000_000);

    TokenClient::new(&env, &token1).approve(&user, &client.address, &100_000, &1000);

    let high_limit = crate::math::u256_to_tuple(crate::math::tick_to_sqrt_price_x96(1_000));
    let (amount0, amount1) = client.swap(&user, &user, &false, &10_000, &high_limit);
    assert!(amount1 > 0);
    assert!(amount0 < 0);
}

#[test]
#[should_panic(expected = "Insufficient pool token0 balance for swap output")]
fn test_swap_panics_when_pool_output_token_balance_is_insufficient() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;

    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.mint(&user, &-60, &60, &1_000_000);

    let token0_client = TokenClient::new(&env, &token0);
    let token1_client = TokenClient::new(&env, &token1);

    // Drain token0 from the pool so a token1->token0 swap cannot settle output transfer.
    let pool_token0_balance = token0_client.balance(&client.address);
    token0_client.transfer(&client.address, &user, &pool_token0_balance);

    token1_client.approve(&user, &client.address, &100_000, &1000);

    let high_limit = crate::math::u256_to_tuple(crate::math::tick_to_sqrt_price_x96(1_000));
    let _ = client.swap(&user, &user, &false, &10_000, &high_limit);
}

#[test]
#[should_panic(expected = "Use PositionManager.burn() with NFT-based positions")]
fn test_legacy_burn_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let _ = client.burn(&user, &1, &1_000);
}

#[test]
#[should_panic(expected = "Use PositionManager.collect() with NFT-based positions")]
fn test_legacy_collect_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let _ = client.collect(&user, &1);
}

#[test]
fn test_observe_multiple_windows() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.mint(&user, &-60, &60, &1_000_000);
    TokenClient::new(&env, &token0).approve(&user, &client.address, &1_000_000, &1000);

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    let low_limit = (0, 4295128740);
    let _ = client.swap(&user, &user, &true, &20_000, &low_limit);
    env.ledger().set_timestamp(env.ledger().timestamp() + 10);

    let windows = vec![&env, 0u32, 5u32, 15u32];
    let obs = client.observe(&windows);
    assert_eq!(obs.len(), 3);
}

#[test]
fn test_oracle_cardinality_next_growth() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let n1 = client.increase_obs_cardinality_next(&16);
    assert_eq!(n1, 16);
    let n2 = client.increase_obs_cardinality_next(&8);
    assert_eq!(n2, 16);

    let initial_cfg = client.get_oracle_config();
    assert_eq!(initial_cfg.cardinality, 1);
    assert_eq!(initial_cfg.cardinality_next, 16);

    let _ = client.mint(&user, &-60, &60, &1_000_000);
    TokenClient::new(&env, &token0).approve(&user, &client.address, &500_000, &1000);

    env.ledger().set_timestamp(env.ledger().timestamp() + 5);
    let low_limit = (0, 4295128740);
    let _ = client.swap(&user, &user, &true, &2_000, &low_limit);

    let grown_cfg = client.get_oracle_config();
    assert!(grown_cfg.cardinality > 1);
    assert!(grown_cfg.cardinality <= grown_cfg.cardinality_next);
    assert_eq!(grown_cfg.cardinality_next, 16);

    let windows = vec![&env, 0u32, 2u32, 5u32];
    let obs = client.observe(&windows);
    assert_eq!(obs.len(), 3);
}

#[test]
fn test_oracle_ring_wrap_stress_observe() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &10_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &10_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.increase_obs_cardinality_next(&32);

    // Seed enough in-range liquidity and swap allowance.
    let _ = client.mint(&user, &-60, &60, &1_000_000_000);
    TokenClient::new(&env, &token0).approve(&user, &client.address, &5_000_000_000, &1000);
    TokenClient::new(&env, &token1).approve(&user, &client.address, &5_000_000_000, &1000);

    let low_limit = (0, 4295128740);
    let high_limit = crate::math::u256_to_tuple(crate::math::tick_to_sqrt_price_x96(1_000));

    // Alternate swap direction to produce many oracle writes without exhausting one side quickly.
    for i in 0..40u64 {
        env.ledger().set_timestamp(env.ledger().timestamp() + 1);
        if i % 2 == 0 {
            let _ = client.swap(&user, &user, &true, &500, &low_limit);
        } else {
            let _ = client.swap(&user, &user, &false, &500, &high_limit);
        }
    }

    let cfg = client.get_oracle_config();
    assert!(cfg.cardinality > 1);
    assert!(cfg.cardinality <= cfg.cardinality_next);
    assert!(cfg.cardinality <= 32);

    let windows = vec![&env, 0u32, 1u32, 3u32, 7u32, 15u32, 25u32];
    let obs = client.observe(&windows);
    assert_eq!(obs.len(), 6);
}

#[test]
fn test_swap_exact_output_fills_and_charges_input() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token0 = env.register_stellar_asset_contract(token_admin.clone());
    let token1 = env.register_stellar_asset_contract(token_admin.clone());
    let user = Address::generate(&env);
    let position_manager = Address::generate(&env);

    use soroban_sdk::token::Client as TokenClient;
    use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
    TokenAdminClient::new(&env, &token0).mint(&user, &1_000_000_000);
    TokenAdminClient::new(&env, &token1).mint(&user, &1_000_000_000);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.mint(&user, &-60, &60, &1_000_000);
    TokenClient::new(&env, &token1).approve(&user, &client.address, &1_000_000, &1000);

    let t0 = TokenClient::new(&env, &token0);
    let t1 = TokenClient::new(&env, &token1);
    let pre0 = t0.balance(&user);
    let pre1 = t1.balance(&user);

    // amount_specified < 0 means exact-output style call in this pool API.
    let high_limit = crate::math::u256_to_tuple(crate::math::tick_to_sqrt_price_x96(1_000));
    let target_out = 100i128;
    let (a0, a1) = client.swap(&user, &user, &false, &-target_out, &high_limit);

    let post0 = t0.balance(&user);
    let post1 = t1.balance(&user);

    assert_eq!(a0, -target_out);
    assert!(a1 > 0);
    assert_eq!(post0 - pre0, target_out);
    assert_eq!(pre1 - post1, a1);
}

#[test]
#[should_panic(expected = "Too many observe windows")]
fn test_observe_windows_limit_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let position_manager = Address::generate(&env);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let windows = vec![&env, 0u32, 0u32, 0u32, 0u32, 0u32, 0u32, 0u32, 0u32, 0u32];
    let _ = client.observe(&windows);
}

#[test]
#[should_panic(expected = "Cardinality exceeds max")]
fn test_increase_observation_cardinality_next_limit_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Pool);
    let client = PoolClient::new(&env, &contract_id);
    let factory = Address::generate(&env);
    let token0 = Address::generate(&env);
    let token1 = Address::generate(&env);
    let position_manager = Address::generate(&env);

    client.initialize(
        &factory,
        &token0,
        &token1,
        &3000,
        &60,
        &0,
        &position_manager,
    );
    let _ = client.increase_obs_cardinality_next(&2_000);
}

#[test]
fn test_contracttype_roundtrip() {
    let env = Env::default();

    let state = crate::types::PoolState {
        factory: Address::generate(&env),
        token0: Address::generate(&env),
        token1: Address::generate(&env),
        fee: 3000,
        tick_spacing: 60,
        current_tick: 0,
        liquidity: 123,
        sqrt_price_x96: (0, 1),
        protocol_fee: 0,
        fees_uncollected_0: 0,
        fees_uncollected_1: 0,
        protocol_fees_0: 0,
        protocol_fees_1: 0,
        max_tick_crosses_per_swap: 256,
        paused: false,
        position_manager: Address::generate(&env),
    };
    let state_val: soroban_sdk::Val = state.clone().into_val(&env);
    let state_back = crate::types::PoolState::try_from_val(&env, &state_val).unwrap();
    assert_eq!(state_back.fee, 3000);

    let tick = crate::types::TickData {
        liquidity_gross: 1,
        liquidity_net: -1,
        fee_growth_outside_0: (0, 0),
        fee_growth_outside_1: (0, 0),
        tick_cumulative_outside: 0,
        liquidity_cumulative_outside: 0,
        initialized: true,
    };
    let tick_val: soroban_sdk::Val = tick.clone().into_val(&env);
    let tick_back = crate::types::TickData::try_from_val(&env, &tick_val).unwrap();
    assert!(tick_back.initialized);

    let obs = crate::types::Observation {
        timestamp: 1,
        tick_cumulative: 2,
        liquidity_cumulative: 3,
        initialized: true,
    };
    let obs_val: soroban_sdk::Val = obs.clone().into_val(&env);
    let obs_back = crate::types::Observation::try_from_val(&env, &obs_val).unwrap();
    assert_eq!(obs_back.timestamp, 1);

    let oracle = crate::types::OracleConfig {
        index: 0,
        cardinality: 1,
        cardinality_next: 2,
    };
    let oracle_val: soroban_sdk::Val = oracle.clone().into_val(&env);
    let oracle_back = crate::types::OracleConfig::try_from_val(&env, &oracle_val).unwrap();
    assert_eq!(oracle_back.cardinality_next, 2);

    let key = crate::types::DataKey::TickData(10);
    let key_val: soroban_sdk::Val = key.into_val(&env);
    let _key_back = crate::types::DataKey::try_from_val(&env, &key_val).unwrap();
}
