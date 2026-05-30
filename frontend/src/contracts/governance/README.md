# governance

Local TypeScript client package for the Soroban `governance` contract.

## Purpose

Provides the frontend contract client used for governance reads and transaction flows such as proposal and voting interactions.

## Usage

This package is wired into the frontend as a local dependency:

```json
"governance": "file:src/contracts/governance"
```

Network passphrase, RPC URL, and contract IDs are managed through `frontend/src/contracts/config.ts`.
