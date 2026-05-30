# position_manager

Local TypeScript client package for the Soroban `position_manager` contract.

## Purpose

Used by the frontend for LP position reads, ownership checks, and position-management transactions.

## Usage

This package is linked into the frontend as a local dependency:

```json
"position_manager": "file:src/contracts/position_manager"
```

Deployment-specific IDs and network settings are configured in `frontend/src/contracts/config.ts`.
