# Uniswap V3 CLMM on Stellar Soroban: Implementation Guide

## Quick Reference

### Architecture Layers

```
┌────────────────────────────────────────────────────────────┐
│  USER INTERACTION LAYER                                    │
│  ├─ Router Contract      (Multi-hop swaps, pricing)       │
│  └─ Position Manager     (Position tracking, NFTs)        │
├────────────────────────────────────────────────────────────┤
│  CORE PROTOCOL LAYER                                       │
│  ├─ Factory Contract     (Pool deployment, fee tiers)     │
│  └─ Pool Contract(s)     (Swap execution, tick management)│
├────────────────────────────────────────────────────────────┤
│  STORAGE & DATA LAYER                                      │
│  ├─ Persistent Storage   (Pool state, tick data, positions)
│  ├─ Temporary Storage    (Oracle feeds, allowances)       │
│  └─ Instance Storage     (Contract config ~50-100 KB)     │
├────────────────────────────────────────────────────────────┤
│  TOKEN INTEGRATION                                         │
│  ├─ SAC (Stellar Assets)        (98% gas efficiency)     │
│  └─ Soroban Contract Tokens     (Flexible, custom logic)  │
└────────────────────────────────────────────────────────────┘
```

---

## Implementation Workstreams

### Foundation
- [ ] Factory contract scaffold
- [ ] Pool contract core (state management)
- [ ] Basic token interface abstraction (SAC + Soroban token support)
- [ ] Storage schema and key naming convention

### Swap Engine
- [ ] Tick-to-price conversion (Q64.96 fixed-point math)
- [ ] Swap execution with tick crossing
- [ ] Liquidity state tracking and management
- [ ] Fee accumulation and collection

### Liquidity Management
- [ ] Mint (add liquidity with price range)
- [ ] Burn (remove liquidity)
- [ ] Fee calculation and claim
- [ ] Position data serialization

### User-Facing Contracts
- [ ] Router contract (multi-hop logic)
- [ ] Position Manager (NFT-like tracking)
- [ ] Swap quoter (off-chain price calculation)
- [ ] Integration tests

### Oracle and Hardening
- [ ] TWAP oracle accumulator
- [ ] Historical observation storage
- [ ] Security audits and optimization

---

## Technical Decision Matrix

### Tick Storage Approach

| Approach | Pros | Cons | Best Fit |
|----------|------|------|----------|
| **Individual keys per tick** | Simple key-value model; per-tick updates; clean separation | High cardinality keys; more storage reads per swap | Default Soroban implementation, especially below ~50K initialized ticks |
| **Tick batching** | Fewer keys; one read per batch | Complex batch management; must know batch boundaries | High-density pools where read consolidation matters more than simplicity |
| **Tick bitmap** (V3 original) | Space-efficient; fast iteration | Requires bit-level manipulation; WASM overhead | Generally avoid on Soroban unless profiling proves a clear advantage |

### Position Tracking Approach

| Approach | Pros | Cons | Best Fit |
|----------|------|------|----------|
| **Full NFT (ERC-721-like)** | True ownership; transferable; familiar to Ethereum users | Higher storage overhead; complex metadata | Best when positions are intended to be portable and user-visible |
| **Simplified token** | Lower gas; simpler implementation | Less feature-rich; harder to transfer | Good fallback if position storage becomes too expensive |
| **Mapped positions** | Minimal overhead | Not transferable; no secondary market | Best for protocol-managed liquidity only |

### Fee Model

| Model | Pros | Cons | Best Fit |
|-------|------|------|----------|
| **Hardcoded fees (0.05%, 0.3%, 1%)** | Simple; predictable; matches Uniswap | Less flexibility | Baseline implementation and easiest to audit |
| **Dynamic fees (governance)** | Responsive to volatility; optimizes LPs | Complex; governance overhead | Extension once governance and fee policy are mature |
| **Flash loan fees** | Additional revenue | Adds complexity; limited demand | Usually omit unless flash-loan support becomes a core product goal |

---

## Storage Cost Analysis

### Scenario 1: Small Active Trader (1 pool, 2 positions)

```
Initial Costs:
  Factory pool registration    :   5 XLM
  Pool creation               :  50 XLM
  Position 1 mint            :  10 XLM
  Position 2 mint            :  10 XLM
  ────────────────────────────
  Total initial              :  75 XLM

Monthly Operating:
  10 swaps × 50 XLM          : 500 XLM
  2 fee collections × 30 XLM :  60 XLM
  Storage rental             :   1 XLM (2 positions + 20 ticks)
  ────────────────────────────
  Total monthly              : 561 XLM
  
Annual Total                 :  ~6,800 XLM
```

### Scenario 2: Protocol with 1000+ Positions (1000 swaps/day)

