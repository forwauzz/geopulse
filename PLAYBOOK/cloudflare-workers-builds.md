# Cloudflare Workers Builds (Git -> Worker)

## Why `next build` alone fails deploy

OpenNext (`@opennextjs/cloudflare`) needs the OpenNext bundle (`.open-next/`, compiled config). Plain `npm run build` -> `next build` only produces `.next/`, so `wrangler deploy` can fail with:

`Could not find compiled Open Next config, did you run the build command?`

## Fix: dashboard (required once)

Worker -> **Settings** -> **Builds**:

**Option A - guarded upload (recommended)**

| Field | Value |
|--------|--------|
| Build command | `npm run build:worker` |
| Deploy command | `npm run deploy:upload` |

**Option B - local deploy parity**

| Field | Value |
|--------|--------|
| Build command | *(leave empty; build step is optional)* |
| Deploy command | `npm run deploy` |

`npm run deploy:upload` runs queue preflight (`npm run deploy:guard`) before `wrangler versions upload`, preventing queue-binding deploy failures.

Add the same build environment variables as GitHub Actions (see `.github/workflows/ci.yml` for `NEXT_PUBLIC_*` placeholders) so OpenNext build can finish on CI.

## Preview / non-production branches

If you use a custom non-production deploy command, ensure the OpenNext bundle exists before upload (for example run `npm run build:worker` in build step, or use a deploy script that builds before `wrangler versions upload`).

## Turnstile in production (error `400020` / invalid sitekey)

[Error 400020](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/) means invalid sitekey, not a hostname issue.

1. Cloudflare Turnstile -> your site -> copy the site key (public).
2. Worker -> Variables -> set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to that value (public, not a secret).
3. Run `wrangler secret put TURNSTILE_SECRET_KEY` with the secret key for the same widget.
4. In the Turnstile widget, Hostnames must include your production host (for example `getgeopulse.com`, `www.getgeopulse.com` if used).
5. Workers Builds should pass the same `NEXT_PUBLIC_*` values at build time if the client bundle was inlined with placeholders; otherwise redeploy after fixing Worker vars.

`wrangler.jsonc` defaults `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to empty - set the real key in dashboard variables, not a placeholder string.

### `*.workers.dev` preview URLs

Preview deployments (for example `https://geo-pulse.yoursubdomain.workers.dev/`) use the same Worker variables as production for that Worker, but the hostname differs from your custom domain. In Turnstile Hostnames, add the exact preview host (for example `geo-pulse.uzzielt.workers.dev`) so challenges do not fail on domain authorization.
