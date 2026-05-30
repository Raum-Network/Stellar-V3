# factory

Local TypeScript client package for the Soroban `factory` contract.

## Purpose

Provides the frontend-facing contract client used for pool creation, fee-tier management, and factory state queries.

## Usage

This package is consumed through the frontend workspace as a local dependency:

```json
"factory": "file:src/contracts/factory"
```

Network and active contract IDs are configured in `frontend/src/contracts/config.ts`.
