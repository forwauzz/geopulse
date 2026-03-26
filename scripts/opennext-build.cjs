const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, ".open-next");

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

  const renamedPath = path.join(projectRoot, `.open-next-stale-${Date.now()}`);
  fs.renameSync(targetPath, renamedPath);

  try {
    fs.rmSync(renamedPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `[opennext-build] Preserved stale build output at ${path.basename(renamedPath)}: ${error.message}`
    );
  }
}

removeIfExists(outputDir);

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
