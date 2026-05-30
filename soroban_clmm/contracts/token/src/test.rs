#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, String, TryFromVal};

fn setup_token(env: &Env) -> (TokenClient<'_>, Address, Address, Address, Address) {
    env.mock_all_auths();

    let contract_id = env.register_contract(None, Token);
    let client = TokenClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let user = Address::generate(env);
    let spender = Address::generate(env);
    let recipient = Address::generate(env);

    client.initialize(
        &admin,
        &7,
        &String::from_str(env, "RAUM Token"),
        &String::from_str(env, "RAUM"),
    );

    (client, admin, user, spender, recipient)
}

#[test]
fn test_initialize_and_metadata() {
    let env = Env::default();
    let (client, _admin, _user, _spender, _recipient) = setup_token(&env);

    assert_eq!(client.decimals(), 7);
    assert_eq!(client.name(), String::from_str(&env, "RAUM Token"));
    assert_eq!(client.symbol(), String::from_str(&env, "RAUM"));
}

#[test]
fn test_mint_and_transfer() {
    let env = Env::default();
    let (client, _admin, user, _spender, recipient) = setup_token(&env);

    client.mint(&user, &1_000);
    assert_eq!(client.balance(&user), 1_000);

    client.transfer(&user, &recipient, &250);
    assert_eq!(client.balance(&user), 750);
    assert_eq!(client.balance(&recipient), 250);
}

#[test]
fn test_approve_and_transfer_from() {
    let env = Env::default();
    let (client, _admin, user, spender, recipient) = setup_token(&env);

    client.mint(&user, &2_000);
    client.approve(&user, &spender, &700, &100);
    assert_eq!(client.allowance(&user, &spender), 700);

    client.transfer_from(&spender, &user, &recipient, &300);

    assert_eq!(client.balance(&user), 1_700);
    assert_eq!(client.balance(&recipient), 300);
    assert_eq!(client.allowance(&user, &spender), 400);
}

#[test]
#[should_panic(expected = "insufficient allowance")]
fn test_transfer_from_insufficient_allowance_panics() {
    let env = Env::default();
    let (client, _admin, user, spender, recipient) = setup_token(&env);

    client.mint(&user, &100);
    client.approve(&user, &spender, &50, &100);
    client.transfer_from(&spender, &user, &recipient, &60);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_insufficient_balance_panics() {
    let env = Env::default();
    let (client, _admin, user, _spender, recipient) = setup_token(&env);

    client.mint(&user, &10);
    client.transfer(&user, &recipient, &20);
}

#[test]
fn test_contracttype_roundtrip() {
    let env = Env::default();
    let key = DataKey::Allowance(Address::generate(&env), Address::generate(&env));
    let key_val: soroban_sdk::Val = key.into_val(&env);
    let _key_back = DataKey::try_from_val(&env, &key_val).unwrap();
}
