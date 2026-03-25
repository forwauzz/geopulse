# Cloudflare Workers Builds (Git → Worker)

## Why `next build` alone fails deploy

OpenNext (`@opennextjs/cloudflare`) needs the **OpenNext bundle** (`.open-next/`, compiled config). Plain `npm run build` → `next build` only produces `.next/`, so `wrangler deploy` → `opennextjs-cloudflare deploy` errors with:

`Could not find compiled Open Next config, did you run the build command?`

## Workers Builds ignores Wrangler `build.command`

[Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) states that **custom builds in `wrangler.jsonc` / `wrangler.toml` are not used** by Git-connected Workers Builds. The `build` block in this repo still applies to **local** `wrangler deploy` / `wrangler dev`.

## Fix: dashboard (required once)

Worker → **Settings** → **Builds**:

**Option A — two steps (recommended)**

| Field | Value |
|--------|--------|
| Build command | `npm run build:worker` |
| Deploy command | `npx wrangler deploy` |

**Option B — deploy runs OpenNext + Wrangler**

| Field | Value |
|--------|--------|
| Build command | *(leave empty; build step is optional)* |
| Deploy command | `npm run deploy` |

Add the same **build environment variables** as GitHub Actions (see `.github/workflows/ci.yml` for `NEXT_PUBLIC_*` placeholders) so `opennextjs-cloudflare build` can finish on CI.

## Preview / non-production branches

If you use a custom **non-production deploy command**, ensure the OpenNext bundle exists before upload (e.g. run `npm run build:worker` in the build step, or a deploy script that builds then `wrangler versions upload`).

## Turnstile in production (error `400020` / invalid sitekey)

[Error 400020](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/) means **invalid sitekey** — not a hostname issue (that is a different code, e.g. domain not authorized).

1. **Cloudflare Turnstile** → your site → copy the **Site key** (public).
2. **Worker** → **Variables** → set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to that value (public, not a secret).
3. **`wrangler secret put TURNSTILE_SECRET_KEY`** with the **secret key** for the same widget (server-side verify).
4. In the Turnstile widget, **Hostnames** must include your production host (e.g. `geopulse.io`, `www.geopulse.io` if used).
5. **Workers Builds** should pass the same `NEXT_PUBLIC_*` values at **build** time if the client bundle was inlined with placeholders; otherwise a redeploy after fixing Worker vars may be enough depending on OpenNext env behavior.

`wrangler.jsonc` defaults `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to empty — set the real key in the dashboard, not a placeholder string.

### `*.workers.dev` preview URLs

Preview deployments (e.g. `https://geo-pulse.yoursubdomain.workers.dev/`) use the **same** Worker variables as production for that Worker, but the hostname is different from `geopulse.io`. In **Turnstile → your widget → Hostnames**, add the exact preview host (e.g. `geo-pulse.uzzielt.workers.dev`) or whatever Cloudflare allows for your account; otherwise challenges can fail with domain errors after the site key is set.
