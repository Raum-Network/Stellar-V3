#!/bin/bash
set -e
NETWORK="testnet"
POOL_ID="CASGZRAGZ5KQLCMIXQISVRIHI4G3HPYNAZDGJNJIY6BKQLHN3MSYT6BK"
TOKEN_OUT="CAH47AOAOIZKI6LHQLADEXN5CROC6JAE3UOXZ7PEMVFMYUTMMS5FVAU3"

echo "Checking Pool: $POOL_ID"
echo "Token Out: $TOKEN_OUT"

echo "--- Pool Balances ---"
# Check Token Out Balance of Pool
# Using `soroban contract invoke` on the Token contract
echo "Pool Balance of TokenOut:"
soroban contract invoke --id "$TOKEN_OUT" --network "$NETWORK" --source RaumFi -- balance --id "$POOL_ID"

echo "--- Pool State ---"
# Check Pool Liquidity and Tick
# Using `get_liquidity`? Need to check exposed functions.
# Assuming standard getters if available, or just reading storage if possible (CLI read is hard for complex keys).
# Inspecting `lib.rs` shows `get_pool` on Factory returns address.
# Does Pool expose `get_state`? Likely not public.
# But I can access storage with `soroban contract read` if I know the key.
# Helper: Invoke `get_liquidity` if it exists.
# Inspecting `contracts/pool/src/lib.rs`... it does NOT verify getters.
# Wait, `get_liquidity` is not exposed in `lib.rs`.
# I might need to add getters or trust `read`?
# Ah, `soroban contract read` is deprecated/removed? No, `stellar contract read` exists.
# Key for PoolState is `DataKey::Pool` (Enum variant).
# This is hard to construct in CLI.

# Alternative: Invoke `snapshot` or similar if I added it? No.
# Use `initialize`? No.
# Maybe I can just `swap` 1 unit to see logs?
# Or `observe`?
# `observe` is public.
# It uses `get_pool_state`.
# But it returns `(tick_cum, liq_cum)`.
# Time weighted.

# Let's try to infer from a simulated swap that fails?
# The user log already gave us info.
# But I want to confirm current balance.

exit 0
