#!/bin/bash
set -e

NETWORK="testnet"
DEPLOYER="RaumFi"
DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER")

# IDs Captured from previous run
MANAGER_ID="CCETTGQNVS2XB42HKGBM2CCD2XXQ7XXMCGOIO6SP4EFKZ7LSZES5EUN7"
FACTORY_ID="CDABCDEJQAMBH3TTBAPQA2O4LVI3543S3QQR6K6ZWVALOLAXQPGWP366"
ROUTER_ID="CD7GVLAOAZJFDKNMRD674MDOQOB6IPDF7BEUYSRMPD6IA7JYA62YDLNA"
GOV_ID="CC6N3WG2TXVZB6WX6R5Z744D5IKIBXRKFXTROF6PC52D2WN5VYPVTGTA"
POOL_ID="CDXKE2VTYX54VVWG3B6Q63DKS32MK6JNLTP4O46HUDMOCFFCAUBOQM6Q"

# Reuse existing Token IDs
XLM_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
USDC_ID="CBYCJLKZT3X5JCK2SBX3YZYIIX5S4MVA3EUEAHBOUSUH7SOZ7SN5SPZF"

echo "Using Deployed Contracts:"
echo "Manager: $MANAGER_ID"
echo "Pool:    $POOL_ID"

# Update Frontend Config
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

cat <<EOF > /home/ubuntu/Uni-v3-stellar/frontend/src/contracts/config.ts
export const CONTRACT_IDS = {
    // Full-stack redeployment (Manual Finish) $(date +%Y-%m-%d)
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
echo "Updated config files ✓"

# Mint Position 0 (Reduced Liquidity: 200k XLM)
echo "Minting Position 0 (200k XLM)..."
stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    mint \
    --token_a "$USDC_ID" \
    --token_b "$XLM_ID" \
    --fee 3000 \
    --to "$DEPLOYER_ADDRESS" \
    --tick_lower=-887220 \
    --tick_upper 887220 \
    --liquidity 100000000000
echo "   ✓ Position 0 Minted"

# Mint Position 1 (USDC Side)
echo "Minting Position 1 (USDC Side)..."
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
