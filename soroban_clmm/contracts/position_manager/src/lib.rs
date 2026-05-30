#![no_std]

mod test;

use soroban_sdk::{
    contract, contractimpl, contracttype, vec, Address, Env, IntoVal, String, Symbol, Val, Vec,
};
use stellar_macros::default_impl;
use stellar_tokens::non_fungible::{
    enumerable::{Enumerable, NonFungibleEnumerable},
    Base, NonFungibleToken,
};

/// Position data stored as NFT metadata
#[contracttype]
#[derive(Clone, Debug)]
pub struct PositionData {
    pub pool: Address,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity: u128,
    pub fees_owed_0: u128,
    pub fees_owed_1: u128,
    pub fee_growth_inside_0_last: (u128, u128),
    pub fee_growth_inside_1_last: (u128, u128),
}

/// Storage keys for the contract
#[contracttype]
pub enum DataKey {
    Admin,
    Factory,
    Position(u32),
}

#[contract]
pub struct PositionManager;

const MAX_OWNED_TOKENS_PAGE_SIZE: u32 = 25;
const POSITION_TTL_THRESHOLD: u32 = 17_280;
const POSITION_TTL_BUMP: u32 = 17_280 * 90;

fn touch_position_ttl(env: &Env, token_id: u32) {
    let key = DataKey::Position(token_id);
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, POSITION_TTL_THRESHOLD, POSITION_TTL_BUMP);
    }
}

fn set_position_data(env: &Env, token_id: u32, position: &PositionData) {
    env.storage()
        .persistent()
        .set(&DataKey::Position(token_id), position);
    touch_position_ttl(env, token_id);
}

#[contractimpl]
impl PositionManager {
    // ========== Initialization ==========

    pub fn initialize(env: Env, admin: Address, factory: Address, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Factory, &factory);

