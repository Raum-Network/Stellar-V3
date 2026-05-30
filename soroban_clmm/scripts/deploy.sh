#!/bin/bash
set -e

# Configuration
NETWORK="testnet"
# Ensure you have an identity configured with `soroban config identity generate RaumFi` and funded
DEPLOYER="${1:-RaumFi}" 

echo "Using Deployer Identity: $DEPLOYER"
echo "Network: $NETWORK"

# 1. Build Contracts
echo "Building contracts..."
cargo build --target wasm32-unknown-unknown --release

# Optimize Contracts (Crucial for Soroban)
echo "Optimizing contracts..."
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/clmm_governance.wasm
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/clmm_factory.wasm
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/clmm_router.wasm
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/clmm_position_manager.wasm
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/clmm_pool.wasm

# 2. Deploy Governance
echo "Deploying Governance..."
GOV_ID=$(soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/clmm_governance.optimized.wasm \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Governance ID: $GOV_ID"

# 3. Deploy Factory
echo "Deploying Factory..."
FACTORY_ID=$(soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/clmm_factory.optimized.wasm \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Factory ID: $FACTORY_ID"

# 4. Deploy Router
echo "Deploying Router..."
ROUTER_ID=$(soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/clmm_router.optimized.wasm \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Router ID: $ROUTER_ID"

# 5. Deploy Position Manager
echo "Deploying Position Manager..."
MANAGER_ID=$(soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/clmm_position_manager.optimized.wasm \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Position Manager ID: $MANAGER_ID"

# 6. Initialize Governance
echo "Getting Native Asset ID (XLM)..."
XLM_ID=$(soroban contract id asset --asset native --network "$NETWORK")
echo "XLM ID: $XLM_ID"

echo "Initializing Governance..."
# Admin of Governance is the deployer for now, or itself? Usually deployer to start with.
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
POOL_WASM_HASH=$(soroban contract install \
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

# 10. Enable Fee Tiers (Directly as Deployer)
echo "Enabling Fee Tiers..."
# 0.05% (500), TickSpacing 10
soroban contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- enable_fee_tier --fee 500 --tick_spacing 10
# 0.3% (3000), TickSpacing 60
soroban contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- enable_fee_tier --fee 3000 --tick_spacing 60
# 1% (10000), TickSpacing 200
soroban contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- enable_fee_tier --fee 10000 --tick_spacing 200

# 11. Transfer Admin to Governance
echo "Transferring Factory Admin to Governance..."
soroban contract invoke --id "$FACTORY_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    set_admin \
    --new_admin "$GOV_ID"

# Output IDs to file
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

echo "Done!"
