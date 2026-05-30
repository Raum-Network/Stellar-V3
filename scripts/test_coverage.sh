#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Running frontend coverage..."
npm --prefix "$ROOT_DIR/frontend" run test:coverage

echo "Running backend coverage..."
"$ROOT_DIR/soroban_clmm/scripts/test_backend.sh"
