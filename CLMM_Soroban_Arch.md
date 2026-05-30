# Uniswap V3 CLMM on Stellar Soroban: Technical Architecture

## Scope

This document defines the technical architecture for a Uniswap V3-like Concentrated Liquidity Market Maker (CLMM) on Stellar Soroban, with compatibility for both Stellar Asset Contracts (SAC) and native Soroban contract tokens. The architecture emphasizes gas efficiency, storage discipline, and Soroban-native execution constraints.

---

## 1. System Overview

### 1.1 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CLMM Protocol                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Factory Contract                                    │   │
│  │  - Pool creation & deployment                        │   │
│  │  - Fee tier registration (0.05%, 0.3%, 1%)          │   │
│  │  - Pool registry management                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Pool Contracts (Multiple instances)                 │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ Pool Instance (Token0/Token1 pair)              │ │   │
│  │  │ - Swap logic with concentrated liquidity        │ │   │
│  │  │ - Liquidity add/remove with tick positions      │ │   │
│  │  │ - Fee collection & distribution                 │ │   │
│  │  │ - TWAP oracle management                        │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Router Contract                                     │   │
│  │  - Multi-hop swaps                                  │   │
│  │  - Price calculation & slippage protection          │   │
│  │  - User interface contract                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Position Manager Contract                          │   │
│  │  - NFT position minting/burning                     │   │
│  │  - Position data tracking                           │   │
│  │  - Fee claim operations                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Storage Layer (Soroban Persistent/Instance)        │   │
│  │  - Pool state & liquidity data                      │   │
│  │  - Tick states & LP positions                       │   │
│  │  - TWAP accumulator checkpoints                     │   │
│  │  - Position NFT metadata                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Token Integration                                  │   │
│  │  - Stellar Asset Contract (SAC) - Stellar assets    │   │
│  │  - Soroban Contract Tokens - Custom tokens          │   │
│  │  - SEP-41 Token Interface (ERC-20 equivalent)       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| **Contract Model** | Singleton + Factory | Separate pools reduce individual contract size; factory manages deployment |
| **Token Compatibility** | SAC + Soroban tokens | SAC: 98% more efficient; Soroban tokens provide flexibility |
| **Storage Model** | Persistent + Temporary | Persistent for long-term state; Temporary for oracle feeds & allowances |
| **Tick Storage** | Individual entries (keyed by tick_index) | Avoids bitmap complexity; supports Soroban's key-value model |
| **Position Tracking** | Simplified token standard | Light-weight alternative to full ERC-721; indexed by position_id |
| **TWAP Oracle** | Cumulative tick accumulators | Geometric mean TWAP; checkpoints stored at tick crossings |

---

## 2. Smart Contract Architecture

### 2.1 Factory Contract

**Purpose**: Deploy and manage pool instances, register fee tiers, maintain protocol settings.

**Instance Storage** (~40 KB):
```rust
struct FactoryState {
    owner: Address,              // Admin address
    protocol_fee: u32,           // 0-100% (parts per 10000)
    enable_fee_tiers: Vec<FeeTier>,
    tick_spacing_map: HashMap<u32, u16>, // fee → tick_spacing
    pool_count: u64,             // Counter
    fee_tier_enabled: HashMap<u32, bool>,
}

struct FeeTier {
    fee_percentage: u32,         // 0.05%, 0.3%, 1% (in parts per million)
    tick_spacing: u16,           // 10, 60, 200
    enabled: bool,
}
```

**Persistent Storage**:
```rust
// Key: "pool_registry"
struct PoolRegistry {
    pools: Vec<(TokenPair, PoolId, Address)>,
    pool_map: HashMap<TokenPair, PoolId>, // Fast lookup
}

// Key: "pool:<pool_id>"
struct PoolData {
    token0: Address,
    token1: Address,
    fee: u32,
    tick_spacing: u16,
    current_tick: i32,
    liquidity: u128,
    sqrt_price_x96: u256,
    swap_fee_accumulated_0: u128,
    swap_fee_accumulated_1: u128,
}
```

**Key Functions**:
- `create_pool(token0, token1, fee)` → PoolId
- `enable_fee_tier(fee, tick_spacing)`
- `set_protocol_fee(fee)`
- `collect_protocol_fees(pool_id)`