        // Base URI for wallets
        let base_uri = String::from_str(&env, "https://clmm.raum.network/positions/");
        Base::set_metadata(&env, base_uri, name, symbol);
    }

    // ========== Position Management ==========

    /// Mint a new position NFT
    pub fn mint(
        env: Env,
        token_a: Address,
        token_b: Address,
        fee: u32,
        to: Address,
        tick_lower: i32,
        tick_upper: i32,
        liquidity: u128,
    ) -> (u128, u128, u32) {
        to.require_auth();
        if token_a == token_b {
            panic!("Identical token addresses");
        }
        if liquidity == 0 {
            panic!("Liquidity must be positive");
        }
        if liquidity > i128::MAX as u128 {
            panic!("Liquidity too large");
        }
        if tick_lower >= tick_upper {
            panic!("Invalid tick range");
        }

        let factory: Address = env.storage().instance().get(&DataKey::Factory).unwrap();

        // Sort tokens
        let (token0, token1) = if token_a < token_b {
            (token_a.clone(), token_b.clone())
        } else {
            (token_b.clone(), token_a.clone())
        };

        // Get pool address from factory
        let pool: Address = env.invoke_contract(
            &factory,
            &Symbol::new(&env, "get_pool"),
            vec![&env, token0.to_val(), token1.to_val(), fee.into_val(&env)],
        );

        // Mint the NFT sequentially (OpenZeppelin enumerable)
        let token_id: u32 = Enumerable::sequential_mint(&env, &to);

        // Call Pool to add liquidity (Pool will transfer tokens from 'to')
        let args: Vec<Val> = vec![
            &env,
            to.to_val(),
            tick_lower.into_val(&env),
            tick_upper.into_val(&env),
            liquidity.into_val(&env),
        ];

        let (amount0, amount1): (u128, u128) =
            env.invoke_contract(&pool, &Symbol::new(&env, "add_liquidity"), args);

        let growth_args: Vec<Val> =
            vec![&env, tick_lower.into_val(&env), tick_upper.into_val(&env)];
        let (fee_growth_inside_0_last, fee_growth_inside_1_last): ((u128, u128), (u128, u128)) =
            env.invoke_contract(
                &pool,
                &Symbol::new(&env, "get_fee_growth_inside"),
                growth_args,
            );

        // Create position data
        let position = PositionData {
            pool: pool.clone(),
            tick_lower,
            tick_upper,
            liquidity,
            fees_owed_0: 0,
            fees_owed_1: 0,
            fee_growth_inside_0_last,
            fee_growth_inside_1_last,
        };

        // Store position as NFT metadata
        set_position_data(&env, token_id, &position);

        (amount0, amount1, token_id)
    }

    /// Burn liquidity from a position
    pub fn burn(
        env: Env,
        pool: Address,
        to: Address,
        token_id: u32,
        liquidity: u128,
    ) -> (u128, u128) {
        if liquidity == 0 {
            panic!("Liquidity must be positive");
        }
        // Verify ownership
        let owner = <PositionManager as NonFungibleToken>::owner_of(&env, token_id);
        if owner != to {
            panic!("Not the owner");
        }

        // Get position data
        let mut position: PositionData = env
            .storage()
            .persistent()
            .get(&DataKey::Position(token_id))
            .expect("Position not found");

        if position.pool != pool {
            panic!("Wrong pool");
        }

        if position.liquidity < liquidity {
            panic!("Insufficient liquidity");
        }

        let is_full_burn = position.liquidity == liquidity;

        // For partial burns we must auth explicitly. For full burns, Enumerable::burn
        // performs the auth check, so we avoid duplicate auth in the same frame.
        if !is_full_burn {
            to.require_auth();
        }

        // Realize pending fees with the current liquidity before changing position liquidity.
        let collect_args: Vec<Val> = vec![
            &env,
            to.to_val(),
            position.tick_lower.into_val(&env),
            position.tick_upper.into_val(&env),
            position.liquidity.into_val(&env),
            position.fee_growth_inside_0_last.into_val(&env),
            position.fee_growth_inside_1_last.into_val(&env),
        ];
        let (_fee0, _fee1, next_growth0, next_growth1): (u128, u128, (u128, u128), (u128, u128)) =
            env.invoke_contract(&pool, &Symbol::new(&env, "collect_fees"), collect_args);
        position.fee_growth_inside_0_last = next_growth0;
        position.fee_growth_inside_1_last = next_growth1;
        position.fees_owed_0 = 0;
        position.fees_owed_1 = 0;

        // Call Pool to remove liquidity
        let args: Vec<Val> = vec![
            &env,
            to.to_val(),
            position.tick_lower.into_val(&env),
            position.tick_upper.into_val(&env),
            liquidity.into_val(&env),
        ];

        let (amount0, amount1): (u128, u128) =
            env.invoke_contract(&pool, &Symbol::new(&env, "remove_liquidity"), args);

        // Update position
        position.liquidity -= liquidity;

        if position.liquidity == 0 {
            // Burn the NFT
            Enumerable::burn(&env, &to, token_id);
            env.storage()
                .persistent()
                .remove(&DataKey::Position(token_id));
        } else {
            // Update position data
            set_position_data(&env, token_id, &position);
        }

        (amount0, amount1)
    }

    /// Collect accumulated fees from a position
    pub fn collect(env: Env, pool: Address, to: Address, token_id: u32) -> (u128, u128) {
        // Verify ownership
        let owner = <PositionManager as NonFungibleToken>::owner_of(&env, token_id);
        if owner != to {
            panic!("Not the owner");
        }
        to.require_auth();

        // Get position data
        let mut position: PositionData = env
            .storage()
            .persistent()
            .get(&DataKey::Position(token_id))
            .expect("Position not found");

        if position.pool != pool {
            panic!("Wrong pool");
        }

        // Call Pool to collect fees
        let args: Vec<Val> = vec![
            &env,
            to.to_val(),
            position.tick_lower.into_val(&env),
            position.tick_upper.into_val(&env),
            position.liquidity.into_val(&env),
            position.fee_growth_inside_0_last.into_val(&env),
            position.fee_growth_inside_1_last.into_val(&env),
        ];

        let (amount0, amount1, next_growth0, next_growth1): (
            u128,
            u128,
            (u128, u128),
            (u128, u128),
        ) = env.invoke_contract(&pool, &Symbol::new(&env, "collect_fees"), args);

        // Reset fees owed
        position.fees_owed_0 = 0;
        position.fees_owed_1 = 0;
        position.fee_growth_inside_0_last = next_growth0;
        position.fee_growth_inside_1_last = next_growth1;
        set_position_data(&env, token_id, &position);

        (amount0, amount1)
    }

    /// Get position data for a token ID
    pub fn get_position(env: Env, token_id: u32) -> PositionData {
        let position: PositionData = env
            .storage()
            .persistent()
            .get(&DataKey::Position(token_id))
            .expect("Position not found");
        touch_position_ttl(&env, token_id);
        position
    }

    // ========== Legacy/Helper Entrypoints ==========

    /// Legacy helper for existing frontend usage.
    pub fn balance_of(env: Env, owner: Address) -> u32 {
        <PositionManager as NonFungibleToken>::balance(&env, owner)
    }

    /// Legacy helper for existing frontend usage.
    pub fn get_owned_tokens(env: Env, owner: Address) -> Vec<u32> {
        // Keep legacy endpoint bounded so older clients do not exceed transaction limits.
        Self::get_owned_tokens_page(env, owner, 0, MAX_OWNED_TOKENS_PAGE_SIZE)
    }

    /// Paginated token lookup to keep per-call resource usage bounded.
    /// `cursor` is the 0-based owner token index.
    pub fn get_owned_tokens_page(env: Env, owner: Address, cursor: u32, limit: u32) -> Vec<u32> {
        let balance = <PositionManager as NonFungibleToken>::balance(&env, owner.clone());
        let mut tokens = Vec::new(&env);
        if cursor >= balance || limit == 0 {
            return tokens;
        }

        let page_limit = if limit > MAX_OWNED_TOKENS_PAGE_SIZE {
            MAX_OWNED_TOKENS_PAGE_SIZE
        } else {
            limit
        };

        let mut index: u32 = cursor;
        let end = core::cmp::min(balance, cursor.saturating_add(page_limit));
        while index < end {
            let token_id = <PositionManager as NonFungibleEnumerable>::get_owner_token_id(
                &env,
                owner.clone(),
                index,
            );
            tokens.push_back(token_id);
            touch_position_ttl(&env, token_id);
            index += 1;
        }
        tokens
    }

    /// Extend a position entry TTL preemptively to avoid archival.
    pub fn refresh_position_ttl(env: Env, token_id: u32) {
        let owner = <PositionManager as NonFungibleToken>::owner_of(&env, token_id);
        owner.require_auth();
        touch_position_ttl(&env, token_id);
    }

    /// Legacy helper for existing frontend usage.
    pub fn set_approval_for_all(env: Env, owner: Address, operator: Address, approved: bool) {
        let live_until_ledger = if approved { u32::MAX } else { 0 };
        <PositionManager as NonFungibleToken>::approve_for_all(
            &env,
            owner,
            operator,
            live_until_ledger,
        );
    }
}

#[default_impl]
#[contractimpl]
impl NonFungibleToken for PositionManager {
    type ContractType = Enumerable;
}

#[default_impl]
#[contractimpl]
impl NonFungibleEnumerable for PositionManager {}
