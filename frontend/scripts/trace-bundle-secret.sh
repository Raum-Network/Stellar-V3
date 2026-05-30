#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATTERN="${1:-PASSWO}"
CHUNK_DIR=".next/static/chunks"

if [[ ! -d "$CHUNK_DIR" ]]; then
  echo "Missing $CHUNK_DIR. Run npm run build first."
  exit 1
fi

echo "[trace-secret] searching bundle chunks for pattern: $PATTERN"
if ! rg -n "$PATTERN" "$CHUNK_DIR"; then
  echo "[trace-secret] no matches in bundle chunks"
  exit 0
fi

echo
echo "[trace-secret] checking source tree"
rg -n "$PATTERN" src scripts || true

echo
echo "[trace-secret] checking node_modules (first matches only)"
rg -n --max-count 5 "$PATTERN" node_modules || true
