#!/bin/bash
set -e

# Configuration
NETWORK="testnet"
DEPLOYER="${1:-RaumFi}" 

# Derived from first run
GOV_ID="CDWIIQ3ZP23LF3ADT4YXZ53Q2SMZI3363PS3MPLN6LHN75J5GZOV4QL7"
FACTORY_ID="CCFSSVSQBRYSFTPHUTPQD44ANB2DAGVLOHLH2PIEY6XEWDCF4KW7EFGY"
ROUTER_ID="CC55D6LWTSBT4JRTP2VJZMAOL7XYRSIFOUIK2GCV6EZR7Q5EJJPBDI4T"
MANAGER_ID="CA43XIDUUWSAVFDCGRUVEEBIIRMKXUYTKRA32D5CN6OF276LWQPDMLUH"

echo "Using Deployed IDs:"
echo "Gov: $GOV_ID"
echo "Factory: $FACTORY_ID"
echo "Router: $ROUTER_ID"
echo "Manager: $MANAGER_ID"

# 5. Get Native Asset ID
echo "Getting Native Asset ID (XLM)..."
# Use the correct command found (assuming check works, or using asset deploy)
XLM_ID=$(soroban contract asset id --asset native --network "$NETWORK")
echo "XLM ID: $XLM_ID"

# 6. Initialize Governance
echo "Initializing Governance..."
soroban contract invoke --id "$GOV_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER" \
    --voting_token "$XLM_ID"

# 7. Initialize Factory
echo "Initializing Factory..."
# Upload Pool WASM to get hash
echo "Installing Pool WASM..."
POOL_WASM_HASH=$(soroban contract upload \
    --wasm target/wasm32-unknown-unknown/release/clmm_pool.optimized.wasm \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Pool Hash: $POOL_WASM_HASH"

soroban contract invoke --id "$FACTORY_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER" \
    --wasm_hash "$POOL_WASM_HASH"

# 8. Initialize Router
echo "Initializing Router..."
soroban contract invoke --id "$ROUTER_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER" \
    --factory "$FACTORY_ID" \
    --xlm "$XLM_ID"

# 9. Initialize Position Manager
echo "Initializing Position Manager..."
soroban contract invoke --id "$MANAGER_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER" \
    --factory "$FACTORY_ID" \
    --name "RAUM LP Position" \
    --symbol "RAUM-LP"

# 10. Enable Fee Tiers
echo "Enabling Fee Tiers..."
soroban contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- enable_fee_tier --fee 500 --tick_spacing 10
soroban contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- enable_fee_tier --fee 3000 --tick_spacing 60
soroban contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- enable_fee_tier --fee 10000 --tick_spacing 200

# 11. Transfer Admin to Governance
echo "Transferring Factory Admin to Governance..."
soroban contract invoke --id "$FACTORY_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    set_admin \
    --new_admin "$GOV_ID"

# 12. Save IDs
echo "Saving IDs to public_ids.json..."
cat <<EOF > public_ids.json
{
  "network": "$NETWORK",
  "governance": "$GOV_ID",
  "factory": "$FACTORY_ID",
  "router": "$ROUTER_ID",
  "position_manager": "$MANAGER_ID",
  "pool_hash": "$POOL_WASM_HASH"
}
EOF

echo "Deployment Part 2 Complete!"