```
One-time:
  Factory + pool setup       : 100 XLM
  
Daily costs:
  Swaps (1000 × 50 XLM)      : 50,000 XLM
  Fee collections (avg 500 × 30): 15,000 XLM
  Storage rental (1000 positions): 50 XLM
  ────────────────────────────
  Daily total                : 65,050 XLM

Monthly (22 trading days)    : 1,431,100 XLM
Annual                       : 17,173,200 XLM (~$3.5M USD @ $0.20/XLM)
```

**Cost Reduction via SAC**: If 80% of trading uses SAC (98% gas savings):
- Annual cost drops to ~$2.1M (40% reduction)

---

## Implementation Checklist

### Contract Initialization

```rust
// Factory init
√ Register 3 fee tiers (0.05%, 0.3%, 1%)
√ Set tick spacing per tier (10, 60, 200)
√ Initialize owner/admin
√ Create pool registry

// Pool init (per pool)
√ Set token0, token1, fee
√ Initialize current tick from initial_sqrt_price
√ Create empty TWAP observation array (initialize with genesis block)
√ Set liquidity to 0 (first LP provider will set actual value)

// Router init
√ Link to Factory
√ Link to Position Manager
√ Set wrapped XLM address (or native token)

// Position Manager init
√ Link to Factory
√ Initialize position counter to 0
```

### Gas Optimization Priorities

1. **Batch tick crossings**: Avoid per-tick storage reads
   ```rust
   // AVOID:
   for each_tick_in_range {
       let tick_data = get_tick_data(tick);  // 100+ reads
   }
   
   // BETTER:
   let affected_ticks = identify_crossing_ticks(current_price, target_price);
   let tick_batch = get_tick_data_batch(affected_ticks);  // 1-2 reads
   ```

2. **Cache frequently-accessed values in Instance Storage**:
   ```rust
   // Instance (fast): sqrt_price, current_tick, liquidity
   // Persistent (slower): tick data, positions, oracle history
   ```

3. **Use fixed-point math (no floating-point)**:
   ```rust
   // AVOID: 1.0001_f64.powi(tick) — floating-point overhead
   
   // BETTER: Use Q64.96 fixed-point representation
   // Price stored as fixed256, operations via integer arithmetic
   ```

4. **Lazy oracle updates**:
   ```rust
   // Only update TWAP observation if time has advanced >= 1 second
   if (current_time > last_observation_time) {
       create_observation();
   }
   ```

### Testing Strategy

**Unit Tests** (per contract):
- [ ] Tick-to-price conversion (50 tick samples across range)
- [ ] Liquidity calculation from amounts
- [ ] Swap execution (single tick, multi-tick, edge cases)
- [ ] Position mint/burn/collect

**Integration Tests** (contract to contract):
- [ ] Factory → Pool creation
- [ ] Router → Pool → Token transfers
- [ ] Position Manager → Pool fee collection
- [ ] Multi-hop swap routing

**Load Tests** (stress):
- [ ] 100 concurrent swaps in one pool
- [ ] 1000 positions in one pool
- [ ] TWAP oracle query over 30-day history
- [ ] Tick crossing validation (5+ ticks in single swap)

**Security Tests**:
- [ ] Flash loan (ensure not possible)
- [ ] Reentrancy (attempt cross-contract calls)
- [ ] Tick boundary violations
- [ ] Price slippage attack (sandwich prevention)

---

## Soroban SDK Integration

### Required Dependencies

```toml
[dependencies]
soroban-sdk = { version = "21.0", features = ["testutils"] }
soroban-token-sdk = "21.0"

[dev-dependencies]
soroban-sdk = { version = "21.0", features = ["testutils"] }
```

### Key SDK Patterns

```rust
// 1. Address handling (both Accounts and Contracts)
use soroban_sdk::Address;

let user: Address = Address::Account(stellar_account_id);
let pool: Address = Address::Contract(contract_id);

// 2. Token invocation via generated client
use soroban_sdk::token;

let token_client = token::Client::new(&env, &token_address);
token_client.transfer(&from, &to, &amount);

// 3. Persistent storage with TTL
use soroban_sdk::Env;

env.storage().persistent()
    .set(&DataKey::TickData(tick_index), &tick_data);
    
// Extend TTL when accessing
env.storage().extend_ttl(
    soroban_sdk::StorageType::Persistent,
    10_000_000,  // ~115 days at 5-sec blocks
);

// 4. Calling other contracts
use soroban_sdk::InvokeContractArgs;

let args = InvokeContractArgs {
    contract_id: pool_address,
    function_name: "swap",
    args: args_vec,
};

let result: i128 = env.invoke_contract(&args);

// 5. Authorization patterns (soroban-specific)
use soroban_sdk::auth::{Context, approve_auth};

// Single transaction approval (no separate step)
pub fn transfer_with_auth(
    env: &Env,
    from: Address,
    to: Address,
    amount: i128,
) {
    from.require_auth();  // Signature verification
    token_client.transfer(&from, &to, &amount);
}
```

