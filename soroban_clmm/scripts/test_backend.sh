#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building pool WASM test artifact (wasm32v1-none/release/clmm_pool.wasm)"
cargo build --target wasm32v1-none --release -p clmm-pool

echo "Running backend tests (cargo test --workspace)"
cargo test --workspace

if command -v cargo-llvm-cov >/dev/null 2>&1; then
  # NOTE:
  # Function coverage is lowered to 85 because #[contracttype] macro-generated
  # conversion fns are included in llvm-cov totals but are not directly
  # invocable in this Soroban SDK version's test surface.
  echo "Running backend coverage with thresholds (lines=90, functions=85, regions=90)"
  cargo llvm-cov --workspace \
    --fail-under-lines 90 \
    --fail-under-functions 85 \
    --fail-under-regions 90
else
  echo "cargo-llvm-cov not installed. Install with: cargo install cargo-llvm-cov"
  echo "Then run: cargo llvm-cov --workspace --fail-under-lines 90 --fail-under-functions 85 --fail-under-regions 90"
  exit 1
fi
