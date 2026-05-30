#!/usr/bin/env bash
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
DEPLOYER_NAME="${DEPLOYER_NAME:-RaumFi}"
NUM_WALLETS="${NUM_WALLETS:-35}"
TRANSFER_STROOPS="${TRANSFER_STROOPS:-90000000000}" # 9,000 XLM
MAX_RETRIES="${MAX_RETRIES:-5}"
BASE_SLEEP_SECONDS="${BASE_SLEEP_SECONDS:-2}"
RUN_TAG="${RUN_TAG:-$(date +%Y%m%d_%H%M%S)}"
WALLET_PREFIX="${WALLET_PREFIX:-seed35_${RUN_TAG}_}"

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI not found in PATH"
  exit 1
fi

if [[ "$NUM_WALLETS" -le 0 ]]; then
  echo "NUM_WALLETS must be > 0"
  exit 1
fi

if [[ "$TRANSFER_STROOPS" -le 0 ]]; then
  echo "TRANSFER_STROOPS must be > 0"
  exit 1
fi

DEPLOYER_ADDRESS="$(stellar keys address "$DEPLOYER_NAME")"
XLM_ID="$(stellar contract id asset --asset native --network "$NETWORK")"

get_balance() {
  stellar contract invoke \
    --id "$XLM_ID" \
    --source "$DEPLOYER_NAME" \
    --network "$NETWORK" \
    --send no \
    -- balance --id "$DEPLOYER_ADDRESS" | tr -dc '0-9'
}

before_balance="$(get_balance)"

SUCCESS=0
FAIL=0

echo "============================================"
echo "  35-Wallet Bootstrap Funding"
echo "============================================"
echo "Network:            $NETWORK"
echo "Deployer Identity:  $DEPLOYER_NAME"
echo "Deployer Address:   $DEPLOYER_ADDRESS"
echo "Wallet Prefix:      $WALLET_PREFIX"
echo "Wallet Count:       $NUM_WALLETS"
echo "Transfer Each:      $TRANSFER_STROOPS stroops (9,000 XLM default)"
echo "Max Retries:        $MAX_RETRIES"
echo ""

retry_with_backoff() {
  local cmd="$1"
  local description="$2"

  local attempt=1
  while [[ "$attempt" -le "$MAX_RETRIES" ]]; do
    if bash -lc "$cmd" >/dev/null 2>&1; then
      return 0
    fi

    if [[ "$attempt" -eq "$MAX_RETRIES" ]]; then
      echo "    - $description failed after $MAX_RETRIES attempts"
      return 1
    fi

    local sleep_for=$((BASE_SLEEP_SECONDS * attempt))
    echo "    - $description attempt $attempt failed; retrying in ${sleep_for}s"
    sleep "$sleep_for"
    attempt=$((attempt + 1))
  done
}

for i in $(seq 1 "$NUM_WALLETS"); do
  wallet="${WALLET_PREFIX}${i}"
  echo "[$i/$NUM_WALLETS] $wallet"

  generate_cmd="stellar keys generate \"$wallet\" --fund --network \"$NETWORK\" --overwrite"
  if ! retry_with_backoff "$generate_cmd" "friendbot funding"; then
    FAIL=$((FAIL + 1))
    continue
  fi

  transfer_cmd="stellar tx new payment --source-account \"$wallet\" --destination \"$DEPLOYER_ADDRESS\" --asset native --amount \"$TRANSFER_STROOPS\" --network \"$NETWORK\""
  if retry_with_backoff "$transfer_cmd" "transfer to deployer"; then
    echo "    ✓ transfer sent"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "    ✗ transfer failed"
    FAIL=$((FAIL + 1))
  fi
done

after_balance="$(get_balance)"
actual_delta=$((after_balance - before_balance))
expected_delta=$((NUM_WALLETS * TRANSFER_STROOPS))

echo ""
echo "============================================"
echo "Bootstrap Summary"
echo "============================================"
echo "Successful wallets:  $SUCCESS/$NUM_WALLETS"
echo "Failed wallets:      $FAIL"
echo "Balance Before:      $before_balance stroops"
echo "Balance After:       $after_balance stroops"
echo "Observed Inflow:     $actual_delta stroops"
echo "Expected Inflow:     $expected_delta stroops"
echo "============================================"

if [[ "$SUCCESS" -ne "$NUM_WALLETS" ]]; then
  echo "Bootstrap failed: required $NUM_WALLETS successful wallets, got $SUCCESS"
  exit 1
fi

if [[ "$actual_delta" -lt "$expected_delta" ]]; then
  echo "Bootstrap failed: deployer inflow below expected threshold"
  exit 1
fi

echo "Bootstrap completed successfully."
