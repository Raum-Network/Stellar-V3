#![no_std]

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contractimpl, contracttype, vec, Address, Env, IntoVal, Map, Val, Vec,
};

mod test;

#[contracttype]
#[derive(Clone)]
pub struct FeeTier {
    pub fee: u32,
    pub tick_spacing: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    PendingAdmin,
    PendingAdminEta,
    FeeTiers,                     // Map<u32, u32>  (fee -> tick_spacing)
    Pools(Address, Address, u32), // Returns Address of pool
    WasmHash,
    PositionManager, // NEW: Address of NFT position manager
    PermissionlessPoolCreation,
    Paused,
}

#[contract]
pub struct Factory;

const ADMIN_TRANSFER_DELAY_SECONDS: u64 = 24 * 60 * 60;

fn require_admin(env: &Env) -> Address {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth();
    admin
}

#[contractimpl]
impl Factory {
    pub fn initialize(
        env: Env,
        admin: Address,
        wasm_hash: soroban_sdk::BytesN<32>,
        position_manager: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::PositionManager, &position_manager);

        // Initialize default fee tiers
        let mut tiers: Map<u32, u32> = Map::new(&env);
        tiers.set(500, 10); // 0.05% -> 10 ticks
        tiers.set(3000, 60); // 0.3% -> 60 ticks
        tiers.set(10000, 200); // 1% -> 200 ticks

        env.storage().instance().set(&DataKey::FeeTiers, &tiers);
        env.storage()
            .instance()
            .set(&DataKey::PermissionlessPoolCreation, &false);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn create_pool(
        env: Env,
        token_a: Address,
        token_b: Address,
        fee: u32,
        initial_tick: i32,
    ) -> Address {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic!("Factory is paused");
        }
        let permissionless: bool = env
            .storage()
            .instance()
            .get(&DataKey::PermissionlessPoolCreation)
            .unwrap_or(false);
        if !permissionless {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
            admin.require_auth();
        }

        if token_a == token_b {
            panic!("Identical token addresses");
        }

        // Sort tokens to ensure unique key
        let (token0, token1) = if token_a < token_b {
            (token_a, token_b)
        } else {
            (token_b, token_a)
        };

        if env
            .storage()
            .persistent()
            .has(&DataKey::Pools(token0.clone(), token1.clone(), fee))
        {
            panic!("Pool already exists");
        }

        let tiers: Map<u32, u32> = env.storage().instance().get(&DataKey::FeeTiers).unwrap();
        if !tiers.contains_key(fee) {
            panic!("Fee tier not supported");
        }
        let tick_spacing = tiers.get(fee).unwrap();
        if tick_spacing == 0 {
            panic!("Invalid tick spacing");
        }
        if initial_tick % tick_spacing as i32 != 0 {
            panic!("Initial tick must align with tick spacing");
        }

        let wasm_hash: soroban_sdk::BytesN<32> =
            env.storage().instance().get(&DataKey::WasmHash).unwrap();

        // Deterministic salt based on pool key.
        let mut salt_args: Vec<Val> = Vec::new(&env);
        salt_args.push_back(token0.to_val());
        salt_args.push_back(token1.to_val());
        salt_args.push_back(fee.into_val(&env));
        let salt = env.crypto().sha256(&salt_args.to_xdr(&env));

        let deployer = env.deployer().with_current_contract(salt);
        let pool_address = deployer.deploy(wasm_hash);

        // Initialize the pool with position_manager
        let position_manager: Address = env
            .storage()
            .instance()
            .get(&DataKey::PositionManager)
            .unwrap();

        env.invoke_contract::<()>(
            &pool_address,
            &soroban_sdk::Symbol::new(&env, "initialize"),
            vec![
                &env,
                env.current_contract_address().to_val(),
                token0.to_val(),
                token1.to_val(),
                fee.into_val(&env),
                tick_spacing.into_val(&env),
                initial_tick.into_val(&env),
                position_manager.to_val(), // NEW: pass position manager
            ],
        );

        env.storage()
            .persistent()
            .set(&DataKey::Pools(token0, token1, fee), &pool_address);

        pool_address
    }

    pub fn get_pool(env: Env, token_a: Address, token_b: Address, fee: u32) -> Address {
        let (token0, token1) = if token_a < token_b {
            (token_a, token_b)
        } else {
            (token_b, token_a)
        };
        env.storage()
            .persistent()
            .get(&DataKey::Pools(token0, token1, fee))
            .expect("Pool not found")
    }

    pub fn get_position_manager(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::PositionManager)
            .unwrap()
    }

    pub fn enable_fee_tier(env: Env, fee: u32, tick_spacing: u32) {
        require_admin(&env);
        if fee == 0 {
            panic!("Invalid fee");
        }
        if tick_spacing == 0 {
            panic!("Invalid tick spacing");
        }

        let mut tiers: Map<u32, u32> = env.storage().instance().get(&DataKey::FeeTiers).unwrap();
        tiers.set(fee, tick_spacing);
        env.storage().instance().set(&DataKey::FeeTiers, &tiers);
    }

    pub fn set_permissionless_pool_creation(env: Env, enabled: bool) {
        require_admin(&env);
        env.storage()
            .instance()
            .set(&DataKey::PermissionlessPoolCreation, &enabled);
    }

    pub fn set_paused(env: Env, paused: bool) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &paused);
    }

    pub fn propose_admin_transfer(env: Env, new_admin: Address) {
        let current_admin = require_admin(&env);
        if current_admin == new_admin {
            panic!("New admin must differ");
        }
        let eta = env
            .ledger()
            .timestamp()
            .saturating_add(ADMIN_TRANSFER_DELAY_SECONDS);
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.storage()
            .instance()
            .set(&DataKey::PendingAdminEta, &eta);
    }

    pub fn cancel_admin_transfer(env: Env) {
        require_admin(&env);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage().instance().remove(&DataKey::PendingAdminEta);
    }

    pub fn accept_admin_transfer(env: Env) {
        let pending_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .expect("No pending admin");
        let eta: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdminEta)
            .expect("No pending admin ETA");
        if env.ledger().timestamp() < eta {
            panic!("Admin transfer timelocked");
        }
        pending_admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage().instance().remove(&DataKey::PendingAdminEta);
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        Self::propose_admin_transfer(env, new_admin);
    }

    pub fn set_pool_protocol_fee(env: Env, pool: Address, protocol_fee: u32) {
        require_admin(&env);
        env.invoke_contract::<()>(
            &pool,
            &soroban_sdk::Symbol::new(&env, "set_protocol_fee"),
            vec![&env, protocol_fee.into_val(&env)],
        );
    }

    pub fn collect_pool_protocol_fees(env: Env, pool: Address, recipient: Address) -> (u128, u128) {
        require_admin(&env);
        env.invoke_contract(
            &pool,
            &soroban_sdk::Symbol::new(&env, "collect_protocol_fees"),
            vec![&env, recipient.to_val()],
        )
    }

    pub fn set_pool_paused(env: Env, pool: Address, paused: bool) {
        require_admin(&env);
        env.invoke_contract::<()>(
            &pool,
            &soroban_sdk::Symbol::new(&env, "set_paused"),
            vec![&env, paused.into_val(&env)],
        );
    }

    pub fn set_pool_max_tick_crosses(env: Env, pool: Address, max_tick_crosses_per_swap: u32) {
        require_admin(&env);
        env.invoke_contract::<()>(
            &pool,
            &soroban_sdk::Symbol::new(&env, "set_max_tick_crosses_per_swap"),
            vec![&env, max_tick_crosses_per_swap.into_val(&env)],
        );
    }
}
