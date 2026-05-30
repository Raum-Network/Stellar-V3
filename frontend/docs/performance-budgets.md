# Performance Budgets

## Budget targets

- Largest JS chunk: `< 250 KB` (uncompressed file size)
- Keep total tracked resource weight trending down release-over-release.

## Commands

1. Build:
   - `npm run build`
2. Analyze bundle:
   - `npm run analyze`
3. Enforce chunk budget:
   - `npm run budget:js`

## Operational policy

- Fail release if `npm run budget:js` fails without approved exception.
- If exceptions are accepted, document:
  - affected chunk
  - measured size
  - mitigation owner
  - target release for fix

## Suggested optimization order

1. Remove unused wallet/provider dependencies from critical routes.
2. Dynamically import heavy charting/terminal modules where safe.
3. Prioritize above-fold critical assets and defer secondary widgets.
