#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ALLOWLIST_FILE=".security/secret-scan-allowlist.txt"
TEMP_RAW="$(mktemp)"
TEMP_FILTERED="$(mktemp)"

trap 'rm -f "$TEMP_RAW" "$TEMP_FILTERED"' EXIT

mkdir -p .security
touch "$ALLOWLIST_FILE"

echo "[secret-scan] scanning source files"
SOURCE_PATHS=(
  "src"
  "scripts"
  "next.config.mjs"
  "package.json"
)

rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!.next/**' \
  --glob '!coverage/**' \
  --glob '!.git/**' \
  -e 'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e 'sk_live_[0-9a-zA-Z]{16,}' \
  -e 'xox[baprs]-[0-9A-Za-z-]{10,}' \
  -e '(?i)(api[_-]?key|private[_-]?key|secret|password)\s*[:=]\s*["\x27][^"\x27]{16,}["\x27]' \
  "${SOURCE_PATHS[@]}" >"$TEMP_RAW" || true

if [[ -d ".next/static/chunks" ]]; then
  echo "[secret-scan] scanning built chunks for suspicious tokens"
  rg -n \
    -e 'PASSWO' \
    -e '(?i)(api[_-]?key|private[_-]?key|secret|password)\s*[:=]\s*["\x27][^"\x27]{16,}["\x27]' \
    .next/static/chunks >>"$TEMP_RAW" || true
fi

if [[ -s "$ALLOWLIST_FILE" ]]; then
  grep -Evf "$ALLOWLIST_FILE" "$TEMP_RAW" >"$TEMP_FILTERED" || true
else
  cp "$TEMP_RAW" "$TEMP_FILTERED"
fi

if [[ -s "$TEMP_FILTERED" ]]; then
  echo "[secret-scan] potential secret findings detected:"
  cat "$TEMP_FILTERED"
  echo
  echo "[secret-scan] update $ALLOWLIST_FILE with reviewed safe patterns if needed."
  exit 1
fi

echo "[secret-scan] no findings"
