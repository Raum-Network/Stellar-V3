#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::Address as _, vec, Address, Env, IntoVal,
    TryFromVal,
};

#[contracttype]
enum MockFactoryKey {
    Pool,
    PositionManager,
}

#[contract]
struct MockFactory;

#[contractimpl]
impl MockFactory {
    pub fn set_pool(env: Env, pool: Address) {
        env.storage().instance().set(&MockFactoryKey::Pool, &pool);
    }

    pub fn set_position_manager(env: Env, manager: Address) {
        env.storage()
            .instance()
            .set(&MockFactoryKey::PositionManager, &manager);
    }

    pub fn get_pool(env: Env, _token0: Address, _token1: Address, _fee: u32) -> Address {
        env.storage().instance().get(&MockFactoryKey::Pool).unwrap()
    }

    pub fn get_position_manager(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&MockFactoryKey::PositionManager)
            .unwrap()
    }
}

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

    pub fn swap(
        _env: Env,
        _payer: Address,
        _recipient: Address,
        zero_for_one: bool,
        amount_specified: i128,
        _sqrt_price_limit_x96: (u128, u128),
    ) -> (i128, i128) {
        if amount_specified > 0 {
            if zero_for_one {
                (amount_specified, -(amount_specified * 2))
            } else {
                (-(amount_specified * 2), amount_specified)
            }
        } else {
            let desired_out = -amount_specified;
            (desired_out * 2, amount_specified)
        }
    }
}

#[contract]
struct MockPositionManager;

#[contractimpl]
impl MockPositionManager {
    pub fn mint(
        _env: Env,
        _token_a: Address,
        _token_b: Address,
        _fee: u32,
        _to: Address,
        _tick_lower: i32,
        _tick_upper: i32,
        liquidity: u128,
    ) -> (u128, u128, u32) {
        (liquidity / 10 + 1, liquidity / 20 + 1, 7)
    }
}

fn setup() -> (Env, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register_contract(None, MockPool);
    let manager_id = env.register_contract(None, MockPositionManager);
    let factory_id = env.register_contract(None, MockFactory);
    let factory = MockFactoryClient::new(&env, &factory_id);
    factory.set_pool(&pool_id);
    factory.set_position_manager(&manager_id);

    let router_id = env.register_contract(None, Router);
    let router = RouterClient::new(&env, &router_id);
    let admin = Address::generate(&env);
    let xlm = Address::generate(&env);
    router.initialize(&admin, &factory_id, &xlm);

    let token_in = Address::generate(&env);
    let token_out = Address::generate(&env);
    let recipient = Address::generate(&env);

    (env, router_id, factory_id, token_in, token_out, recipient)
}

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let router_id = env.register_contract(None, Router);
    let client = RouterClient::new(&env, &router_id);

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let xlm = Address::generate(&env);

    client.initialize(&admin, &factory, &xlm);
}

#[test]
fn test_swap_exact_input_success() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let path = vec![
        &env,
        PathElement {
            token_in,
            token_out,
            fee: 3000,
        },
    ];

    let out = router.swap_exact_input(&path, &100, &0, &recipient, &recipient, &u64::MAX, &(0, 0));
    assert_eq!(out, 200);
}

#[test]
#[should_panic(expected = "amount_in must be positive")]
fn test_swap_exact_input_zero_amount_panics() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let path = vec![
        &env,
        PathElement {
            token_in,
            token_out,
            fee: 3000,
        },
    ];
    router.swap_exact_input(&path, &0, &0, &recipient, &recipient, &u64::MAX, &(0, 0));
}

#[test]
#[should_panic(expected = "Insufficient output amount")]
fn test_swap_exact_input_min_output_panics() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let path = vec![
        &env,
        PathElement {
            token_in,
            token_out,
            fee: 3000,
        },
    ];

    router.swap_exact_input(
        &path,
        &100,
        &201,
        &recipient,
        &recipient,
        &u64::MAX,
        &(0, 0),
    );
}

#[test]
#[should_panic(expected = "Only single-hop swaps supported")]
fn test_swap_exact_input_multi_hop_panics() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let third = Address::generate(&env);
    let path = vec![
        &env,
        PathElement {
            token_in: token_in.clone(),
            token_out: token_out.clone(),
            fee: 3000,
        },
        PathElement {
            token_in: token_out,
            token_out: third,
            fee: 3000,
        },
    ];

    router.swap_exact_input(&path, &100, &0, &recipient, &recipient, &u64::MAX, &(0, 0));
}

#[test]
#[should_panic(expected = "amount_out must be positive")]
fn test_swap_exact_output_zero_amount_panics() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let path = vec![
        &env,
        PathElement {
            token_in,
            token_out,
            fee: 3000,
        },
    ];
    router.swap_exact_output(&path, &0, &200, &recipient, &recipient, &u64::MAX, &(0, 0));
}

#[test]
fn test_swap_exact_output_success() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let path = vec![
        &env,
        PathElement {
            token_in,
            token_out,
            fee: 3000,
        },
    ];

    let required_in =
        router.swap_exact_output(&path, &50, &200, &recipient, &recipient, &u64::MAX, &(0, 0));
    assert_eq!(required_in, 100);
}

#[test]
#[should_panic(expected = "Excessive input amount")]
fn test_swap_exact_output_max_input_panics() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let path = vec![
        &env,
        PathElement {
            token_in,
            token_out,
            fee: 3000,
        },
    ];

    router.swap_exact_output(&path, &50, &99, &recipient, &recipient, &u64::MAX, &(0, 0));
}

#[test]
#[should_panic(expected = "Only single-hop swaps supported")]
fn test_swap_exact_output_multi_hop_panics() {
    let (env, router_id, _factory_id, token_in, token_out, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let third = Address::generate(&env);
    let path = vec![
        &env,
        PathElement {
            token_in: token_in.clone(),
            token_out: token_out.clone(),
            fee: 3000,
        },
        PathElement {
            token_in: token_out,
            token_out: third,
            fee: 3000,
        },
    ];

    router.swap_exact_output(&path, &50, &200, &recipient, &recipient, &u64::MAX, &(0, 0));
}

#[test]
fn test_add_liquidity_forwards_call() {
    let (env, router_id, _factory_id, token_a, token_b, recipient) = setup();
    let router = RouterClient::new(&env, &router_id);
    let (amount0, amount1, position_id) =
        router.add_liquidity(&token_a, &token_b, &3000, &-60, &60, &1_000, &recipient);
    assert_eq!(position_id, 7);
    assert!(amount0 > 0);
    assert!(amount1 > 0);
}

#[test]
fn test_contracttype_roundtrip() {
    let env = Env::default();
    let key = DataKey::Factory;
    let key_val: soroban_sdk::Val = key.into_val(&env);
    let _key_back = DataKey::try_from_val(&env, &key_val).unwrap();

    let elem = PathElement {
        token_in: Address::generate(&env),
        token_out: Address::generate(&env),
        fee: 3000,
    };
    let elem_val: soroban_sdk::Val = elem.clone().into_val(&env);
    let elem_back = PathElement::try_from_val(&env, &elem_val).unwrap();
    assert_eq!(elem_back.fee, 3000);

    let mock_key = MockFactoryKey::Pool;
    let mock_key_val: soroban_sdk::Val = mock_key.into_val(&env);
    let _mock_key_back = MockFactoryKey::try_from_val(&env, &mock_key_val).unwrap();
}
