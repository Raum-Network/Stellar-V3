#!/bin/bash
set -e

NETWORK="testnet"
DEPLOYER="RaumFi"
DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER")
WASM_DIR="target/wasm32v1-none/release"

# Existing Token IDs
XLM_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
USDC_ID="CBYCJLKZT3X5JCK2SBX3YZYIIX5S4MVA3EUEAHBOUSUH7SOZ7SN5SPZF"

echo "============================================"
echo "  Full-Stack Redeployment (Round 3 - Fixes)"
echo "============================================"
echo "Deployer: $DEPLOYER_ADDRESS"
echo "XLM:      $XLM_ID"
echo "USDC:     $USDC_ID"
echo ""

# 1. Deploy Position Manager
echo "1. Deploying Position Manager..."
MANAGER_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_position_manager.wasm" --source "$DEPLOYER" --network "$NETWORK")
echo "   ✓ $MANAGER_ID"
echo "MANAGER_ID=$MANAGER_ID" > ids.txt

# 2. Deploy Factory
echo "2. Deploying Factory..."
FACTORY_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_factory.wasm" --source "$DEPLOYER" --network "$NETWORK")
echo "   ✓ $FACTORY_ID"
echo "FACTORY_ID=$FACTORY_ID" >> ids.txt

# 3. Deploy Router
echo "3. Deploying Router..."
ROUTER_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_router.wasm" --source "$DEPLOYER" --network "$NETWORK")
echo "   ✓ $ROUTER_ID"
echo "ROUTER_ID=$ROUTER_ID" >> ids.txt

# 4. Deploy Governance
echo "4. Deploying Governance..."
GOV_ID=$(stellar contract deploy --wasm "$WASM_DIR/clmm_governance.wasm" --source "$DEPLOYER" --network "$NETWORK")
echo "   ✓ $GOV_ID"
echo "GOV_ID=$GOV_ID" >> ids.txt

# 5. Initialize Position Manager (needs factory)
echo "5. Initializing Position Manager..."
stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    initialize --admin "$DEPLOYER_ADDRESS" --factory "$FACTORY_ID" --name "RAUM LP" --symbol "RLP"
echo "   ✓ initialized"

# 6. Install Pool WASM + Initialize Factory (needs manager)
echo "6. Installing Pool WASM..."
POOL_WASM_HASH=$(stellar contract install --wasm "$WASM_DIR/clmm_pool.wasm" --source "$DEPLOYER" --network "$NETWORK")
echo "   ✓ Hash: $POOL_WASM_HASH"

echo "   Initializing Factory..."
stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    initialize --admin "$DEPLOYER_ADDRESS" --wasm_hash "$POOL_WASM_HASH" --position_manager "$MANAGER_ID"
echo "   ✓ initialized"

# 7. Initialize Router (needs factory + XLM)
echo "7. Initializing Router..."
stellar contract invoke --id "$ROUTER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    initialize --admin "$DEPLOYER_ADDRESS" --factory "$FACTORY_ID" --xlm "$XLM_ID"
echo "   ✓ initialized"

# 8. Initialize Governance (needs admin + voting token)
echo "8. Initializing Governance..."
stellar contract invoke --id "$GOV_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    initialize --admin "$DEPLOYER_ADDRESS" --voting_token "$XLM_ID"
echo "   ✓ initialized"

# 9. Create XLM/USDC Pool via Factory
echo "9. Creating XLM/USDC Pool (tick -18326, fee 3000)..."
POOL_ID=$(stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    create_pool --token_a "$XLM_ID" --token_b "$USDC_ID" --fee 3000 --initial_tick=-18326)
POOL_ID=$(echo "$POOL_ID" | tr -d '"')
echo "   ✓ Pool: $POOL_ID"
echo "POOL_ID=$POOL_ID" >> ids.txt

# 10. Approve tokens (XLM + USDC) for Manager and Pool
echo "10. Approving tokens..."
# XLM (Native SAC)
stellar contract invoke --id "$XLM_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    approve --from "$DEPLOYER_ADDRESS" --spender "$MANAGER_ID" --amount 99999999999999 --expiration_ledger 3100000
echo "   ✓ XLM -> Manager"
stellar contract invoke --id "$XLM_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    approve --from "$DEPLOYER_ADDRESS" --spender "$POOL_ID" --amount 99999999999999 --expiration_ledger 3100000
echo "   ✓ XLM -> Pool"

# USDC (Soroban Token)
stellar contract invoke --id "$USDC_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    approve --from "$DEPLOYER_ADDRESS" --spender "$MANAGER_ID" --amount 999999999999 --expiration_ledger 3100000
echo "   ✓ USDC -> Manager"
stellar contract invoke --id "$USDC_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    approve --from "$DEPLOYER_ADDRESS" --spender "$POOL_ID" --amount 999999999999 --expiration_ledger 3100000
echo "   ✓ USDC -> Pool"

# 11. Mint Liquidity
echo "11. Minting Liquidity Position 0 (XLM side, full range)..."
stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    mint \
    --token_a "$USDC_ID" \
    --token_b "$XLM_ID" \
    --fee 3000 \
    --to "$DEPLOYER_ADDRESS" \
    --tick_lower=-887220 \
    --tick_upper 887220 \
    --liquidity 7800000000000
echo "   ✓ Position 0 Minted"

echo "12. Minting Liquidity Position 1 (USDC side, tick -18300 to 0)..."
stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    mint \
    --token_a "$USDC_ID" \
    --token_b "$XLM_ID" \
    --fee 3000 \
    --to "$DEPLOYER_ADDRESS" \
    --tick_lower=-18300 \
    --tick_upper 0 \
    --liquidity 334000000000
echo "   ✓ Position 1 Minted"

echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo "Position Manager: $MANAGER_ID"
echo "Factory:          $FACTORY_ID"
echo "Router:           $ROUTER_ID"
echo "Governance:       $GOV_ID"
echo "XLM:              $XLM_ID"
echo "USDC:             $USDC_ID"
echo "Pool:             $POOL_ID"
echo ""

# Update Frontend Files
cat <<EOF > /home/ubuntu/Uni-v3-stellar/frontend/src/contracts/new_ids.json
{
  "network": "$NETWORK",
  "deployer": "$DEPLOYER_ADDRESS",
  "governance": "$GOV_ID",
  "factory": "$FACTORY_ID",
  "router": "$ROUTER_ID",
  "position_manager": "$MANAGER_ID",
  "xlm": "$XLM_ID",
  "usdc": "$USDC_ID",
  "xlm_usdc_pool": "$POOL_ID"
}
EOF
echo "Saved to new_ids.json ✓"

cat <<EOF > /home/ubuntu/Uni-v3-stellar/frontend/src/contracts/config.ts
export const CONTRACT_IDS = {
    // Full-stack redeployment $(date +%Y-%m-%d)
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
echo "Updated config.ts ✓"
