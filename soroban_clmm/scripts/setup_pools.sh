#!/bin/bash
set -e

NETWORK="testnet"
FRIENDBOT_URL="https://friendbot.stellar.org"

echo "Using network: $NETWORK"

# 1. Get Contract IDs
PUBLIC_IDS="public_ids.json"
if [ ! -f "$PUBLIC_IDS" ]; then PUBLIC_IDS="soroban_clmm/public_ids.json"; fi

FACTORY=$(cat "$PUBLIC_IDS" | jq -r .factory)
ROUTER=$(cat "$PUBLIC_IDS" | jq -r .router)
PM=$(cat "$PUBLIC_IDS" | jq -r .position_manager)
XLM_ID=$(soroban contract asset id --asset native --network $NETWORK)

# 2. Key Setup
ADMIN_ADDRESS=$(soroban keys address RaumFi)
USER_ADDRESS=$(soroban keys address User)
echo "User: $USER_ADDRESS"

# 3. Deploy/Get Mock USDC
echo "Getting Mock USDC..."
USDC_ID=$(soroban contract asset id --asset "USDC:$ADMIN_ADDRESS" --network $NETWORK 2>/dev/null || echo "not_found")
if [ "$USDC_ID" == "not_found" ]; then
    echo "Deploying Mock USDC..."
    soroban contract asset deploy --asset "USDC:$ADMIN_ADDRESS" --source-account RaumFi --network $NETWORK
    USDC_ID=$(soroban contract asset id --asset "USDC:$ADMIN_ADDRESS" --network $NETWORK)
fi
echo "USDC: $USDC_ID"

# 4. Create XLM/USDC Pool (0.3% fee = 3000)
echo "Ensuring XLM/USDC Pool exists..."
POOL=$(soroban contract invoke \
  --id $FACTORY \
  --source-account RaumFi \
  --network $NETWORK \
  -- \
  get_pool \
  --token_a $XLM_ID \
  --token_b $USDC_ID \
  --fee 3000 2>/dev/null || echo "not_found")

if [ "$POOL" == "not_found" ] || [ -z "$POOL" ]; then
    echo "Creating Pool..."
    POOL=$(soroban contract invoke \
      --id $FACTORY \
      --source-account RaumFi \
      --network $NETWORK \
      -- \
      create_pool \
      --token_a $XLM_ID \
      --token_b $USDC_ID \
      --fee 3000 \
      --initial_tick 0 | tr -d '"')
    echo "Created Pool: $POOL"
else
    echo "Pool exists: $POOL"
fi

# 5. Add Trustline for User
echo "Adding trustline for User..."
export ADMIN_ADDRESS=$ADMIN_ADDRESS
export USER_SECRET=$(soroban keys show User)
node scripts/add_trustline.js

# 6. Mint USDC to User
soroban contract invoke \
  --id $USDC_ID \
  --source-account RaumFi \
  --network $NETWORK \
  -- \
  mint \
  --to $USER_ADDRESS \
  --amount 10000000000000 # 1,000,000 USDC

# 6. Add Liquidity via PM
echo "Adding Liquidity via Position Manager..."
soroban contract invoke \
  --id $PM \
  --source-account User \
  --network $NETWORK \
  -- \
  mint \
  --token_a $XLM_ID \
  --token_b $USDC_ID \
  --fee 3000 \
  --to $USER_ADDRESS \
  --tick_lower -60 \
  --tick_upper 60 \
  --liquidity 10000000000

echo "Setup COMPLETE."
# Update public_ids.json
jq --arg usdc "$USDC_ID" --arg pool "$POOL" '.USDC_ID = $usdc | .XLM_USDC_POOL = $pool' "$PUBLIC_IDS" > tmp.json && mv tmp.json "$PUBLIC_IDS"
