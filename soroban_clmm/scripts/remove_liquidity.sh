#!/bin/bash
set -e

# Contract IDs
MANAGER_ID="CA263HIIFIENJ7HLYLNS5CPZWD74PQW7FIFQFCDZHNK7YI2AAPDFATN3"
POOL_ID="CBOJMZGL6XHBWXNZG27EVCJHSFEMOXDWJ4RO2PN6XISTKUTHRAUN6IA4"
DEPLOYER="RaumFi"
DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER")

# Start Amounts
# Token 0: 20B
LIQ_0=20000000000
# Token 1: 500B
LIQ_1=500000000000
# Token 2: 6T
LIQ_2=6000000000000

# Remove (Total - 1) to avoid triggering full burn logic
REM_0=$((LIQ_0 - 1))
REM_1=$((LIQ_1 - 1))
REM_2=$((LIQ_2 - 1))

echo "============================================"
echo "  Removing Partial Liquidity (Leaves 1 wei)"
echo "============================================"
echo "Pool: $POOL_ID"
echo "Manager: $MANAGER_ID"
echo "Recipient: $DEPLOYER_ADDRESS"
echo ""

# Burn Token 0
echo "Removing $REM_0 from Token 0 (Total $LIQ_0)..."
stellar contract invoke \
    --id "$MANAGER_ID" \
    --source "$DEPLOYER" \
    --network testnet \
    -- burn \
    --pool "$POOL_ID" \
    --to "$DEPLOYER_ADDRESS" \
    --token_id 0 \
    --liquidity "$REM_0" 2>/dev/null && echo "✓ Token 0 drained" || echo "✗ Failed"
echo ""

# Burn Token 1
echo "Removing $REM_1 from Token 1 (Total $LIQ_1)..."
stellar contract invoke \
    --id "$MANAGER_ID" \
    --source "$DEPLOYER" \
    --network testnet \
    -- burn \
    --pool "$POOL_ID" \
    --to "$DEPLOYER_ADDRESS" \
    --token_id 1 \
    --liquidity "$REM_1" 2>/dev/null && echo "✓ Token 1 drained" || echo "✗ Failed"
echo ""

# Burn Token 2
echo "Removing $REM_2 from Token 2 (Total $LIQ_2)..."
stellar contract invoke \
    --id "$MANAGER_ID" \
    --source "$DEPLOYER" \
    --network testnet \
    -- burn \
    --pool "$POOL_ID" \
    --to "$DEPLOYER_ADDRESS" \
    --token_id 2 \
    --liquidity "$REM_2" 2>/dev/null && echo "✓ Token 2 drained" || echo "✗ Failed"
echo ""

echo "============================================"
echo "  Validation Complete"
echo "============================================"
