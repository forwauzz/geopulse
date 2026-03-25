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
