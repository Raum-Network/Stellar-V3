#!/bin/bash
set -e

echo "=============================================="
echo "   TypeScript Bindings Generator"
echo "=============================================="

# Try to find the IDs file
IDS_FILE=""
if [ -f "../frontend/src/contracts/new_ids.json" ]; then
    IDS_FILE="../frontend/src/contracts/new_ids.json"
elif [ -f "frontend/src/contracts/new_ids.json" ]; then
    IDS_FILE="frontend/src/contracts/new_ids.json"
elif [ -f "public_ids.json" ]; then
    IDS_FILE="public_ids.json"
elif [ -f "soroban_clmm/public_ids.json" ]; then
    IDS_FILE="soroban_clmm/public_ids.json"
else
    echo "Error: Cannot find contract IDs file (new_ids.json or public_ids.json)"
    echo "Please run full_redeploy.sh first"
    exit 1
fi

echo "Using IDs from: $IDS_FILE"
echo ""

# Load contract IDs
GOV=$(cat "$IDS_FILE" | jq -r '.governance // empty')
FACTORY=$(cat "$IDS_FILE" | jq -r '.factory // empty')
ROUTER=$(cat "$IDS_FILE" | jq -r '.router // empty')
PM=$(cat "$IDS_FILE" | jq -r '.position_manager // empty')

# Validate IDs exist
validate_id() {
    local id=$1
    local name=$2
    if [ -z "$id" ] || [ "$id" == "null" ]; then
        echo "Error: $name ID not found in $IDS_FILE"
        exit 1
    fi
}

validate_id "$GOV" "Governance"
validate_id "$FACTORY" "Factory"
validate_id "$ROUTER" "Router"
validate_id "$PM" "Position Manager"

echo "Contract IDs:"
echo "  Governance:        $GOV"
echo "  Factory:           $FACTORY"
echo "  Router:            $ROUTER"
echo "  Position Manager:  $PM"
echo ""

# Determine output directory
if [ -d "frontend" ]; then
    OUT_BASE="frontend/src/contracts"
elif [ -d "../frontend" ]; then
    OUT_BASE="../frontend/src/contracts"
else
    echo "Error: Cannot find frontend directory"
    exit 1
fi

generate_binding() {
    local id=$1
    local name=$2
    local out_dir="$OUT_BASE/$name"
    
    echo "Generating $name bindings..."
    
    # Create output directory if it doesn't exist
    mkdir -p "$out_dir"
    
    soroban contract bindings typescript \
        --network testnet \
        --contract-id "$id" \
        --output-dir "$out_dir" \
        --overwrite
    
    if [ $? -eq 0 ]; then
        echo "  ✓ $name bindings generated"
    else
        echo "  ✗ Failed to generate $name bindings"
        exit 1
    fi
}

echo "Generating TypeScript bindings..."
echo ""

generate_binding "$GOV" "governance"
generate_binding "$FACTORY" "factory"
generate_binding "$ROUTER" "router"
generate_binding "$PM" "position_manager"

echo ""
echo "=============================================="
echo "   Bindings Generated Successfully"
echo "=============================================="
echo ""
echo "Next step: Update frontend/src/contracts/config.ts"
echo ""
