# Release Parity Checklist

This checklist gates production rollout for `https://clmm.raum.network`.

## Required build environment

- `NEXT_PUBLIC_BUILD_SHA=<git sha>`
- `NEXT_PUBLIC_BUILD_TIME=<utc iso timestamp>`
- `NEXT_PUBLIC_APP_VERSION=<semver>`
- `NEXT_PUBLIC_SITE_URL=https://clmm.raum.network`

## Build + deploy gate

1. Build artifact:
   - `npm ci`
   - `npm run build`
2. Deploy artifact to production.
3. Verify live parity:
   - `curl -s https://clmm.raum.network/api/build-info | jq`
4. Deployment is invalid unless:
   - `buildSha` from `/api/build-info` equals release SHA.
   - `buildTime` is present and matches release window.

## Baseline references

- Surface baseline audit: `ee3ba29a`
- Full baseline audit: `aa1f07cf`

## Post-deploy smoke

1. `curl -I https://clmm.raum.network/`
2. `curl -I https://clmm.raum.network/dashboard`
3. `curl -s https://clmm.raum.network/robots.txt`
4. `curl -s https://clmm.raum.network/sitemap.xml`
5. `curl -s https://clmm.raum.network/api/build-info`
