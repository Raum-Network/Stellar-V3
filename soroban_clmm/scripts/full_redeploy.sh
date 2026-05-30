#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="$(cd "$ROOT_DIR/.." && pwd)"
FRONTEND_DIR="$WORKSPACE_DIR/frontend"

NETWORK="${NETWORK:-testnet}"
DEPLOYER="${DEPLOYER:-RaumFi}"
BOOTSTRAP_WALLETS="${BOOTSTRAP_WALLETS:-35}"
BOOTSTRAP_TRANSFER_STROOPS="${BOOTSTRAP_TRANSFER_STROOPS:-90000000000}" # 9,000 XLM
TARGET_XLM_STROOPS="${TARGET_XLM_STROOPS:-3125000000000}"               # 312,500 XLM
PRIMARY_LIQUIDITY="${PRIMARY_LIQUIDITY:-1250000000000}"                 # base seed profile (range-wide, aligned with 312,500 XLM threshold)
SECONDARY_LIQUIDITY="${SECONDARY_LIQUIDITY:-0}"
USDC_MINT_AMOUNT="${USDC_MINT_AMOUNT:-1000000000000000}"                # 100M USDC (7 dp)
APPROVAL_XLM_AMOUNT="${APPROVAL_XLM_AMOUNT:-99999999999999}"
APPROVAL_USDC_AMOUNT="${APPROVAL_USDC_AMOUNT:-9999999999999999}"
APPROVAL_EXPIRATION_LEDGER="${APPROVAL_EXPIRATION_LEDGER:-3000000}"
MAX_APPROVAL_EXPIRATION_LEDGER="${MAX_APPROVAL_EXPIRATION_LEDGER:-3110400}"
INITIAL_TICK="${INITIAL_TICK:-18300}"                                   # target ~0.16 USDC/XLM when token0=USDC, token1=XLM
FEE_TIER="${FEE_TIER:-3000}"
TICK_SPACING="${TICK_SPACING:-60}"
MIN_POOL_XLM_STROOPS="${MIN_POOL_XLM_STROOPS:-1000000000}"             # 100 XLM
MIN_POOL_USDC_STROOPS="${MIN_POOL_USDC_STROOPS:-1000000000}"           # 100 USDC
RUN_FRONTEND_VALIDATION="${RUN_FRONTEND_VALIDATION:-1}"
NPM_INSTALL_FLAGS="${NPM_INSTALL_FLAGS:---legacy-peer-deps}"
SKIP_BOOTSTRAP="${SKIP_BOOTSTRAP:-0}"

RUN_TS="$(date +%Y%m%d_%H%M%S)"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/redeploy_${RUN_TS}.log"
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

stellar() {
  local max_attempts="${STELLAR_MAX_RETRIES:-5}"
  local attempt=1
  local delay_secs=2
  local out_file err_file rc output

  out_file="$(mktemp)"
  err_file="$(mktemp)"

  while true; do
    if command stellar "$@" >"$out_file" 2>"$err_file"; then
      output="$(cat "$out_file")$(cat "$err_file")"
      if [[ "$output" == *"transaction simulation failed"* ]]; then
        rc=1
      else
        [[ -s "$err_file" ]] && cat "$err_file" >&2
        cat "$out_file"
        rm -f "$out_file" "$err_file"
        return 0
      fi
    else
      rc=$?
      output="$(cat "$out_file")$(cat "$err_file")"
    fi

    if [[ "$output" == *"transaction submission timeout"* || "$output" == *"TxBadSeq"* || "$output" == *"txBadSeq"* ]]; then
      if (( attempt < max_attempts )); then
        [[ -s "$err_file" ]] && cat "$err_file" >&2
        [[ -s "$out_file" ]] && cat "$out_file" >&2
        echo "  ! transient stellar submit error (attempt ${attempt}/${max_attempts}), retrying in ${delay_secs}s..." >&2
        sleep "$delay_secs"
        attempt=$((attempt + 1))
        delay_secs=$((delay_secs * 2))
        continue
      fi
    fi

    [[ -s "$err_file" ]] && cat "$err_file" >&2
    [[ -s "$out_file" ]] && cat "$out_file" >&2
    rm -f "$out_file" "$err_file"
    return "$rc"
  done
}

