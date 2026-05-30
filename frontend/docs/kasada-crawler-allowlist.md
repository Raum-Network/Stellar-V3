# Kasada/WAF Crawler Allowlist Plan

Apply this in edge WAF/Kasada configuration for crawl visibility while keeping protection on sensitive paths.

## Rule scope

- Match methods: `GET`, `HEAD`
- Match paths only:
  - `/`
  - `/robots.txt`
  - `/sitemap.xml`
  - `/about`
  - `/contact`
  - `/privacy`
  - `/dashboard`
  - `/swap`
  - `/pools`
  - `/governance`
  - `/terminal`

## Behavior

- No challenge/captcha on matched requests.
- Keep challenge/protection enabled for:
  - all non-listed paths
  - all non-idempotent methods (`POST`, `PUT`, `PATCH`, `DELETE`)
- Add rate limiting on allowlisted paths:
  - example: `30 req/min/IP`
- Enable abuse logging for allowlisted paths.

## Validation

1. Header and challenge checks:
   - `curl -I https://clmm.raum.network/`
   - `curl -I https://clmm.raum.network/sitemap.xml`
   - `curl -I https://clmm.raum.network/about`
2. Confirm no bot challenge response payload for allowlisted routes.
3. Confirm non-allowlisted routes remain protected.
4. Run:
   - `npm run audit:live:surface`
   - `npm run audit:live:full`

## Exit criterion

- Full audit crawls all public routes from sitemap with no challenge interruptions.
