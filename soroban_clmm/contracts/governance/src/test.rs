#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Ledger},
    vec, Address, Env, IntoVal, TryFromVal, Val,
};

#[contracttype]
enum ActionKey {
    Calls,
}

#[contract]
struct ActionMock;

#[contractimpl]
impl ActionMock {
    pub fn ping(env: Env) {
        let calls: u32 = env.storage().instance().get(&ActionKey::Calls).unwrap_or(0);
        env.storage()
            .instance()
            .set(&ActionKey::Calls, &(calls + 1));
    }

    pub fn calls(env: Env) -> u32 {
        env.storage().instance().get(&ActionKey::Calls).unwrap_or(0)
    }
}

fn create_token_contract<'a>(e: &'a Env, admin: &Address) -> Address {
    e.register_stellar_asset_contract(admin.clone())
}

#[test]
fn test_governance_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    // Mint tokens to proposer (Need 100k)
    // 100k * 10^7 = 1,000,000,000,000
    token_client.mint(&proposer, &1_000_000_000_000);

    let contract_id = env.register_contract(None, Governance);
    let client = GovernanceClient::new(&env, &contract_id);

    client.initialize(&admin, &token_id);

    // Create a dummy proposal action
    let action_contract = Address::generate(&env);
    let action_fn = Symbol::new(&env, "dummy_fn");
    let args: Vec<Val> = vec![&env];

    // Propose should succeed
    let proposal_id = client.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &action_contract,
        &action_fn,
        &args,
        &1000, // voting period
    );

    assert_eq!(proposal_id, 1);

    // Vote 1 (Support)
    client.vote(&voter, &proposal_id, &true);

    // Verify Vote
    let proposal = client.get_proposal(&proposal_id);
    // Need to expose get_proposal? Yes, we did.

    // Change Vote (Against) - Should succeed (Time hasn't passed)
    client.vote(&voter, &proposal_id, &false);

    // Time travel > 3 days (259200 seconds)
    // env.ledger().set_timestamp(env.ledger().timestamp() + 259201);
    // client.vote(...) -> Should panic
}

#[test]
#[should_panic(expected = "Insufficient balance to propose")]
fn test_proposal_threshold_failure() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_id = create_token_contract(&env, &token_admin);
    // No minting

    let contract_id = env.register_contract(None, Governance);
    let client = GovernanceClient::new(&env, &contract_id);

    client.initialize(&admin, &token_id);

    let action_contract = Address::generate(&env);
    let action_fn = Symbol::new(&env, "dummy_fn");
    let args: Vec<Val> = vec![&env];

    client.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &action_contract,
        &action_fn,
        &args,
        &1000,
    );
}

#[test]
fn test_vote_modification_success() {
    let env = Env::default();
    env.mock_all_auths();

    // Setup
    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let contract_id = env.register_contract(None, Governance);
    let client = GovernanceClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id);

    let proposal_id = client.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &Address::generate(&env),
        &Symbol::new(&env, "fn"),
        &vec![&env],
        &500_000,
    );

    // Voter votes at T=0
    client.vote(&voter, &proposal_id, &true);

    // Change Vote (Against) - Should succeed within window
    // (Time hasn't passed much)
    client.vote(&voter, &proposal_id, &false);
}

#[test]
#[should_panic(expected = "Vote modification expired")]
fn test_vote_modification_failure_after_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    // Setup
    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let contract_id = env.register_contract(None, Governance);
    let client = GovernanceClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id);

    let proposal_id = client.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &Address::generate(&env),
        &Symbol::new(&env, "fn"),
        &vec![&env],
        &500_000,
    );

    // Voter votes at T=0
    client.vote(&voter, &proposal_id, &true);

    // Advance time by 3 days + 1 second
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + 259200 + 1);

    // Try to change vote -> Should panic
    client.vote(&voter, &proposal_id, &false);
}

#[test]
fn test_execute_success_path_sets_executed_and_invokes_action() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let action_id = env.register_contract(None, ActionMock);
    let action_client = ActionMockClient::new(&env, &action_id);

    let governance_id = env.register_contract(None, Governance);
    let governance = GovernanceClient::new(&env, &governance_id);
    governance.initialize(&admin, &token_id);

    let proposal_id = governance.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &action_id,
        &Symbol::new(&env, "ping"),
        &vec![&env],
        &100,
    );
    governance.vote(&voter, &proposal_id, &true);
    env.ledger().set_timestamp(env.ledger().timestamp() + 101);
    governance.execute(&proposal_id);

    let proposal = governance.get_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Executed);
    assert_eq!(action_client.calls(), 1);
}

