# pool

Local TypeScript client package for the Soroban `pool` contract.

## Purpose

Used by the frontend for pool-state reads, liquidity operations, and swap-related interactions with deployed pool contracts.

## Usage

This package is consumed as a local dependency inside the frontend workspace:

```json
"pool": "file:src/contracts/pool"
```

Frontend network configuration is maintained in `frontend/src/contracts/config.ts`.