### 2.2 Pool Contract

**Purpose**: Core CLMM logic—swaps, liquidity provision, fee collection, TWAP oracle.

**Instance Storage** (~50-60 KB):
```rust
struct PoolState {
    factory: Address,
    token0: Address,
    token1: Address,
    fee: u32,
    tick_spacing: u16,
    current_tick: i32,
    liquidity: u128,
    sqrt_price_x96: u256,
    
    // Fee tracking
    protocol_fee: u32,
    fees_uncollected_0: u128,
    fees_uncollected_1: u128,
    
    // TWAP oracle state
    observations: Vec<Observation>,
    observation_index: u32,
    observation_cardinality: u32,
    observation_cardinality_next: u32,
}

struct Observation {
    timestamp: u64,
    tick_cumulative: i64,
    liquidity_cumulative: u128,
    initialized: bool,
}
```

**Persistent Storage** (per-transaction key limits apply):
```rust
// Key: "tick_data:<tick_index>"
struct TickData {
    liquidity_gross: u128,       // Total liquidity at this tick
    liquidity_net: i128,         // Net liquidity change (upper - lower boundary)
    fee_0: u128,                 // Uncollected fees
    fee_1: u128,
    tick_cumulative_outside: i64,
    liquidity_cumulative_outside: u128,
    initialized: bool,
}

// Key: "position:<position_id>"
struct Position {
    owner: Address,
    tick_lower: i32,
    tick_upper: i32,
    liquidity: u128,
    fees_owed_0: u128,
    fees_owed_1: u128,
    last_fee_index_0: u128,      // For fee calculation
    last_fee_index_1: u128,
}
```

**Key Functions**:

**Swap Logic**:
```rust
pub fn swap(
    token_in: Address,
    amount_in: i128,
    amount_out_minimum: i128,
    sqrt_price_limit_x96: u256,
) -> (i128, i128)  // (amount_in_actual, amount_out)
```

- Path: Identify token direction (0→1 or 1→0)
- Routing: Iterate through affected ticks until desired output
- Slippage: Enforce sqrt_price_limit_x96 to prevent sandwich attacks
- Fee: Calculate and accumulate swap fee
- Oracle: Update TWAP accumulator

**Liquidity Management**:
```rust
pub fn mint(
    tick_lower: i32,
    tick_upper: i32,
    amount: i128,  // Liquidity to add
) -> (u128, u128)  // (token0_required, token1_required)

pub fn burn(
    position_id: u64,
    liquidity: u128,
) -> (u128, u128)  // (token0_redeemed, token1_redeemed)

pub fn collect(
    position_id: u64,
) → (u128, u128)  // (fees_0, fees_1)
```

**TWAP Oracle**:
```rust
pub fn observe(
    seconds_ago: Vec<u32>,
) → Vec<(i64, u128)>  // [(tick_cumulative, liquidity_cumulative)]
```

- Queries historical or current cumulative values
- Allows external TWAP calculations

### 2.3 Position Manager Contract

**Purpose**: Manage LP positions as NFTs (or token-based positions); handle position creation, updates, burns.

**Instance Storage** (~30 KB):
```rust
struct PositionManagerState {
    factory: Address,
    position_counter: u64,
    owner_positions: HashMap<Address, Vec<u64>>,  // user → [position_ids]
    position_nfts: HashMap<u64, PositionNFT>,
}

struct PositionNFT {
    position_id: u64,
    owner: Address,
    pool: Address,
    tick_lower: i32,
    tick_upper: i32,
    liquidity: u128,
    minted_at: u64,
}
```

**Key Functions**:
- `mint(pool, tick_lower, tick_upper, liquidity) → position_id`
- `burn(position_id)`
- `collect_fees(position_id) → (amount_0, amount_1)`
- `increase_liquidity(position_id, liquidity_delta)`
- `decrease_liquidity(position_id, liquidity_delta)`

### 2.4 Router Contract

**Purpose**: User-facing interface; multi-hop swaps, price calculations, slippage protection.

**Instance Storage** (~20 KB):
```rust
struct RouterState {
    factory: Address,
    position_manager: Address,
    weth: Address,  // Wrapped XLM or native asset
}
```

