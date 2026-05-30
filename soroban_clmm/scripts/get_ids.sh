#!/bin/bash
NETWORK="testnet"
DEPLOYER="RaumFi"
WASM_DIR="target/wasm32v1-none/release"

echo "=== Retrieving IDs ==="
MANAGER_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_position_manager.wasm" --source "$DEPLOYER" --network "$NETWORK" 2>/dev/null)
echo "Manager: $MANAGER_ID"

FACTORY_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_factory.wasm" --source "$DEPLOYER" --network "$NETWORK" 2>/dev/null)
echo "Factory: $FACTORY_ID"

ROUTER_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_router.wasm" --source "$DEPLOYER" --network "$NETWORK" 2>/dev/null)
echo "Router: $ROUTER_ID"

GOV_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_governance.wasm" --source "$DEPLOYER" --network "$NETWORK" 2>/dev/null)
echo "Governance: $GOV_ID"

XLM_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
USDC_ID="CBYCJLKZT3X5JCK2SBX3YZYIIX5S4MVA3EUEAHBOUSUH7SOZ7SN5SPZF"

# Get Pool ID from Factory
echo "Querying Pool..."
POOL_ID=$(stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    get_pool --token_a "$XLM_ID" --token_b "$USDC_ID" --fee 3000)
POOL_ID=$(echo "$POOL_ID" | tr -d '"')
echo "Pool: $POOL_ID"

# Save to JSON
cat <<EOF > /home/ubuntu/Uni-v3-stellar/frontend/src/contracts/new_ids.json
{
  "network": "$NETWORK",
  "deployer": "$(stellar keys address $DEPLOYER)",
  "governance": "$GOV_ID",
  "factory": "$FACTORY_ID",
  "router": "$ROUTER_ID",
  "position_manager": "$MANAGER_ID",
  "xlm": "$XLM_ID",
  "usdc": "$USDC_ID",
  "xlm_usdc_pool": "$POOL_ID"
}
EOF

# Update config.ts
cat <<EOF > /home/ubuntu/Uni-v3-stellar/frontend/src/contracts/config.ts
export const CONTRACT_IDS = {
    // Retreived $(date +%Y-%m-%d)
    governance: "$GOV_ID",
    factory: "$FACTORY_ID",
    router: "$ROUTER_ID",
    position_manager: "$MANAGER_ID",
    xlm: "$XLM_ID",
    usdc: "$USDC_ID",
    xlm_usdc_pool: "$POOL_ID"
};

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const RPC_URL = "https://soroban-testnet.stellar.org";
EOF
