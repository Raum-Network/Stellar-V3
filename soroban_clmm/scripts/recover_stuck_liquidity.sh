#!/usr/bin/env bash
set -euo pipefail

NETWORK="testnet"
SOURCE="RaumFi"
OWNER=""
EXECUTE=0
LEAVE_DUST=1
POOL_OVERRIDE=""
TOKEN_IDS_OVERRIDE=""
declare -a MANAGERS=()

usage() {
  cat <<'EOF'
Recover liquidity from old PositionManager contracts by burning owned position NFTs.

Default mode is DRY-RUN (simulation only). Use --execute to send burn transactions.

Usage:
  ./scripts/recover_stuck_liquidity.sh [options]

Options:
  --manager <CONTRACT_ID>         PositionManager contract ID (repeatable)
  --managers-file <PATH>          File containing manager IDs (one per line)
  --source <IDENTITY_OR_ADDRESS>  Stellar CLI source (default: RaumFi)
  --owner <G...>                  Owner address of position NFTs (default: source address)
  --network <NAME>                Network name from stellar CLI config (default: testnet)
  --pool <CONTRACT_ID>            Force pool ID (fallback if get_position parsing fails)
  --token-ids "1,2,3"             Only process these token IDs (skip get_owned_tokens query)
  --full-burn                     Burn full liquidity (default leaves 1 unit to avoid legacy full-burn traps)
  --execute                       Actually submit burn transactions
  --help                          Show this help

Examples:
  # Dry-run for one old manager:
  ./scripts/recover_stuck_liquidity.sh --manager CA263...ATN3 --owner GABC...

  # Execute recovery against multiple managers:
  ./scripts/recover_stuck_liquidity.sh \
    --manager CA263...ATN3 \
    --manager CDZB...R5XO \
    --owner GABC... \
    --execute
EOF
}

add_manager() {
  local id="$1"
  if [[ -n "$id" ]]; then
    MANAGERS+=("$id")
  fi
}

