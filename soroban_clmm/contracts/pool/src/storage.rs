use crate::types::{DataKey, Observation, OracleConfig, PoolState, TickData};
use soroban_sdk::Env;

pub fn get_pool_state(env: &Env) -> PoolState {
    env.storage().instance().get(&DataKey::Pool).unwrap()
}

pub fn set_pool_state(env: &Env, pool: &PoolState) {
    env.storage().instance().set(&DataKey::Pool, pool);
}

pub fn get_fee_growth_global_0(env: &Env) -> (u128, u128) {
    env.storage()
        .instance()
        .get(&DataKey::FeeGrowthGlobal0)
        .unwrap_or((0, 0))
}

pub fn set_fee_growth_global_0(env: &Env, growth: &(u128, u128)) {
    env.storage()
        .instance()
        .set(&DataKey::FeeGrowthGlobal0, growth);
}

pub fn get_fee_growth_global_1(env: &Env) -> (u128, u128) {
    env.storage()
        .instance()
        .get(&DataKey::FeeGrowthGlobal1)
        .unwrap_or((0, 0))
}

pub fn set_fee_growth_global_1(env: &Env, growth: &(u128, u128)) {
    env.storage()
        .instance()
        .set(&DataKey::FeeGrowthGlobal1, growth);
}

pub fn get_tick_data(env: &Env, tick: i32) -> TickData {
    get_or_create_tick(env, tick)
}

pub fn get_or_create_tick(env: &Env, tick: i32) -> TickData {
    if let Some(data) = env.storage().persistent().get(&DataKey::TickData(tick)) {
        data
    } else {
        TickData {
            liquidity_gross: 0,
            liquidity_net: 0,
            fee_growth_outside_0: (0, 0),
            fee_growth_outside_1: (0, 0),
            tick_cumulative_outside: 0,
            liquidity_cumulative_outside: 0,
            initialized: false,
        }
    }
}

pub fn get_oracle_config(env: &Env) -> Option<OracleConfig> {
    env.storage().instance().get(&DataKey::ObservationState)
}

pub fn set_oracle_config(env: &Env, config: &OracleConfig) {
    env.storage()
        .instance()
        .set(&DataKey::ObservationState, config);
}

pub fn get_observation(env: &Env, index: u32) -> Option<Observation> {
    env.storage()
        .persistent()
        .get(&DataKey::Observations(index))
}

pub fn set_observation(env: &Env, index: u32, obs: &Observation) {
    env.storage()
        .persistent()
        .set(&DataKey::Observations(index), obs);
    env.storage().persistent().extend_ttl(
        &DataKey::Observations(index),
        17280,      // ~1 day
        17280 * 30, // 30 days
    );
}

pub fn set_tick_data(env: &Env, tick: i32, data: &TickData) {
    env.storage()
        .persistent()
        .set(&DataKey::TickData(tick), data);
    // Extend TTL for ticks as they are persistent
    env.storage().persistent().extend_ttl(
        &DataKey::TickData(tick),
        17280,      // ~1 day (assuming 5s blocks) - typical simplified default
        17280 * 30, // Extend to 30 days
    );
}

// NOTE: Position storage moved to PositionManager NFT contract
