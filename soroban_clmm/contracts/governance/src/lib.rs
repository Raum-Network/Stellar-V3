#![no_std]

mod test;

use soroban_sdk::token::Client as TokenClient;
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol, Val, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Executed,
    Defeated,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub title: String,
    pub desc: String,
    pub action: ProposalAction,
    pub vote_start: u64,
    pub vote_end: u64,
    pub for_votes: i128,
    pub against_votes: i128,
    pub status: ProposalStatus,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProposalAction {
    pub contract: Address,
    pub function: Symbol,
    pub args: Vec<Val>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct VoteRecord {
    pub support: bool, // true = for, false = against
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    ProposalCount,
    VotingToken, // Address of voting token (XLM)
    Proposal(u64),
    Vote(u64, Address), // (ProposalId, Voter) -> VoteRecord
}

#[contract]
pub struct Governance;

#[contractimpl]
impl Governance {
    pub fn initialize(env: Env, admin: Address, voting_token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::VotingToken, &voting_token);
        env.storage().instance().set(&DataKey::ProposalCount, &0u64);
    }

    pub fn propose(
        env: Env,
        proposer: Address,
        title: String,
        desc: String,
        action_contract: Address,
        action_function: Symbol,
        action_args: Vec<Val>,
        voting_period: u64,
    ) -> u64 {
        proposer.require_auth();

        // Check Proposal Threshold: 10 XLM (lowered for testnet)
        let token_addr: Address = env.storage().instance().get(&DataKey::VotingToken).unwrap();
        let client = TokenClient::new(&env, &token_addr);
        let balance = client.balance(&proposer);

        // 10 XLM with 7 decimals = 10 * 10^7 = 100,000,000 stroops
        let threshold = 100_000_000i128;

        if balance < threshold {
            panic!("Insufficient balance to propose (need 10 XLM)");
        }

        let mut count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0);
        count += 1;
        env.storage()
            .instance()
            .set(&DataKey::ProposalCount, &count);

        let now = env.ledger().timestamp();
        let proposal = Proposal {
            id: count,
            proposer,
            title,
            desc,
            action: ProposalAction {
                contract: action_contract,
                function: action_function,
                args: action_args,
            },
            vote_start: now,
            vote_end: now + voting_period,
            for_votes: 0,
            against_votes: 0,
            status: ProposalStatus::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(count), &proposal);
        count
    }

    pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
        voter.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .unwrap();
        let now = env.ledger().timestamp();

        if now > proposal.vote_end {
            panic!("Voting ended");
        }
        if matches!(
            proposal.status,
            ProposalStatus::Executed | ProposalStatus::Defeated
        ) {
            panic!("Proposal closed");
        }

        // Check existing vote
        let vote_key = DataKey::Vote(proposal_id, voter.clone());
        if let Some(record) = env
            .storage()
            .persistent()
            .get::<DataKey, VoteRecord>(&vote_key)
        {
            // Already voted. Check if within 3 days (259200 seconds) of ORIGINAL vote?
            // Or can they change it repeatedly? "Change their vote within 3 days of vote".
            // Interpretation: 3 days window applies to the *initial* vote time? or relative to *now* vs *initial*?
            // "Ability to change their vote within 3 days of vote".
            // Assuming: If I voted at T, I can change it until T + 3 days.

            let initial_vote_time = record.timestamp;
            if now > initial_vote_time + 259200 {
                panic!("Vote modification expired");
            }

            // Remove old vote weight
            let weight = 1; // Simplified 1-vote-per-person for V1
            if record.support {
                proposal.for_votes -= weight;
            } else {
                proposal.against_votes -= weight;
            }
        }

        // Add new vote
        let weight = 1;

        if support {
            proposal.for_votes += weight;
        } else {
            proposal.against_votes += weight;
        }

        let new_record = VoteRecord {
            support,
            timestamp: now,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage().persistent().set(&vote_key, &new_record);

        // Extend TTL
        env.storage()
            .persistent()
            .extend_ttl(&vote_key, 17280, 17280 * 30);
    }

    pub fn execute(env: Env, proposal_id: u64) {
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .unwrap();

        if env.ledger().timestamp() < proposal.vote_end {
            panic!("Voting still active");
        }
        if proposal.status != ProposalStatus::Active {
            panic!("Cannot execute");
        }

        if proposal.for_votes > proposal.against_votes {
            proposal.status = ProposalStatus::Executed;

            // Execute the action
            env.invoke_contract::<Val>(
                &proposal.action.contract,
                &proposal.action.function,
                proposal.action.args.clone(),
            );
        } else {
            proposal.status = ProposalStatus::Defeated;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .unwrap()
    }
}
