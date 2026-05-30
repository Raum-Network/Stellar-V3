# raum-raumfi-v3

Concentrated-liquidity exchange stack for Stellar Soroban. This repository contains the smart-contract workspace, a Next.js frontend, deployment utilities, and architecture documentation for a Uniswap V3-style CLMM implementation.

## Repository Layout

- `soroban_clmm/` Rust Soroban workspace for protocol contracts.
- `frontend/` Next.js application for swaps, pools, governance, dashboard, and terminal views.
- `scripts/` top-level helper scripts such as combined coverage runs.
- `CLMM_Implementation_Guide.md` implementation-focused protocol guide.
- `CLMM_Soroban_Arch.md` technical architecture reference.

## Contracts

The Soroban workspace includes:

- `clmm-factory` pool deployment and fee-tier management
- `clmm-pool` concentrated-liquidity pool logic
- `clmm-router` swap routing and user-facing execution flow
- `clmm-position-manager` LP position ownership and management
- `clmm-governance` governance actions and proposal flow
- `clmm-quoter` quote helpers
- `clmm-tick-lens` read-only tick inspection helpers
- `soroban-token` token contract used for local/test flows

## Frontend

The frontend is a Next.js app with route surfaces for:

- `/dashboard`
- `/swap`
- `/pools`
- `/governance`
- `/terminal`

It uses local TypeScript contract client packages from `frontend/src/contracts/*` and contract/network settings from `frontend/src/contracts/config.ts`.

## Prerequisites

- Node.js 18+
- npm
- Rust toolchain
- Soroban CLI
- `jq` for binding-generation scripts

Useful Rust targets:

```bash
rustup target add wasm32-unknown-unknown
rustup target add wasm32v1-none
```

## Getting Started

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the frontend in development mode:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Backend Workflow

Build the Soroban workspace:

```bash
cd soroban_clmm
cargo build --workspace
```

Run backend tests:

```bash
cargo test --workspace
```

Run backend coverage with the provided script:

```bash
./scripts/test_backend.sh
```

## Full Test Coverage

Run frontend and backend coverage together from the repository root:

```bash
./scripts/test_coverage.sh
```

## Deployment and Bindings

Example deployment flow:

```bash
cd soroban_clmm
./scripts/deploy.sh
```

Generate frontend contract bindings after deployment:

```bash
cd soroban_clmm
./scripts/generate_bindings.sh
```

Additional helper scripts for pool setup, redeployments, recovery flows, and liquidity operations live in `soroban_clmm/scripts/`.

## Notes

- The checked-in frontend contract packages under `frontend/src/contracts/` are local client libraries used by the app.
- Testnet contract IDs currently live in `frontend/src/contracts/config.ts`.
- Deployment artifacts such as local logs and build output are ignored through the repository `.gitignore`.
