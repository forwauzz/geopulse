const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("comment-json");

/**
 * Load only Wrangler's scalar `vars` for Next.js static generation.
 *
 * Runtime bindings (KV, R2, queues, Browser Rendering, Workers AI) must never be opened while
 * `next build` fans static pages out across worker processes. Repeated `getPlatformProxy()` sessions
 * leak esbuild watchers and can deadlock the Cloudflare build. Scalar vars are safe and preserve the
 * feature flags/public URLs that static pages previously read from a live Wrangler session.
 */
function loadWranglerBuildVars(projectRoot, configFile = "wrangler.jsonc") {
  const configPath = path.join(projectRoot, configFile);
  const config = parse(fs.readFileSync(configPath, "utf8"), undefined, true);
  const vars = config && typeof config === "object" ? config.vars : undefined;

  if (!vars || typeof vars !== "object" || Array.isArray(vars)) {
    return {};
  }

  const buildVars = {};
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      buildVars[key] = String(value);
    }
  }
  return buildVars;
}

module.exports = { loadWranglerBuildVars };