read_managers_file() {
  local path="$1"
  while IFS= read -r line; do
    line="$(echo "$line" | sed 's/#.*//g' | tr -d '[:space:]')"
    [[ -z "$line" ]] && continue
    add_manager "$line"
  done < "$path"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manager)
      add_manager "${2:-}"
      shift 2
      ;;
    --managers-file)
      read_managers_file "${2:-}"
      shift 2
      ;;
    --source)
      SOURCE="${2:-}"
      shift 2
      ;;
    --owner)
      OWNER="${2:-}"
      shift 2
      ;;
    --network)
      NETWORK="${2:-}"
      shift 2
      ;;
    --pool)
      POOL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --token-ids)
      TOKEN_IDS_OVERRIDE="${2:-}"
      shift 2
      ;;
    --full-burn)
      LEAVE_DUST=0
      shift
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ${#MANAGERS[@]} -eq 0 ]]; then
  echo "No manager IDs provided."
  usage
  exit 1
fi

SOURCE_ADDRESS="$(stellar keys address "$SOURCE" 2>/dev/null || true)"
if [[ -z "$OWNER" ]]; then
  OWNER="$SOURCE_ADDRESS"
fi

if [[ -z "$OWNER" ]]; then
  echo "Could not determine owner address. Pass --owner explicitly."
  exit 1
fi

echo "=============================================="
echo "Liquidity Recovery Sweep"
echo "=============================================="
echo "Mode:        $([[ "$EXECUTE" -eq 1 ]] && echo "EXECUTE" || echo "DRY-RUN")"
echo "Network:     $NETWORK"
echo "Source:      $SOURCE"
echo "Owner:       $OWNER"
echo "Leave Dust:  $([[ "$LEAVE_DUST" -eq 1 ]] && echo "yes" || echo "no")"
echo "Managers:    ${#MANAGERS[@]}"
echo ""

total_positions=0
sim_ok=0
sim_fail=0
send_ok=0
send_fail=0

invoke_view() {
  local manager="$1"
  shift
  stellar contract invoke \
    --id "$manager" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --send no \
    -- "$@" 2>&1
}

invoke_send() {
  local manager="$1"
  shift
  stellar contract invoke \
    --id "$manager" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "$@" 2>&1
}

for manager in "${MANAGERS[@]}"; do
  echo "----------------------------------------------"
  echo "Manager: $manager"

  token_ids=()
  if [[ -n "$TOKEN_IDS_OVERRIDE" ]]; then
    IFS=',' read -ra token_ids <<< "$TOKEN_IDS_OVERRIDE"
  else
    if ! owned_raw="$(invoke_view "$manager" get_owned_tokens --owner "$OWNER")"; then
      echo "  get_owned_tokens failed:"
      echo "    $owned_raw"
      continue
    fi
    mapfile -t token_ids < <(echo "$owned_raw" | grep -Eo '[0-9]+' | awk '!seen[$0]++')
  fi

  if [[ ${#token_ids[@]} -eq 0 ]]; then
    echo "  No owned positions found."
    continue
  fi

  echo "  Tokens: ${token_ids[*]}"

  for token_id in "${token_ids[@]}"; do
    token_id="$(echo "$token_id" | tr -d '[:space:]')"
    [[ -z "$token_id" ]] && continue
    total_positions=$((total_positions + 1))

    if ! pos_raw="$(invoke_view "$manager" get_position --token_id "$token_id")"; then
      echo "  [token $token_id] get_position failed:"
      echo "    $pos_raw"
      sim_fail=$((sim_fail + 1))
      continue
    fi

    liquidity="$(echo "$pos_raw" | sed -nE 's/.*liquidity[^0-9]*([0-9]+).*/\1/p' | head -n1)"
    pool_from_position="$(echo "$pos_raw" | grep -Eo 'C[A-Z0-9]{55}' | head -n1 || true)"
    pool="${POOL_OVERRIDE:-$pool_from_position}"

    if [[ -z "$liquidity" || -z "$pool" ]]; then
      echo "  [token $token_id] could not parse liquidity/pool."
      echo "    liquidity='$liquidity' pool='$pool' (override pool with --pool if needed)"
      sim_fail=$((sim_fail + 1))
      continue
    fi

    burn_liquidity="$liquidity"
    if [[ "$LEAVE_DUST" -eq 1 && "$liquidity" -gt 1 ]]; then
      burn_liquidity=$((liquidity - 1))
    fi

    if [[ "$burn_liquidity" -le 0 ]]; then
      echo "  [token $token_id] burn amount resolved to 0; skipping."
      continue
    fi

    if ! sim_out="$(invoke_view "$manager" burn --pool "$pool" --to "$OWNER" --token_id "$token_id" --liquidity "$burn_liquidity")"; then
      echo "  [token $token_id] simulate burn FAILED (liquidity=$burn_liquidity)."
      echo "    $sim_out"
      sim_fail=$((sim_fail + 1))
      continue
    fi

    echo "  [token $token_id] simulate burn OK (pool=$pool, liquidity=$burn_liquidity)."
    sim_ok=$((sim_ok + 1))

    if [[ "$EXECUTE" -eq 1 ]]; then
      if ! send_out="$(invoke_send "$manager" burn --pool "$pool" --to "$OWNER" --token_id "$token_id" --liquidity "$burn_liquidity")"; then
        echo "  [token $token_id] SEND FAILED."
        echo "    $send_out"
        send_fail=$((send_fail + 1))
      else
        echo "  [token $token_id] SEND OK."
        send_ok=$((send_ok + 1))
      fi
    fi
  done
done

echo ""
echo "=============================================="
echo "Recovery Summary"
echo "=============================================="
echo "Positions scanned:    $total_positions"
echo "Simulation success:   $sim_ok"
echo "Simulation failed:    $sim_fail"
if [[ "$EXECUTE" -eq 1 ]]; then
  echo "Transactions sent ok: $send_ok"
  echo "Transactions failed:  $send_fail"
else
  echo "Execute mode:         off (no state changed)"
fi