---

## Deployment Checklist

### Pre-Deployment (Testnet)

- [ ] All contracts pass unit tests (100% coverage on critical paths)
- [ ] Integration tests pass (factory → pool → router flow)
- [ ] Gas profiling complete (identify hot paths)
- [ ] Storage key naming finalized
- [ ] Error codes documented
- [ ] Contract interfaces frozen (immutable after deploy)

### Testnet Deployment

```bash
# 1. Deploy Factory
soroban contract deploy \
  --source account \
  --network testnet \
  factory.wasm
  
# 2. Deploy Pool template
soroban contract deploy \
  --source account \
  --network testnet \
  pool.wasm

# 3. Initialize Factory (link to Pool template)
soroban contract invoke \
  --source account \
  --network testnet \
  --id factory_address \
  initialize --pool-template pool_address

# 4. Test pool creation
soroban contract invoke \
  --source account \
  --network testnet \
  --id factory_address \
  create_pool \
  --token0 xlm \
  --token1 usdc \
  --fee 3000000  # 0.3%
```

### Mainnet Readiness

- [ ] Security audit completed (Certora/Trail of Bits)
- [ ] Economics modeling (fee distribution, LP incentives)
- [ ] Governance framework designed (fee changes, parameter updates)
- [ ] Disaster recovery plan (contract upgrade paths, fallback mechanisms)
- [ ] Monitoring & alerting infrastructure
- [ ] Documentation complete (user guide, API reference)

---

## Known Limitations & Workarounds

### Limitation 1: WASM Size (64 KB optimal, 256 KB max)

**Issue**: Full featured CLMM may approach size limits.

**Workarounds**:
- Split into modular contracts (Factory, Pool, Router separate)
- Remove v4-style dynamic fee logic (keep v3 static fees)
- Strip extensive error messages; use error codes only

### Limitation 2: Per-Transaction Key Limit (100 keys)

**Issue**: Complex swaps crossing 50+ ticks = 50+ key reads (potentially exceeds limit).

**Workaround**: Implement swap batching—break large swaps into multiple transactions.

```rust
pub fn swap_large(
    token_in: Address,
    amount: i128,
    // ...
) {
    let mut remaining = amount;
    while remaining > 0 {
        let output = swap_single_batch(token_in, remaining, 10_ticks_max);
        remaining -= output;
    }
}
```

### Limitation 3: No Flash Loans

**Issue**: Soroban's atomic execution prevents intermediate liquidity states needed for flash loans.

**Workaround**: Design an alternative composable liquidity mechanism:
- Borrow-only pools (LP pledges collateral)
- Time-locked cross-contract calls
- Wrapped token intermediaries

### Limitation 4: Storage Rental Model (TTL-based)

**Issue**: Long-lived positions require continuous rent extensions (XLM cost).

**Workaround**: Implement auto-renewal mechanism:
```rust
pub fn extend_position_ttl(position_id: u64) {
    env.storage().extend_ttl(...);
    // Emit event: PositionRenewed
}

// Off-chain service monitors and auto-extends for inactive positions
```

---

## Optional Extensions

- Dynamic fee tiers (governance-adjustable)
- Position manager improvements for richer NFT UX
- Yield farming hooks
- Cross-chain bridging integrations
- V4-style hooks or callback logic
- Singleton architecture experiments
- Liquidity mining modules
- Additional risk management controls

---

## References & Resources

### Uniswap V3 Resources
- Whitepaper: https://uniswap.org/whitepaper-v3.pdf
- Core Contracts: https://github.com/Uniswap/v3-core
- SDK: https://github.com/Uniswap/v3-sdk

### Stellar Soroban Documentation
- Developers Guide: https://developers.stellar.org
- Soroban SDK: https://docs.rs/soroban-sdk/latest/soroban_sdk/
- SAC Reference: https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Storage Deep Dive: https://developers.stellar.org/docs/build/guides/storage/

### Security Best Practices
- Trail of Bits: Smart Contract Security
- OpenZeppelin Contracts Library: https://github.com/OpenZeppelin/openzeppelin-contracts

### Performance Profiling
- Soroban Profiler: https://github.com/stellar/rs-soroban-sdk/tree/main/soroban-sdk/src/auth
- Ledger Entry Size Calculator: Use Soroban sandbox for local testing

---

## Contact & Support

For questions on this architecture:
- Stellar Developer Docs: https://developers.stellar.org
- Stellar Discord: https://discord.gg/stellar-dev
- Soroban Examples: https://github.com/stellar/rs-soroban-examples
