#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, vec, Address, Env, IntoVal, Symbol, Vec};

#[cfg(test)]
mod test;

#[contract]
pub struct TickLens;

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolState {
    pub factory: Address,
    pub token0: Address,
    pub token1: Address,
    pub fee: u32,
    pub tick_spacing: u32,
    pub current_tick: i32,
    pub liquidity: u128,
    pub sqrt_price_x96: (u128, u128),
    pub protocol_fee: u32,
    pub fees_uncollected_0: u128,
    pub fees_uncollected_1: u128,
    pub protocol_fees_0: u128,
    pub protocol_fees_1: u128,
    pub max_tick_crosses_per_swap: u32,
    pub paused: bool,
    pub position_manager: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TickData {
    pub liquidity_gross: u128,
    pub liquidity_net: i128,
    pub fee_growth_outside_0: (u128, u128),
    pub fee_growth_outside_1: (u128, u128),
    pub tick_cumulative_outside: i64,
    pub liquidity_cumulative_outside: u128,
    pub initialized: bool,
}

const MAX_TICKS_PER_PAGE: u32 = 64;

#[contractimpl]
impl TickLens {
    pub fn get_pool_state(env: Env, pool: Address) -> PoolState {
        env.invoke_contract(&pool, &Symbol::new(&env, "get_state"), vec![&env])
    }

    pub fn get_tick(env: Env, pool: Address, tick: i32) -> TickData {
        env.invoke_contract(
            &pool,
            &Symbol::new(&env, "get_tick"),
            vec![&env, tick.into_val(&env)],
        )
    }

    pub fn get_ticks_page(
        env: Env,
        pool: Address,
        start_tick: i32,
        tick_spacing: i32,
        limit: u32,
    ) -> Vec<(i32, TickData)> {
        if tick_spacing <= 0 {
            panic!("tick_spacing must be positive");
        }
        if limit > MAX_TICKS_PER_PAGE {
            panic!("limit exceeds max page size");
        }

        let mut page = Vec::new(&env);
        let mut tick = start_tick;
        let mut i = 0u32;
        while i < limit {
            let data = Self::get_tick(env.clone(), pool.clone(), tick);
            page.push_back((tick, data));
            tick = tick.saturating_add(tick_spacing);
            i += 1;
        }
        page
    }
}
