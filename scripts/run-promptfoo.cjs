const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = process.cwd();
const entrypoint = path.join(repoRoot, 'node_modules', 'promptfoo', 'dist', 'src', 'entrypoint.js');

const result = spawnSync(process.execPath, [entrypoint, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    HOME: repoRoot,
    USERPROFILE: repoRoot,
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