echo "=============================================="
echo "   CLMM Full Redeploy + 35-Wallet Bootstrap"
echo "=============================================="
echo "Run Tag: $RUN_TS"
echo "Log File: $LOG_FILE"
echo "Network: $NETWORK"
echo "Deployer: $DEPLOYER"
echo "Skip Bootstrap: $SKIP_BOOTSTRAP"
echo ""

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    exit 1
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

preflight() {
  echo "Preflight: tools, network, identities, and scripts"
  require_cmd stellar
  require_cmd curl
  require_cmd jq
  require_cmd npm

  stellar --version

  if ! stellar network ls | awk '{print $1}' | grep -qx "$NETWORK"; then
    echo "Network '$NETWORK' not configured in stellar CLI."
    exit 1
  fi

  require_file "$SCRIPT_DIR/full_redeploy.sh"
  require_file "$SCRIPT_DIR/fund_deployer.sh"
  require_file "$SCRIPT_DIR/generate_bindings.sh"
  require_file "$ROOT_DIR/Cargo.toml"
  require_file "$FRONTEND_DIR/package.json"

  if ! stellar keys address "$DEPLOYER" >/dev/null 2>&1; then
    echo "Deployer identity '$DEPLOYER' not found, creating..."
    stellar keys generate "$DEPLOYER" --network "$NETWORK"
  fi
}

preflight

DEPLOYER_ADDRESS="$(stellar keys address "$DEPLOYER")"
XLM_ID="$(stellar contract id asset --asset native --network "$NETWORK")"

if [[ "$APPROVAL_EXPIRATION_LEDGER" -gt "$MAX_APPROVAL_EXPIRATION_LEDGER" ]]; then
  echo "Approval expiration ledger ($APPROVAL_EXPIRATION_LEDGER) exceeds max ($MAX_APPROVAL_EXPIRATION_LEDGER); clamping."
  APPROVAL_EXPIRATION_LEDGER="$MAX_APPROVAL_EXPIRATION_LEDGER"
fi

if (( INITIAL_TICK % TICK_SPACING != 0 )); then
  echo "INITIAL_TICK ($INITIAL_TICK) must align to TICK_SPACING ($TICK_SPACING)."
  exit 1
fi

get_xlm_balance() {
  stellar contract invoke \
    --id "$XLM_ID" \
    --source "$DEPLOYER" \
    --network "$NETWORK" \
    --send no \
    -- balance --id "$DEPLOYER_ADDRESS" | tr -dc '0-9'
}

echo ""
echo "Step 0: Funding deployer from Friendbot (best effort)"
FUND_RESPONSE="$(curl -s "https://friendbot.stellar.org?addr=$DEPLOYER_ADDRESS" || true)"
if echo "$FUND_RESPONSE" | grep -q "successful"; then
  echo "  ✓ Friendbot funded deployer"
elif echo "$FUND_RESPONSE" | grep -q "createAccountAlreadyExist"; then
  echo "  ✓ Deployer already funded"
else
  echo "  ! Friendbot response: $FUND_RESPONSE"
fi

echo ""
if [[ "$SKIP_BOOTSTRAP" == "1" ]]; then
  echo "Step 1: Bootstrap skipped (SKIP_BOOTSTRAP=1)"
  after_bootstrap_balance="$(get_xlm_balance)"
  bootstrap_delta=0
  expected_bootstrap_delta=0
else
  echo "Step 1: Bootstrap deployer with 35 wallets (315,000 XLM target inflow)"
  before_bootstrap_balance="$(get_xlm_balance)"
  NETWORK="$NETWORK" \
  DEPLOYER_NAME="$DEPLOYER" \
  NUM_WALLETS="$BOOTSTRAP_WALLETS" \
  TRANSFER_STROOPS="$BOOTSTRAP_TRANSFER_STROOPS" \
  RUN_TAG="$RUN_TS" \
  WALLET_PREFIX="seed35_${RUN_TS}_" \
  "$SCRIPT_DIR/fund_deployer.sh"
  after_bootstrap_balance="$(get_xlm_balance)"
  bootstrap_delta=$((after_bootstrap_balance - before_bootstrap_balance))
  expected_bootstrap_delta=$((BOOTSTRAP_WALLETS * BOOTSTRAP_TRANSFER_STROOPS))

  echo "Bootstrap inflow observed: $bootstrap_delta stroops"
  echo "Bootstrap inflow expected: $expected_bootstrap_delta stroops"
