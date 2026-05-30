#!/bin/bash
set -e

NETWORK="testnet"
DEPLOYER="${1:-RaumFi}" 

# Load Factory ID
if [ -f "public_ids.json" ]; then
    FACTORY_ID=$(grep -oP '"factory": "\K[^"]+' public_ids.json)
else
    echo "public_ids.json not found!"
    exit 1
fi

echo "Using Factory: $FACTORY_ID"
echo "Deployer: $DEPLOYER"

# 1. Generate Issuers
echo "Generating Issuer Keys..."

if ! stellar keys address issuer_a > /dev/null 2>&1; then
    echo "Generating issuer_a..."
    stellar keys generate --fund issuer_a
else
    echo "issuer_a exists. Funding..."
    stellar keys fund issuer_a || true
fi

if ! stellar keys address issuer_b > /dev/null 2>&1; then
    echo "Generating issuer_b..."
    stellar keys generate --fund issuer_b
else
    echo "issuer_b exists. Funding..."
    stellar keys fund issuer_b || true
fi

ISSUER_A=$(stellar keys address issuer_a)
ISSUER_B=$(stellar keys address issuer_b)

echo "Issuer A: $ISSUER_A"
echo "Issuer B: $ISSUER_B"

# 2. Deploy Tokens
echo "Deploying Token A (TKNA)..."
TOKEN_A_ID=$(soroban contract asset id --asset "TKNA:$ISSUER_A" --network "$NETWORK")
soroban contract asset deploy --asset "TKNA:$ISSUER_A" --network "$NETWORK" --source "$DEPLOYER" || true
echo "Token A ID: $TOKEN_A_ID"

echo "Deploying Token B (TKNB)..."
TOKEN_B_ID=$(soroban contract asset id --asset "TKNB:$ISSUER_B" --network "$NETWORK")
soroban contract asset deploy --asset "TKNB:$ISSUER_B" --network "$NETWORK" --source "$DEPLOYER" || true
echo "Token B ID: $TOKEN_B_ID"

# Sort tokens (UniV3 requires token0 < token1)
if [[ "$TOKEN_A_ID" > "$TOKEN_B_ID" ]]; then
    T0=$TOKEN_B_ID
    T1=$TOKEN_A_ID
else
    T0=$TOKEN_A_ID
    T1=$TOKEN_B_ID
fi

echo "Token 0: $T0"
echo "Token 1: $T1"

# 3. Create Pool
echo "Creating Pool (Fee: 3000)..."
# factory.create_pool(token0, token1, fee)
# fee = 3000 (0.3%)
# tick_spacing = 60 (should be auto-checked implies 3000 fee tier enabled)

POOL_ID=$(soroban contract invoke --id "$FACTORY_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    create_pool \
    --token-a "$T0" \
    --token-b "$T1" \
    --fee 3000 \
    --initial-tick 0)

echo "Pool Created! ID: $POOL_ID"

# Save Pool ID
cat <<EOF >> public_ids.json
,
"test_pool": {
    "token0": "$T0",
    "token1": "$T1",
    "fee": 3000,
    "pool_id": "$POOL_ID"
}
EOF

# Fix JSON format (hacky append)
# Actually, let's just create a new file `pool_ids.json`
cat <<EOF > test_pool.json
{
    "token0": "$T0",
    "token1": "$T1",
    "fee": 3000,
    "pool_id": "$POOL_ID"
}
EOF
echo "Saved pool info to test_pool.json"