**Key Functions**:
```rust
pub fn swap_exact_input(
    path: Vec<(Address, Address, u32)>,  // [(token_in, token_out, fee_tier)]
    amount_in: i128,
    amount_out_minimum: i128,
) -> i128  // amount_out

pub fn swap_exact_output(
    path: Vec<(Address, Address, u32)>,
    amount_out: i128,
    amount_in_maximum: i128,
) -> i128  // amount_in

pub fn add_liquidity(
    pool: Address,
    tick_lower: i32,
    tick_upper: i32,
    amount0_desired: i128,
    amount1_desired: i128,
    amount0_min: i128,
    amount1_min: i128,
) -> (u64, i128, i128)  // (position_id, amount0, amount1)

pub fn remove_liquidity(
    position_id: u64,
    liquidity: u128,
    amount0_min: i128,
    amount1_min: i128,
) -> (i128, i128)  // (amount0, amount1)
```

---

## 3. Data Storage Strategy

### 3.1 Storage Type Allocation

| Entity | Type | Rationale | TTL Strategy |
|--------|------|-----------|--------------|
| Pool metadata | Instance | Accessed every swap; immutable | N/A (contract level) |
| Tick liquidity | Persistent | High read/write; per-transaction key limit | Extend indefinitely |
| Positions | Persistent | Long-term LP positions | Extend indefinitely |
| TWAP history | Persistent | Oracle queries need history | Extend indefinitely |
| Allowances | Temporary | Time-limited token permits | Auto-expire |
| Swap quotes | Temporary | Single-transaction use | Auto-expire |
| Oracle observations | Persistent (append-only) | Historical data for TWAP | Extend; archive old observations |

### 3.2 Key Naming Scheme

```
Factory:
  "pool_registry"              → PoolRegistry
  "fee_tiers"                  → Vec<FeeTier>

Pool (per pool instance):
  "pool_state"                 → PoolState
  "tick_data:<tick_index>"     → TickData         [Persistent, per-tick]
  "position:<position_id>"     → Position         [Persistent, per-position]
  "observations:<obs_index>"   → Observation      [Persistent, circular buffer]
  
Position Manager:
  "pm_state"                   → PositionManagerState
  "user_positions:<user>"      → Vec<u64>        [Persistent, per-user]
  "position_nft:<pos_id>"      → PositionNFT     [Persistent, per-position]

Router:
  "router_state"               → RouterState
```

### 3.3 Storage Cost Estimation

Assume SAC operations ~0.5 XLM per transaction; Soroban custom tokens ~25 XLM (50x difference).

**Scenario**: Active liquidity provider, 10 positions, 100 ticks affected

```
One-time costs:
  - Pool creation: ~50 XLM
  - Pool registration: ~5 XLM (persistent entry)
  
Per-position costs:
  - Position mint: ~10 XLM (router) + SAC transfer (~0.5 XLM each token)
  - Total per position: ~11 XLM
  
Per-transaction costs (swap):
  - Pool swap: ~50 XLM (includes tick state reads)
  - Token transfer (SAC): ~0.5 XLM per token
  - Oracle update: ~30 XLM (observation checkpoint)
  
Storage rental (annual):
  - Pool data entry: ~1 XLM (with extended TTL)
  - 10 position entries: ~10 XLM
  - 100 tick entries (if active): ~100 XLM
  
Total annual (for active user): ~111+ XLM storage rental
```

---

## 4. Key Algorithms

### 4.1 Tick-Based Price & Liquidity Calculation

```rust
// Tick to price conversion
fn tick_to_price(tick: i32) -> (u256, u256) {
    // Price = 1.0001^tick
    let exponent = tick;
    let price_q64_96 = 1.0001_f64.powi(exponent);
    return fixed_point_multiply(price_q64_96);
}

// Liquidity from token amounts
fn calc_liquidity_from_amounts(
    tick_current: i32,
    tick_lower: i32,
    tick_upper: i32,
    amount0: u128,
    amount1: u128,
) -> u128 {
    let sqrt_price = tick_to_sqrt_price(tick_current);
    let sqrt_price_lower = tick_to_sqrt_price(tick_lower);
    let sqrt_price_upper = tick_to_sqrt_price(tick_upper);
    
    if tick_current <= tick_lower {
        // Only token0: L = amount0 / (sqrt_price_upper - sqrt_price_lower)
        return amount0 / (sqrt_price_upper - sqrt_price_lower);
    } else if tick_current >= tick_upper {
        // Only token1: L = amount1 / (sqrt_price - sqrt_price_lower)
        return amount1 / (sqrt_price - sqrt_price_lower);
    } else {
        // Both tokens: L = min(
        //   amount0 / (sqrt_price_upper - sqrt_price),
        //   amount1 / (sqrt_price - sqrt_price_lower)
        // )
        let l0 = amount0 / (sqrt_price_upper - sqrt_price);
        let l1 = amount1 / (sqrt_price - sqrt_price_lower);
        return min(l0, l1);
    }
}
```

