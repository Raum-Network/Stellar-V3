# Secret Incident Workflow

Use this workflow for any `security/leaked-secrets` finding.

## 1) Identify source

1. Build app:
   - `npm run build`
2. Trace finding:
   - `npm run security:trace-bundle-secret`
3. Scan source and bundle:
   - `npm run security:scan`

## 2) Classify finding

- True positive: credential/token/private key present.
- False positive: benign string (for example enum names from third-party dependencies).

## 3) If true positive

1. Revoke and rotate exposed credential immediately.
2. Remove secret from source/config.
3. Rebuild and re-run scans.
4. Re-audit live site.
5. Record incident timeline and closure evidence.

## 4) If false positive

1. Capture evidence:
   - matched file path
   - owning package/source
   - why value is non-sensitive
2. Add reviewed safe pattern to:
   - `.security/secret-scan-allowlist.txt`
3. Keep evidence in release notes for audit traceability.

## Current known finding

- Pattern: `PASSWO...`
- Typical source: bundled constants from wallet dependencies (for example Freighter message enums such as `CONFIRM_PASSWORD`).
- Status: requires verification on each release build before marking as false positive.
