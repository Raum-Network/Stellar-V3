#!/bin/bash
set -e

# NFT-Based Position Architecture Deployment Script
# This deploys the new architecture where PositionManager is an NFT contract

NETWORK="testnet"
DEPLOYER="${1:-RaumFi}" 

echo "============================================"
echo "NFT-Based CLMM Deployment"
echo "============================================"
echo "Deployer Identity: $DEPLOYER"
echo "Network: $NETWORK"
echo ""

# Get deployer address
DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER")
echo "Deployer Address: $DEPLOYER_ADDRESS"

# WASM files location (using new wasm32v1-none target)
WASM_DIR="target/wasm32v1-none/release"

# Check that WASMs exist
echo "Checking WASM files..."
for contract in clmm_factory clmm_pool clmm_router clmm_position_manager clmm_governance soroban_token; do
    if [ ! -f "$WASM_DIR/${contract}.wasm" ]; then
        echo "ERROR: $WASM_DIR/${contract}.wasm not found"
        echo "Run 'stellar contract build' first"
        exit 1
    fi
done
echo "All WASM files found ✓"
echo ""

# 1. Deploy Position Manager (NFT Contract) FIRST
# We need its address before Factory initialization
echo "Step 1: Deploying Position Manager (NFT Contract)..."
MANAGER_ID=$(stellar contract deploy \
    --wasm "$WASM_DIR/clmm_position_manager.wasm" \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Position Manager ID: $MANAGER_ID"
echo ""

# 2. Deploy Factory
echo "Step 2: Deploying Factory..."
FACTORY_ID=$(stellar contract deploy \
    --wasm "$WASM_DIR/clmm_factory.wasm" \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Factory ID: $FACTORY_ID"
echo ""

# 3. Deploy Router
echo "Step 3: Deploying Router..."
ROUTER_ID=$(stellar contract deploy \
    --wasm "$WASM_DIR/clmm_router.wasm" \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Router ID: $ROUTER_ID"
echo ""

# 4. Deploy Governance
echo "Step 4: Deploying Governance..."
GOV_ID=$(stellar contract deploy \
    --wasm "$WASM_DIR/clmm_governance.wasm" \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Governance ID: $GOV_ID"
echo ""

# 5. Get Native XLM Asset ID
echo "Step 5: Getting Native Asset ID (XLM)..."
XLM_ID=$(stellar contract id asset --asset native --network "$NETWORK")
echo "XLM ID: $XLM_ID"
echo ""

# 6. Deploy a Test USDC Token
echo "Step 6: Deploying Test USDC Token..."
USDC_ID=$(stellar contract deploy \
    --wasm "$WASM_DIR/soroban_token.wasm" \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "USDC Token ID: $USDC_ID"
echo ""

# 7. Initialize USDC Token
echo "Step 7: Initializing USDC Token..."
stellar contract invoke --id "$USDC_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDRESS" \
    --decimals 7 \
    --name "Test USDC" \
    --symbol "USDC"
echo "USDC Token initialized ✓"
echo ""

# 8. Initialize Position Manager (NFT)
echo "Step 8: Initializing Position Manager (NFT)..."
stellar contract invoke --id "$MANAGER_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDRESS" \
    --factory "$FACTORY_ID" \
    --name "RAUM LP Position" \
    --symbol "RAUM-LP"
echo "Position Manager initialized ✓"
echo ""

# 9. Install Pool WASM and Initialize Factory
echo "Step 9: Installing Pool WASM..."
POOL_WASM_HASH=$(stellar contract install \
    --wasm "$WASM_DIR/clmm_pool.wasm" \
    --source "$DEPLOYER" \
    --network "$NETWORK")
echo "Pool WASM Hash: $POOL_WASM_HASH"

echo "Initializing Factory with Position Manager..."
stellar contract invoke --id "$FACTORY_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDRESS" \
    --wasm_hash "$POOL_WASM_HASH" \
    --position_manager "$MANAGER_ID"
echo "Factory initialized ✓"
echo ""

# 10. Initialize Router
echo "Step 10: Initializing Router..."
stellar contract invoke --id "$ROUTER_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDRESS" \
    --factory "$FACTORY_ID" \
    --xlm "$XLM_ID"
echo "Router initialized ✓"
echo ""

# 11. Initialize Governance  
echo "Step 11: Initializing Governance..."
stellar contract invoke --id "$GOV_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$DEPLOYER_ADDRESS" \
    --voting_token "$XLM_ID"
echo "Governance initialized ✓"
echo ""

# 12. Create XLM/USDC Pool
echo "Step 12: Creating XLM/USDC Pool..."
# Initial tick for ~$0.11 XLM price 
# tick = log(price) / log(1.0001) ≈ -20155 for 0.11
INITIAL_TICK=-20155

POOL_ID=$(stellar contract invoke --id "$FACTORY_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    create_pool \
    --token_a "$XLM_ID" \
    --token_b "$USDC_ID" \
    --fee 3000 \
    --initial_tick $INITIAL_TICK)
echo "Pool ID: $POOL_ID"
echo ""

# Save all IDs
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Saving contract addresses..."

cat <<EOF > nft_deployment.json
{
  "network": "$NETWORK",
  "deployer": "$DEPLOYER_ADDRESS",
  "contracts": {
    "governance": "$GOV_ID",
    "factory": "$FACTORY_ID",
    "router": "$ROUTER_ID",
    "position_manager": "$MANAGER_ID",
    "xlm": "$XLM_ID",
    "usdc": "$USDC_ID",
    "pool_xlm_usdc": "$POOL_ID",
    "pool_wasm_hash": "$POOL_WASM_HASH"
  }
}
EOF

echo "Contract addresses saved to nft_deployment.json"
echo ""
echo "Summary:"
echo "  Position Manager (NFT): $MANAGER_ID"
echo "  Factory:                $FACTORY_ID"
echo "  Router:                 $ROUTER_ID"
echo "  Governance:             $GOV_ID"
echo "  XLM:                    $XLM_ID"
echo "  USDC:                   $USDC_ID"
echo "  XLM/USDC Pool:          $POOL_ID"
echo ""
echo "Next steps:"
echo "  1. Update frontend/src/contracts/config.ts with new addresses"
echo "  2. Regenerate contract bindings"
echo "  3. Restart frontend"