### 4.2 Swap Execution

```rust
fn swap(
    token_in: Address,
    amount_in: i128,
    amount_out_minimum: i128,
    sqrt_price_limit: u256,
) {
    let mut remaining_in = amount_in;
    let mut amount_out = 0i128;
    let mut current_tick = self.current_tick;
    let mut current_liquidity = self.liquidity;
    let mut current_sqrt_price = self.sqrt_price_x96;
    
    // Determine swap direction
    let zero_for_one = token_in == self.token0;
    
    while remaining_in > 0 {
        // Find next initialized tick
        let next_tick = find_next_tick(current_tick, zero_for_one);
        let next_sqrt_price = tick_to_sqrt_price(next_tick);
        
        // Cap at sqrt_price_limit to prevent sandwich
        let target_sqrt_price = if zero_for_one {
            min(next_sqrt_price, sqrt_price_limit)
        } else {
            max(next_sqrt_price, sqrt_price_limit)
        };
        
        // Compute amounts for this segment
        let (in_segment, out_segment, _) = compute_swap_step(
            current_sqrt_price,
            target_sqrt_price,
            current_liquidity,
            remaining_in,
            zero_for_one,
            self.fee,
        );
        
        remaining_in -= in_segment;
        amount_out += out_segment;
        current_sqrt_price = target_sqrt_price;
        
        // If we crossed a tick, apply liquidity change
        if current_sqrt_price == next_sqrt_price {
            let tick_data = get_tick_data(next_tick);
            current_liquidity += tick_data.liquidity_net; // signed
            current_tick = next_tick;
        }
        
        // Stop if we hit price limit
        if current_sqrt_price == sqrt_price_limit {
            break;
        }
    }
    
    require(amount_out >= amount_out_minimum, "Slippage exceeded");
    
    // Update pool state
    self.current_tick = current_tick;
    self.liquidity = current_liquidity;
    self.sqrt_price_x96 = current_sqrt_price;
    
    // Update TWAP oracle
    update_oracle_observation(current_tick);
    
    return (amount_in - remaining_in, amount_out);
}
```

### 4.3 TWAP Oracle Update

```rust
fn update_oracle_observation(current_tick: i32) {
    let now = env.ledger().timestamp();
    let mut obs_state = get_observation_state();
    
    // Get latest observation
    let last_obs = obs_state.observations[obs_state.observation_index];
    
    // Only update if time has passed
    if now > last_obs.timestamp {
        let time_delta = now - last_obs.timestamp;
        
        // Increment circular index
        obs_state.observation_index = (obs_state.observation_index + 1) 
            % obs_state.observation_cardinality;
        
        // Store new observation
        let new_obs = Observation {
            timestamp: now,
            tick_cumulative: last_obs.tick_cumulative + (current_tick as i64 * time_delta),
            liquidity_cumulative: last_obs.liquidity_cumulative + 
                (1.0 / self.liquidity as f64 * time_delta),
            initialized: true,
        };
        
        store_observation(obs_state.observation_index, new_obs);
        
        // If cardinality not full, increment it
        if obs_state.observation_cardinality < obs_state.observation_cardinality_next {
            obs_state.observation_cardinality += 1;
        }
    }
}

// Query TWAP over time window
fn observe(seconds_ago: Vec<u32>) -> Vec<(i64, u128)> {
    let now = env.ledger().timestamp();
    let mut result = Vec::new();
    
    for sec in seconds_ago {
        let query_time = now - sec;
        let (cumulative_tick, cumulative_liquidity) = binary_search_observation(query_time);
        result.push((cumulative_tick, cumulative_liquidity));
    }
    
    return result;
}
```

---

## 5. Token Integration (SAC & Soroban Tokens)