#[test]
fn test_execute_defeat_path_sets_defeated() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let governance_id = env.register_contract(None, Governance);
    let governance = GovernanceClient::new(&env, &governance_id);
    governance.initialize(&admin, &token_id);

    let proposal_id = governance.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &Address::generate(&env),
        &Symbol::new(&env, "noop"),
        &vec![&env],
        &100,
    );
    governance.vote(&voter, &proposal_id, &false);
    env.ledger().set_timestamp(env.ledger().timestamp() + 101);
    governance.execute(&proposal_id);

    let proposal = governance.get_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Defeated);
}

#[test]
#[should_panic(expected = "Voting still active")]
fn test_execute_while_active_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let governance_id = env.register_contract(None, Governance);
    let governance = GovernanceClient::new(&env, &governance_id);
    governance.initialize(&admin, &token_id);

    let proposal_id = governance.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &Address::generate(&env),
        &Symbol::new(&env, "noop"),
        &vec![&env],
        &1000,
    );
    governance.execute(&proposal_id);
}

#[test]
#[should_panic(expected = "Voting ended")]
fn test_vote_after_execution_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let action_id = env.register_contract(None, ActionMock);
    let governance_id = env.register_contract(None, Governance);
    let governance = GovernanceClient::new(&env, &governance_id);
    governance.initialize(&admin, &token_id);

    let proposal_id = governance.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &action_id,
        &Symbol::new(&env, "ping"),
        &vec![&env],
        &100,
    );
    governance.vote(&voter, &proposal_id, &true);
    env.ledger().set_timestamp(env.ledger().timestamp() + 101);
    governance.execute(&proposal_id);
    governance.vote(&voter, &proposal_id, &true);
}

#[test]
#[should_panic(expected = "Cannot execute")]
fn test_execute_twice_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = create_token_contract(&env, &token_admin);
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&proposer, &1_000_000_000_000);

    let action_id = env.register_contract(None, ActionMock);
    let governance_id = env.register_contract(None, Governance);
    let governance = GovernanceClient::new(&env, &governance_id);
    governance.initialize(&admin, &token_id);

    let proposal_id = governance.propose(
        &proposer,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Desc"),
        &action_id,
        &Symbol::new(&env, "ping"),
        &vec![&env],
        &100,
    );
    governance.vote(&voter, &proposal_id, &true);
    env.ledger().set_timestamp(env.ledger().timestamp() + 101);
    governance.execute(&proposal_id);
    governance.execute(&proposal_id);
}

#[test]
fn test_contracttype_roundtrip() {
    let env = Env::default();
    let action = ProposalAction {
        contract: Address::generate(&env),
        function: Symbol::new(&env, "ping"),
        args: vec![&env],
    };

    let proposal = Proposal {
        id: 1,
        proposer: Address::generate(&env),
        title: String::from_str(&env, "Title"),
        desc: String::from_str(&env, "Desc"),
        action,
        vote_start: 10,
        vote_end: 20,
        for_votes: 1,
        against_votes: 0,
        status: ProposalStatus::Active,
    };

    let proposal_val: soroban_sdk::Val = proposal.clone().into_val(&env);
    let proposal_back = Proposal::try_from_val(&env, &proposal_val).unwrap();
    assert_eq!(proposal_back.id, 1);

    let status_val: soroban_sdk::Val = ProposalStatus::Defeated.into_val(&env);
    let status_back = ProposalStatus::try_from_val(&env, &status_val).unwrap();
    assert_eq!(status_back, ProposalStatus::Defeated);

    let vote = VoteRecord {
        support: true,
        timestamp: 123,
    };
    let vote_val: soroban_sdk::Val = vote.clone().into_val(&env);
    let vote_back = VoteRecord::try_from_val(&env, &vote_val).unwrap();
    assert!(vote_back.support);

    let key = DataKey::Vote(1, Address::generate(&env));
    let key_val: soroban_sdk::Val = key.into_val(&env);
    let _key_back = DataKey::try_from_val(&env, &key_val).unwrap();

    let action_key = ActionKey::Calls;
    let action_key_val: soroban_sdk::Val = action_key.into_val(&env);
    let _action_key_back = ActionKey::try_from_val(&env, &action_key_val).unwrap();
}
