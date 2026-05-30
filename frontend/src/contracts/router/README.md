# router

Local TypeScript client package for the Soroban `router` contract.

## Purpose

Used by the frontend to execute swap flows, route user actions into protocol contracts, and coordinate user-facing transaction paths.

## Usage

This package is referenced as a local dependency in the frontend workspace:

```json
"router": "file:src/contracts/router"
```

Contract IDs and RPC settings are defined in `frontend/src/contracts/config.ts`.