fi

if [[ "$after_bootstrap_balance" -lt "$TARGET_XLM_STROOPS" ]]; then
  echo "Deployer XLM balance below target threshold after bootstrap."
  echo "Current: $after_bootstrap_balance / Required: $TARGET_XLM_STROOPS"
  exit 1
fi
echo "  ✓ Deployer XLM balance meets target (>= 312,500 XLM)"

echo ""
echo "Step 2: Build contracts"
cd "$ROOT_DIR"
stellar contract build
WASM_DIR="$ROOT_DIR/target/wasm32v1-none/release"

deploy() {
  local wasm_name="$1"
  local wasm_file="$WASM_DIR/${wasm_name}.wasm"
  if [[ ! -f "$wasm_file" ]]; then
    echo "Missing WASM artifact: $wasm_file"
    exit 1
  fi
  stellar contract deploy --wasm "$wasm_file" --source "$DEPLOYER" --network "$NETWORK"
}

verify_contract() {
  local id="$1"
  local label="$2"
  if [[ -z "$id" || "$id" == "null" ]]; then
    echo "Failed to deploy $label"
    exit 1
  fi
  echo "  ✓ $label: $id"
}

echo ""
echo "Step 3: Deploy contracts"
USDC_ID="$(deploy "soroban_token")"
verify_contract "$USDC_ID" "USDC Token"

GOV_ID="$(deploy "clmm_governance")"
verify_contract "$GOV_ID" "Governance"

FACTORY_ID="$(deploy "clmm_factory")"
verify_contract "$FACTORY_ID" "Factory"

ROUTER_ID="$(deploy "clmm_router")"
verify_contract "$ROUTER_ID" "Router"

MANAGER_ID="$(deploy "clmm_position_manager")"
verify_contract "$MANAGER_ID" "Position Manager"

verify_contract "$XLM_ID" "XLM (Native SAC)"

echo ""
echo "Step 4: Initialize contracts"
stellar contract invoke --id "$USDC_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  initialize --admin "$DEPLOYER_ADDRESS" --decimals 7 --name "Mock USDC" --symbol "USDC"
echo "  ✓ USDC initialized"

stellar contract invoke --id "$USDC_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  mint --to "$DEPLOYER_ADDRESS" --amount "$USDC_MINT_AMOUNT"
echo "  ✓ USDC minted to deployer"

stellar contract invoke --id "$GOV_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  initialize --admin "$DEPLOYER_ADDRESS" --voting_token "$XLM_ID"
echo "  ✓ Governance initialized"

POOL_WASM_HASH="$(stellar contract install --wasm "$WASM_DIR/clmm_pool.wasm" --source "$DEPLOYER" --network "$NETWORK")"
echo "  ✓ Pool WASM installed: $POOL_WASM_HASH"

stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  initialize --admin "$DEPLOYER_ADDRESS" --wasm_hash "$POOL_WASM_HASH" --position_manager "$MANAGER_ID"
echo "  ✓ Factory initialized"

stellar contract invoke --id "$ROUTER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  initialize --admin "$DEPLOYER_ADDRESS" --factory "$FACTORY_ID" --xlm "$XLM_ID"
echo "  ✓ Router initialized"

stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  initialize --admin "$DEPLOYER_ADDRESS" --factory "$FACTORY_ID" --name "RAUM LP Position" --symbol "RAUM-LP"
echo "  ✓ Position Manager initialized"

stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  enable_fee_tier --fee "$FEE_TIER" --tick_spacing "$TICK_SPACING"
echo "  ✓ Fee tier enabled ($FEE_TIER / spacing $TICK_SPACING)"

echo ""
echo "Step 5: Create pool"
if [[ "$XLM_ID" < "$USDC_ID" ]]; then
  TOKEN_A="$XLM_ID"
  TOKEN_B="$USDC_ID"
else
  TOKEN_A="$USDC_ID"
  TOKEN_B="$XLM_ID"
fi

stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  create_pool --token_a "$TOKEN_A" --token_b "$TOKEN_B" --fee "$FEE_TIER" --initial_tick="$INITIAL_TICK"
echo "  ✓ Pool created"

POOL_ID="$(stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" --send no -- \
  get_pool --token_a "$TOKEN_A" --token_b "$TOKEN_B" --fee "$FEE_TIER" | tr -d '"[:space:]')"
