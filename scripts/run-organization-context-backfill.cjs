const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shimPath = path.resolve(__dirname, 'node-shims');
const tsx = path.join(path.dirname(require.resolve('tsx', { paths: [root] })), 'cli.mjs');
const envRoot = process.env.GEO_PULSE_ENV_ROOT
  ? path.resolve(process.env.GEO_PULSE_ENV_ROOT)
  : root;
const result = spawnSync(process.execPath, [
  `--env-file-if-exists=${path.join(envRoot, '.env.local')}`,
  `--env-file-if-exists=${path.join(envRoot, '.dev.vars')}`,
  tsx,
  path.resolve(__dirname, 'organization-context-backfill.ts'),
  ...process.argv.slice(2),
], {
  cwd: root,
  env: {
    ...process.env,
    NODE_PATH: [shimPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