### 5.1 Token Interface Abstraction

```rust
pub trait TokenInterface {
    fn transfer(&self, from: Address, to: Address, amount: i128) -> Result<(), Error>;
    fn transfer_from(&self, spender: Address, from: Address, to: Address, amount: i128) -> Result<(), Error>;
    fn balance_of(&self, account: Address) -> i128;
    fn approve(&self, spender: Address, amount: i128) -> Result<(), Error>;
    fn allowance(&self, owner: Address, spender: Address) -> i128;
}

pub enum TokenType {
    SAC(Address),              // Stellar Asset Contract
    SorobanToken(Address),     // Custom Soroban contract token
}

impl TokenInterface for TokenType {
    fn transfer(&self, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        match self {
            TokenType::SAC(addr) => {
                // Call SAC's transfer function
                token::Client::new(&env, addr).transfer(
                    &from,
                    &to,
                    &amount,
                );
            }
            TokenType::SorobanToken(addr) => {
                // Call custom token's transfer
                // (assumes SEP-41 compatible interface)
                custom_token::Client::new(&env, addr).transfer(
                    &from,
                    &to,
                    &amount,
                );
            }
        }
        Ok(())
    }
    
    // ... other trait methods ...
}
```

### 5.2 Pool Initialization with Token Support

```rust
fn create_pool(
    token0: Address,
    token1: Address,
    fee: u32,
    initial_price: u256,
) -> (Address, bool) {
    // Detect token type
    let token0_type = detect_token_type(token0);
    let token1_type = detect_token_type(token1);
    
    // Create pool contract
    let pool_contract = deploy_pool_contract(
        token0_type,
        token1_type,
        fee,
        initial_price,
    );
    
    // Register in factory
    register_pool(token0, token1, fee, pool_contract);
    
    return (pool_contract, true);
}

fn detect_token_type(token_address: Address) -> TokenType {
    // Try SAC interface first
    if is_sac(token_address) {
        TokenType::SAC(token_address)
    } else {
        // Assume Soroban token implementing SEP-41
        TokenType::SorobanToken(token_address)
    }
}
```

### 5.3 Transaction Cost Optimization with SAC

**Gas Savings Example** (using SAC for XLM pair):

```
Scenario: Swap 100 XLM for USDC
  - With Soroban custom token: ~50 XLM in fees
  - With SAC (XLM native): ~1 XLM in fees (98% reduction)
  
Savings: 49 XLM per swap
At volume of 1000 swaps/month: 49,000 XLM/month saved
```

---

## 6. Handling Soroban Constraints

### 6.1 Per-Transaction Key Limit (100 keys)

**Challenge**: Complex swaps crossing many ticks may exceed key footprint.

**Solution**: Segment swaps into batches

```rust
fn swap_with_batching(
    token_in: Address,
    amount_in: i128,
    max_ticks_per_batch: u32,  // e.g., 10
) -> i128 {
    let mut total_out = 0i128;
    let mut remaining = amount_in;
    
    while remaining > 0 {
        let (out, consumed) = swap_batch(
            token_in,
            remaining,
            max_ticks_per_batch,
        );
        
        total_out += out;
        remaining -= consumed;
    }
    
    return total_out;
}
```

### 6.2 CPU Limit (100 million instructions)

**Challenge**: Complex liquidity math + storage operations near limit.

**Mitigation**:
- Pre-compute tick boundaries offline; submit only affected ticks
- Cache commonly-accessed tick data in temporary storage
- Use fixed-point math (no floating-point)

```rust
// Avoid: full search through all ticks
// let next_tick = find_next_initialized_tick(1..887272);

// Better: search only affected range
let search_range = current_tick - 1000..current_tick + 1000;
let next_tick = find_next_initialized_tick(search_range);
```

### 6.3 Storage Size (128 KiB per ledger entry)

**Challenge**: Large position data or tick maps may exceed limit.

**Solution**: Distributed tick data

```rust
// Instead of one large tick map:
// Key: "tick_data:<tick_index>"  (128 KiB per entry limit not an issue for single tick)

// If needing to batch ticks:
// Key: "tick_data_batch:<start_tick>"
// Value: Vec of tick data within range
```

### 6.4 Memory (40 MB)