verify_contract "$POOL_ID" "XLM/USDC Pool"

echo ""
echo "Step 6: Approvals"
approve_with_fallback() {
  local token_id="$1"
  local spender="$2"
  local amount="$3"
  local label="$4"
  local exp_flag out rc

  for exp_flag in --expiration_ledger --_expiration_ledger; do
    set +e
    out="$(
      stellar contract invoke --id "$token_id" --source "$DEPLOYER" --network "$NETWORK" -- \
        approve --from "$DEPLOYER_ADDRESS" --spender "$spender" --amount "$amount" "$exp_flag" "$APPROVAL_EXPIRATION_LEDGER" 2>&1
    )"
    rc=$?
    set -e

    if [[ $rc -eq 0 ]]; then
      [[ -n "$out" ]] && echo "$out"
      echo "  ✓ $label"
      return 0
    fi

    if [[ "$out" == *"unexpected argument '${exp_flag}'"* ]]; then
      continue
    fi

    echo "$out"
    return $rc
  done

  echo "Failed to approve $label with either expiration flag form."
  return 1
}

approve_with_fallback "$XLM_ID" "$MANAGER_ID" "$APPROVAL_XLM_AMOUNT" "XLM approved for manager"
approve_with_fallback "$XLM_ID" "$POOL_ID" "$APPROVAL_XLM_AMOUNT" "XLM approved for pool"
approve_with_fallback "$USDC_ID" "$MANAGER_ID" "$APPROVAL_USDC_AMOUNT" "USDC approved for manager"
approve_with_fallback "$USDC_ID" "$POOL_ID" "$APPROVAL_USDC_AMOUNT" "USDC approved for pool"

echo ""
echo "Step 7: Seed liquidity (fixed profile)"
stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
  mint \
  --token_a "$USDC_ID" \
  --token_b "$XLM_ID" \
  --fee "$FEE_TIER" \
  --to "$DEPLOYER_ADDRESS" \
  --tick_lower=-887220 \
  --tick_upper 887220 \
  --liquidity "$PRIMARY_LIQUIDITY"
echo "  ✓ Primary position minted (liquidity=$PRIMARY_LIQUIDITY)"

if [[ "$SECONDARY_LIQUIDITY" -gt 0 ]]; then
  stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" -- \
    mint \
    --token_a "$USDC_ID" \
    --token_b "$XLM_ID" \
    --fee "$FEE_TIER" \
    --to "$DEPLOYER_ADDRESS" \
    --tick_lower=-18300 \
    --tick_upper 0 \
    --liquidity "$SECONDARY_LIQUIDITY"
  echo "  ✓ Secondary position minted (liquidity=$SECONDARY_LIQUIDITY)"
fi

echo ""
echo "Step 8: Persist IDs and sync frontend config"
NEW_IDS_FILE="$FRONTEND_DIR/src/contracts/new_ids.json"
CONFIG_FILE="$FRONTEND_DIR/src/contracts/config.ts"
PUBLIC_IDS_FILE="$ROOT_DIR/public_ids.json"

cat <<EOF > "$NEW_IDS_FILE"
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
echo "  ✓ Updated $NEW_IDS_FILE"

cat <<EOF > "$PUBLIC_IDS_FILE"
{
  "network": "$NETWORK",
  "governance": "$GOV_ID",
  "factory": "$FACTORY_ID",
  "router": "$ROUTER_ID",
  "position_manager": "$MANAGER_ID",
  "pool_hash": "$POOL_WASM_HASH"
}
EOF
echo "  ✓ Updated $PUBLIC_IDS_FILE"

