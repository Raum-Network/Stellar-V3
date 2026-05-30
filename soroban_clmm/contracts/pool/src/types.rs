use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Debug, Clone)]
pub struct PoolState {
    pub factory: Address,
    pub token0: Address,
    pub token1: Address,
    pub fee: u32, // fee in parts per million (e.g., 3000 for 0.3%)
    pub tick_spacing: u32,
    pub current_tick: i32,
    pub liquidity: u128,
    pub sqrt_price_x96: (u128, u128), // Stored as (high, low) for u256 compatibility
    pub protocol_fee: u32,            // fee amount in parts per million
    pub fees_uncollected_0: u128,
    pub fees_uncollected_1: u128,
    pub protocol_fees_0: u128,
    pub protocol_fees_1: u128,
    pub max_tick_crosses_per_swap: u32,
    pub paused: bool,
    pub position_manager: Address, // NEW: NFT contract that manages positions
}

#[contracttype]
#[derive(Debug, Clone)]
pub struct TickData {
    pub liquidity_gross: u128,              // Total liquidity at tick
    pub liquidity_net: i128,                // Net change (upper - lower)
    pub fee_growth_outside_0: (u128, u128), // Fee per unit liquidity outside range
    pub fee_growth_outside_1: (u128, u128),
    pub tick_cumulative_outside: i64, // For TWAP oracle
    pub liquidity_cumulative_outside: u128,
    pub initialized: bool,
}

// NOTE: Position struct moved to PositionManager NFT contract

#[contracttype]
#[derive(Debug, Clone)]
pub struct Observation {
    pub timestamp: u64,
    pub tick_cumulative: i64,
    pub liquidity_cumulative: u128,
    pub initialized: bool,
}

#[contracttype]
pub enum DataKey {
    Pool,
    TickData(i32), // Key: tick index
    // NOTE: Position storage moved to PositionManager NFT contract
    Observations(u32), // Key: observation circular buffer index
    ObservationState,
    FeeGrowthGlobal0, // 0 for token0
    FeeGrowthGlobal1, // 1 for token1
    ProtocolFees(u32),
}

#[contracttype]
#[derive(Debug, Clone)]
pub struct OracleConfig {
    pub index: u32,
    pub cardinality: u32,
    pub cardinality_next: u32,
}