**Non-issue for CLMM**: Most operations work within low memory footprint. Complex multi-hop routing might approach limit, but unlikely with well-designed contracts.

---

## 7. Security Considerations

### 7.1 Reentrancy Protection

Soroban's synchronous execution model eliminates cross-contract reentrancy risk. However, protect against single-contract state manipulation:

```rust
#[contract]
pub struct Pool {
    // ... pool fields ...
    #[locked]  // Simulated lock via single-writer model
    locked: bool,
}

#[contractimpl]
impl Pool {
    pub fn swap(&mut self, ...) {
        require(!self.locked, "No reentrancy");
        self.locked = true;
        
        // ... swap logic ...
        
        self.locked = false;
    }
}
```

### 7.2 Flash Loan Prevention

CLMM doesn't support flash loans (unlike Uniswap). Use atomic swaps only:

```rust
pub fn swap(...) {
    // Single atomic operation: user must provide token_in before receiving token_out
    // No intermediate state where token_out is withdrawn without balance
}
```

### 7.3 Oracle Manipulation

TWAP uses geometric mean over time. Protect against short-term price spikes:

```rust
// Enforce minimum observation window (e.g., 30 minutes)
fn get_twap(seconds_ago: u32) -> u256 {
    require(seconds_ago >= 1800, "Minimum 30-min observation window");
    
    let observations = query_observations(seconds_ago);
    return calculate_geometric_mean_twap(observations);
}
```

### 7.4 Tick Crossing Vulnerabilities

Validate tick movements are legitimate:

```rust
// Ensure new tick is adjacent to current
require(
    (new_tick - current_tick).abs() <= max_ticks_per_swap,
    "Tick jump too large"
);

// Verify tick index divisibility by tick_spacing
require(
    new_tick % tick_spacing == 0,
    "Invalid tick for spacing"
);
```

---

## 8. Deployment & Operations

### 8.1 Deployment Sequence

1. Deploy the Factory contract.
2. Deploy the Pool contract template or pool implementation package.
3. Initialize the Factory with the allowed fee tiers and pool deployment configuration.
4. Create baseline pools and verify the full flow: Router → Pool → token transfer.
5. Validate liquidity provisioning, fee accrual, and TWAP observation updates before broader pool creation.

### 8.2 Readiness Requirements

1. Complete a security audit before production deployment.
2. Stress test swap execution, liquidity management, and observation growth under realistic concurrency.
3. Validate storage rent behavior and TTL extension patterns with measured Soroban costs.
4. Confirm governance and admin controls for protocol fees, pool creation, and upgrade paths.

### 8.3 Operations Checklist

- Monitor pool liquidity, swap volumes, failed transactions, and fee collection.
- Verify TWAP oracle outputs against external market references.
- Extend TTL for persistent entries that must remain live.
- Reassess storage layout and hot paths when pools or position counts materially increase.

---

## 9. Performance Estimates

| Operation | Cost (XLM) | Time (ms) | Storage Used |
|-----------|-----------|----------|--------------|
| Pool creation | 50 | 500 | 2 KB |
| Swap (single tick) | 50 | 300 | - |
| Swap (5-tick route) | 200 | 800 | - |
| Add liquidity (1 position) | 100 | 600 | 500 B |
| Collect fees (1 position) | 30 | 200 | - |
| TWAP oracle query | 20 | 100 | - |
| Storage rental (annual, 10 positions) | 100+ | - | 5 KB |

---

## 10. Appendix: Code Skeleton

### Router Swap Example

```rust
use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};

#[contract]
pub struct Router;

#[contractimpl]
impl Router {
    pub fn swap_exact_input_single(
        env: Env,
        pool: Address,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> i128 {
        // 1. Transfer token_in to pool
        token::Client::new(&env, &token_in)
            .transfer_from(
                &env.invoker(),
                &env.current_contract_address(),
                &pool,
                &amount_in,
            );
        
        // 2. Call pool.swap()
        let amount_out = pool_contract::Client::new(&env, &pool)
            .swap(
                &token_in,
                &amount_in,
                &min_amount_out,
            );
        
        // 3. Transfer token_out from pool to user
        token::Client::new(&env, &token_out)
            .transfer(
                &pool,
                &env.invoker(),
                &amount_out,
            );
        
        Ok(amount_out)
    }
}
```

---