cat <<EOF > "$CONFIG_FILE"
export const CONTRACT_IDS = {
    // Full-stack redeployment $RUN_TS
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
echo "  ✓ Updated $CONFIG_FILE"

echo ""
echo "Step 9: Regenerate contract bindings"
"$SCRIPT_DIR/generate_bindings.sh"
echo "  ✓ Bindings regenerated"

echo ""
echo "Step 10: Build generated contract packages"
PM_BINDING_FILE="$FRONTEND_DIR/src/contracts/position_manager/src/index.ts"
if [[ -f "$PM_BINDING_FILE" ]]; then
  # Work around duplicate type alias emitted by current Soroban TS binding generator.
  perl -pi -e 's/export type DataKey = \{tag: "HookModules", values: readonly \[ComplianceHook\]\};/export type ComplianceDataKey = {tag: "HookModules", values: readonly [ComplianceHook]};/' "$PM_BINDING_FILE"
fi
for pkg in governance factory router position_manager; do
  npm --prefix "$FRONTEND_DIR/src/contracts/$pkg" install $NPM_INSTALL_FLAGS
  npm --prefix "$FRONTEND_DIR/src/contracts/$pkg" run build
  echo "  ✓ Built $pkg package"
done

echo ""
echo "Step 11: Frontend validation"
if [[ "$RUN_FRONTEND_VALIDATION" == "1" ]]; then
  npm --prefix "$FRONTEND_DIR" install $NPM_INSTALL_FLAGS
  npm --prefix "$FRONTEND_DIR" run build
  npm --prefix "$FRONTEND_DIR" run test -- src/components/swap/__tests__/SwapView.test.tsx src/components/pool/__tests__/PoolView.test.tsx
  echo "  ✓ Frontend build and smoke tests passed"
else
  echo "  ! Skipped frontend validation (RUN_FRONTEND_VALIDATION=$RUN_FRONTEND_VALIDATION)"
fi

echo ""
echo "Step 12: Post-deploy verification"
resolved_pool="$(stellar contract invoke --id "$FACTORY_ID" --source "$DEPLOYER" --network "$NETWORK" --send no -- \
  get_pool --token_a "$TOKEN_A" --token_b "$TOKEN_B" --fee "$FEE_TIER" | tr -d '"[:space:]')"
if [[ "$resolved_pool" != "$POOL_ID" ]]; then
  echo "Pool verification failed: expected $POOL_ID got $resolved_pool"
  exit 1
fi
echo "  ✓ Factory get_pool verification"

stellar contract invoke --id "$POOL_ID" --source "$DEPLOYER" --network "$NETWORK" --send no -- get_state >/dev/null
echo "  ✓ Pool get_state verification"

pool_xlm_balance="$(stellar contract invoke --id "$XLM_ID" --source "$DEPLOYER" --network "$NETWORK" --send no -- \
  balance --id "$POOL_ID" | tr -dc '0-9')"
pool_usdc_balance="$(stellar contract invoke --id "$USDC_ID" --source "$DEPLOYER" --network "$NETWORK" --send no -- \
  balance --id "$POOL_ID" | tr -dc '0-9')"
echo "  ✓ Pool XLM balance: ${pool_xlm_balance:-0} stroops"
echo "  ✓ Pool USDC balance: ${pool_usdc_balance:-0} stroops"

if [[ "${pool_xlm_balance:-0}" -lt "$MIN_POOL_XLM_STROOPS" ]]; then
  echo "Pool XLM reserve below minimum threshold."
  echo "Current: ${pool_xlm_balance:-0} / Required: $MIN_POOL_XLM_STROOPS"
  exit 1
fi
if [[ "${pool_usdc_balance:-0}" -lt "$MIN_POOL_USDC_STROOPS" ]]; then
  echo "Pool USDC reserve below minimum threshold."
  echo "Current: ${pool_usdc_balance:-0} / Required: $MIN_POOL_USDC_STROOPS"
  exit 1
fi
echo "  ✓ Pool reserve thresholds satisfied"

owned_positions="$(stellar contract invoke --id "$MANAGER_ID" --source "$DEPLOYER" --network "$NETWORK" --send no -- \
  get_owned_tokens --owner "$DEPLOYER_ADDRESS")"
echo "  ✓ PositionManager owned tokens: $owned_positions"

final_xlm_balance="$(get_xlm_balance)"
echo "  ✓ Deployer final XLM balance: $final_xlm_balance stroops"

echo ""
echo "=============================================="
echo "DEPLOYMENT COMPLETE"
echo "=============================================="
echo "Deployer:          $DEPLOYER_ADDRESS"
echo "XLM (SAC):         $XLM_ID"
echo "USDC:              $USDC_ID"
echo "Governance:        $GOV_ID"
echo "Factory:           $FACTORY_ID"
echo "Router:            $ROUTER_ID"
echo "Position Manager:  $MANAGER_ID"
echo "XLM/USDC Pool:     $POOL_ID"
echo "Pool WASM Hash:    $POOL_WASM_HASH"
echo "Owned Positions:   $owned_positions"
echo "Log File:          $LOG_FILE"
