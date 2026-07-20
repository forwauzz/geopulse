const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, ".open-next");

/**
 * Re-entry guard. MUST come before any build work.
 *
 * wrangler runs wrangler.jsonc's `build.command` — i.e. this script — for more commands than just
 * `deploy`, and `wrangler types` is one of them. Since this script now calls `wrangler types`
 * (see below), an unguarded version re-enters itself forever: each build spawns a typegen, which
 * spawns a build, which spawns a typegen. That is a fork bomb, not a slow build.
 *
 * When we invoke typegen we set this variable, so the nested hook returns immediately. Generating
 * types does not need a build — the types come from parsing the config.
 */
if (process.env["GEOPULSE_BUILD_TYPEGEN"] === "1") {
  process.exit(0);
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return;
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }

  // renameSync can also throw EPERM on Windows when files inside .open-next
  // are still locked by a previous process. Catch that too and warn rather
  // than aborting — OpenNext will overwrite the output directory anyway.
  const renamedPath = path.join(projectRoot, `.open-next-stale-${Date.now()}`);
  try {
    fs.renameSync(targetPath, renamedPath);
  } catch (renameError) {
    console.warn(
      `[opennext-build] Could not remove or rename stale .open-next (${renameError.message}). ` +
        `Proceeding — OpenNext will overwrite the output directory.`
    );
    return;
  }

  try {
    fs.rmSync(renamedPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `[opennext-build] Preserved stale build output at ${path.basename(renamedPath)}: ${error.message}`
    );
  }
}

removeIfExists(outputDir);

/**
 * Regenerate `cloudflare-env.d.ts` before building.
 *
 * That file types `CloudflareEnv` from the bindings and vars in wrangler.jsonc, and it is
 * gitignored because it is generated. `next build` type-checks against it (ignoreBuildErrors is
 * false), so any build from a clean checkout — Cloudflare Workers Builds, a fresh clone — fails
 * as soon as wrangler.jsonc gains a binding or var those stale/absent types do not know about:
 *
 *     Type error: Property 'DEEP_AUDIT_INTERNAL_REWRITE_PROVIDER' does not exist on type 'CloudflareEnv'.
 *
 * That is how the deploy pipeline broke in 18da8ddb, and it stayed broken silently because every
 * deploy since was run by hand from a working tree that already had the file. Generating it here
 * makes every build path self-sufficient instead of depending on the caller having run cf-typegen.
 * No Cloudflare credentials needed — the types come from the config file.
 */
const wranglerBin = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const typegen = spawnSync(
  process.execPath,
  [wranglerBin, "types", "--env-interface", "CloudflareEnv", "cloudflare-env.d.ts"],
  {
    stdio: "inherit",
    cwd: projectRoot,
    // Marks the nested `build.command` invocation so it returns immediately — see the guard above.
    env: { ...process.env, GEOPULSE_BUILD_TYPEGEN: "1" },
  }
);

if (typegen.error) {
  throw typegen.error;
}

if (typegen.status !== 0) {
  console.error("[opennext-build] `wrangler types` failed — cannot type-check the build without it.");
  process.exit(typegen.status ?? 1);
}

const cliPath = path.join(
  projectRoot,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js"
);

const result = spawnSync(process.execPath, [cliPath, "build"], {
  stdio: "inherit",
  cwd: projectRoot,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
