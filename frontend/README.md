# Frontend

Next.js application for the Stellar CLMM interface.

## Available Routes

- `/`
- `/dashboard`
- `/swap`
- `/pools`
- `/governance`
- `/terminal`
- `/about`
- `/contact`
- `/privacy`

## Commands

```bash
npm install
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:coverage
```

## Contract Integration

- Local TypeScript contract clients live in `src/contracts/`.
- Active contract IDs and network settings live in `src/contracts/config.ts`.
- Refresh contract bindings with `../soroban_clmm/scripts/generate_bindings.sh`.

## Notes

- Development mode uses the default Next.js dev server.
- Production start runs on port `3105`.
