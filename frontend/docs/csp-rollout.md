# CSP Rollout

`next.config.mjs` now supports phased CSP rollout using `CSP_MODE`.

## Modes

- `CSP_MODE=report-only` (default):
  - Enforces baseline CSP (`Content-Security-Policy`)
  - Publishes strict candidate as `Content-Security-Policy-Report-Only`
  - Sends reports to `/api/csp-report`
- `CSP_MODE=enforce`:
  - Enforces strict CSP only (`Content-Security-Policy`)

## Rollout steps

1. Deploy with `CSP_MODE=report-only`.
2. Collect reports for 24-48 hours:
   - endpoint: `POST /api/csp-report`
   - logs include directive, blocked URI, and document URI.
3. Review violations and allowlist only required domains.
4. Switch to `CSP_MODE=enforce`.
5. Re-run full live audit after enforcement.

## Notes

- `style-src` keeps `'unsafe-inline'` because Tailwind and runtime style injection are used.
- `script-src` strict mode removes `unsafe-inline` and `unsafe-eval`.
- If strict mode breaks required flows, revert to report-only and document the exception before re-enabling.
