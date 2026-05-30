use crate::storage::{get_observation, get_oracle_config, set_observation, set_oracle_config};
use crate::types::Observation;
use soroban_sdk::Env;

pub const MAX_ORACLE_CARDINALITY: u32 = 1024;

fn logical_to_physical_index(oldest_index: u32, logical_index: u32, cardinality: u32) -> u32 {
    (oldest_index + logical_index) % cardinality
}

fn interpolate_observation(
    before: &Observation,
    after: &Observation,
    target_time: u64,
) -> (i64, u128) {
    if target_time <= before.timestamp || after.timestamp <= before.timestamp {
        return (before.tick_cumulative, before.liquidity_cumulative);
    }
    if target_time >= after.timestamp {
        return (after.tick_cumulative, after.liquidity_cumulative);
    }

    let total_delta = after.timestamp - before.timestamp;
    if total_delta == 0 {
        return (before.tick_cumulative, before.liquidity_cumulative);
    }
    let target_delta = target_time - before.timestamp;

    let tick_delta = after.tick_cumulative - before.tick_cumulative;
    let tick_cumulative =
        before.tick_cumulative + (tick_delta * target_delta as i64 / total_delta as i64);

    let liq_delta = after
        .liquidity_cumulative
        .saturating_sub(before.liquidity_cumulative);
    let liquidity_cumulative =
        before.liquidity_cumulative + (liq_delta * target_delta as u128 / total_delta as u128);

    (tick_cumulative, liquidity_cumulative)
}

pub fn increase_cardinality_next(env: &Env, cardinality_next: u32) -> u32 {
    if cardinality_next == 0 {
        panic!("Invalid cardinality");
    }
    if cardinality_next > MAX_ORACLE_CARDINALITY {
        panic!("Cardinality exceeds max");
    }

    let mut oracle_config = get_oracle_config(env).expect("Oracle not initialized");
    if cardinality_next > oracle_config.cardinality_next {
        oracle_config.cardinality_next = cardinality_next;
        set_oracle_config(env, &oracle_config);
    }
    oracle_config.cardinality_next
}

pub fn write(
    env: &Env,
    index: u32,
    block_timestamp: u64,
    tick: i32,
    liquidity: u128,
    cardinality: u32,
    cardinality_next: u32,
) -> (u32, u32) {
    let current_cardinality = if cardinality == 0 { 1 } else { cardinality };
    let bounded_cardinality_next = if cardinality_next == 0 {
        current_cardinality
    } else {
        core::cmp::min(cardinality_next, MAX_ORACLE_CARDINALITY)
    };

    let safe_index = index % current_cardinality;
    let last_obs = get_observation(env, safe_index).unwrap_or(Observation {
        timestamp: block_timestamp,
        tick_cumulative: 0,
        liquidity_cumulative: 0,
        initialized: false,
    });

    if last_obs.initialized && last_obs.timestamp == block_timestamp {
        return (safe_index, current_cardinality);
    }

    let delta = block_timestamp - last_obs.timestamp;
    let tick_cumulative = last_obs.tick_cumulative + (tick as i64 * delta as i64);

    let liquidity_cumulative = last_obs
        .liquidity_cumulative
        .saturating_add(liquidity.saturating_mul(delta as u128));

    // Grow one slot per write until reaching cardinality_next. This keeps all slots
    // up to `cardinality` initialized and avoids sparse storage reads during observe.
    let next_cardinality = if bounded_cardinality_next > current_cardinality {
        current_cardinality + 1
    } else {
        current_cardinality
    };
    let next_index = (safe_index + 1) % next_cardinality;

    let obs = Observation {
        timestamp: block_timestamp,
        tick_cumulative,
        liquidity_cumulative,
        initialized: true,
    };

    set_observation(env, next_index, &obs);

    (next_index, next_cardinality)
}

pub fn observe_single(
    env: &Env,
    time: u64,
    seconds_ago: u32,
    tick: i32,
    index: u32,
    cardinality: u32,
) -> (i64, u128) {
    let safe_cardinality = if cardinality == 0 { 1 } else { cardinality };
    let latest_index = index % safe_cardinality;
    let latest_observation = get_observation(env, latest_index).unwrap_or(Observation {
        timestamp: 0,
        tick_cumulative: 0,
        liquidity_cumulative: 0,
        initialized: false,
    });

    if !latest_observation.initialized {
        return (0, 0);
    }

    if seconds_ago == 0 {
        if latest_observation.timestamp >= time {
            return (
                latest_observation.tick_cumulative,
                latest_observation.liquidity_cumulative,
            );
        }
        let delta = time - latest_observation.timestamp;
        return (
            latest_observation.tick_cumulative + (tick as i64 * delta as i64),
            latest_observation.liquidity_cumulative,
        );
    }

    if seconds_ago as u64 > time {
        return (0, 0);
    }

    let target_time = time - seconds_ago as u64;
    if target_time >= latest_observation.timestamp {
        return (
            latest_observation.tick_cumulative,
            latest_observation.liquidity_cumulative,
        );
    }

    let oldest_index = (latest_index + 1) % safe_cardinality;
    let oldest_observation = get_observation(env, oldest_index).unwrap_or(Observation {
        timestamp: latest_observation.timestamp,
        tick_cumulative: latest_observation.tick_cumulative,
        liquidity_cumulative: latest_observation.liquidity_cumulative,
        initialized: true,
    });

    if !oldest_observation.initialized || target_time <= oldest_observation.timestamp {
        return (
            oldest_observation.tick_cumulative,
            oldest_observation.liquidity_cumulative,
        );
    }

    if safe_cardinality == 1 {
        return (
            latest_observation.tick_cumulative,
            latest_observation.liquidity_cumulative,
        );
    }

    // Logarithmic lookup across the initialized circular range [oldest..latest].
    let mut left: u32 = 0;
    let mut right: u32 = safe_cardinality - 1;
    let mut left_observation = oldest_observation.clone();
    let mut right_observation = latest_observation.clone();

    while left + 1 < right {
        let mid = left + (right - left) / 2;
        let mid_index = logical_to_physical_index(oldest_index, mid, safe_cardinality);
        if let Some(mid_observation) = get_observation(env, mid_index) {
            if !mid_observation.initialized {
                right = mid;
                continue;
            }

            if mid_observation.timestamp == target_time {
                return (
                    mid_observation.tick_cumulative,
                    mid_observation.liquidity_cumulative,
                );
            }

            if mid_observation.timestamp < target_time {
                left = mid;
                left_observation = mid_observation;
            } else {
                right = mid;
                right_observation = mid_observation;
            }
        } else {
            right = mid;
        }
    }

    interpolate_observation(&left_observation, &right_observation, target_time)
}
