#!/usr/bin/env node
/**
 * autonomous-ship.mjs — the self-gated ship spine for Loop 5a (OSS-REFACTOR-PLAN.md).
 *
 * This is `/ship-pr` with the HUMAN CONFIRMATIONS REMOVED but every SAFETY GATE KEPT. A headless
 * coding agent (external runtime, provisioned separately) invokes this after implementing a small
 * change on a branch. "No human in the loop" is the goal; these gates are how it stays safe:
 *
 *   1. kill switch   — abort immediately if SELF_IMPROVEMENT_KILL is set (env or --kill-file).
 *   2. type-check    — `npm run type-check` must pass.
 *   3. tests         — `npm run test` must pass.
 *   4. build         — OpenNext worker build must pass.
 *   --- only past all gates may it deploy ---
 *   5. deploy        — `wrangler deploy`, capture the Version ID.
 *   6. verify live   — GET the target URL; on non-2xx, AUTO-ROLLBACK (`wrangler rollback`) and fail.
 *   7. merge         — `gh pr merge <pr> --squash --delete-branch` (only with --pr and on green).
 *
 * Flags:
 *   --dry-run           run gates 1-4 only; never deploy/merge (default when unsure).
 *   --pr <number>       merge this PR after a verified deploy.
 *   --target <url>      live-verify URL (default https://getgeopulse.com/).
 *   --no-merge          deploy + verify but do not merge.
 *   --kill-file <path>  treat existence of this file as an active kill switch.
 *
 * Bounded scope is the caller's responsibility (small diffs); this script enforces the gates.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
function flag(name) { return args.includes(`--${name}`); }
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const DRY_RUN = flag('dry-run');
const NO_MERGE = flag('no-merge');
const PR = opt('pr', null);
const TARGET = opt('target', 'https://getgeopulse.com/');
const KILL_FILE = opt('kill-file', null);

function log(step, msg) { console.log(`[autonomous-ship] ${step}: ${msg}`); }
function die(step, msg) { console.error(`[autonomous-ship] ABORT at ${step}: ${msg}`); process.exit(1); }

function run(step, cmd) {
  log(step, `$ ${cmd}`);
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (err) {
    const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim();
    die(step, `command failed\n${out.slice(-2000)}`);
  }
}

// 1 — kill switch (checked first, and again right before deploy)
function killed() {
  if (process.env.SELF_IMPROVEMENT_KILL && process.env.SELF_IMPROVEMENT_KILL !== '') return true;
  if (KILL_FILE && existsSync(KILL_FILE)) return true;
  return false;
}
if (killed()) die('kill-switch', 'kill switch is active — refusing to run.');

// 2-4 — gates (never deploy on a red gate)
run('type-check', 'npm run type-check');
run('tests', 'npm run test');
run('build', 'node scripts/opennext-build.cjs');
log('gates', 'all gates green ✓');

if (DRY_RUN) {
  log('dry-run', 'gates passed; skipping deploy/verify/merge.');
  process.exit(0);
}

// Re-check the kill switch at the last safe moment before an outward-facing action.
if (killed()) die('kill-switch', 'kill switch activated before deploy — aborting.');

// 5 — deploy
const deployOut = run('deploy', 'npx wrangler deploy');
const versionMatch = deployOut.match(/Current Version ID:\s*([0-9a-f-]+)/i);
const version = versionMatch ? versionMatch[1] : 'unknown';
log('deploy', `deployed. Version ID: ${version}`);

// 6 — verify live (auto-rollback on failure)
let liveOk = false;
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" ${TARGET}`, { encoding: 'utf8' }).trim();
  liveOk = code.startsWith('2');
  log('verify', `GET ${TARGET} → ${code}`);
} catch (err) {
  log('verify', `live check errored: ${err.message}`);
}
if (!liveOk) {
  log('rollback', 'live verification failed — rolling back.');
  try { execSync('npx wrangler rollback --message "autonomous-ship: live verify failed"', { stdio: 'inherit' }); }
  catch (err) { log('rollback', `rollback command errored: ${err.message}`); }
  die('verify', 'rolled back after failed live verification.');
}

// 7 — merge (only with --pr, on green)
if (PR && !NO_MERGE) {
  run('merge', `gh pr merge ${PR} --squash --delete-branch`);
  log('merge', `PR #${PR} merged.`);
} else {
  log('merge', 'skipped (no --pr or --no-merge).');
}

log('done', `shipped. Version ID: ${version}`);
