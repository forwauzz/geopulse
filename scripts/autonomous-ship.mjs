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
 *   5. CI green      — the PR's own checks (incl. the browser suite) must pass. Gates 2-4 run
 *                      locally and never execute the e2e suite; CI is what proves the app still
 *                      renders. Skipping this is how a four-month regression stayed invisible.
 *   6. baseline      — measure the CURRENT live AI-readiness score before touching production.
 *   --- only past all gates may it deploy ---
 *   7. deploy        — `wrangler deploy`, capture the Version ID.
 *   8. verify live   — GET the target URL; on non-2xx, AUTO-ROLLBACK (`wrangler rollback`) and fail.
 *   9. verify score  — re-audit; a DROP versus the baseline rolls back and refuses to merge.
 *  10. merge         — `gh pr merge <pr> --squash` (only with --pr and on green).
 *
 * WHY THE SCORE GATE IS THE IMPORTANT ONE
 * The point of the Fix Agent is to raise AI-readiness, and "HTTP 200" does not prove that. A
 * measured before/after delta is what makes unattended merging defensible: the merge decision is
 * arithmetic, not a model's opinion of its own work. It also caps the blast radius of a bad fixer —
 * a change that reads well but scores worse cannot reach main.
 *
 * Flags:
 *   --dry-run           run gates 1-4 only; never deploy/merge (default when unsure).
 *   --pr <number>       merge this PR after a verified deploy.
 *   --target <url>      live-verify URL (default https://getgeopulse.com/).
 *   --no-merge          deploy + verify but do not merge.
 *   --kill-file <path>  treat existence of this file as an active kill switch.
 *   --skip-score        deploy without the score gate. Requires --no-merge: never merge blind.
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
const SKIP_SCORE = flag('skip-score');
const PR = opt('pr', null);
const TARGET = opt('target', 'https://getgeopulse.com/');
const KILL_FILE = opt('kill-file', null);
const SELF_IMPROVE_SECRET = process.env['SELF_IMPROVE_TRIGGER_SECRET'] ?? '';
const WILL_MERGE = Boolean(PR) && !NO_MERGE;

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

/**
 * Ask the live site to audit itself and return the score.
 *
 * Uses the same secret-gated endpoint the daily self-improvement cron drives, so the number here is
 * the number the product reports — not a second implementation that could drift from it.
 */
function measureScore(label) {
  const url = new URL('/api/admin/self-improve', TARGET).toString();
  const raw = execSync(
    `curl -sS -X POST ${url} -H "content-type: application/json" ` +
      `-H "x-self-improve-secret: ${SELF_IMPROVE_SECRET}" -d "{\\"action\\":\\"run\\"}"`,
    { encoding: 'utf8', timeout: 300_000 }
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    die('score', `${label}: could not parse the audit response: ${raw.slice(0, 300)}`);
  }
  const score = typeof parsed.score === 'number' ? parsed.score : null;
  if (score === null) {
    die('score', `${label}: the audit returned no score (${JSON.stringify(parsed).slice(0, 300)})`);
  }
  log('score', `${label}: ${score}`);
  return score;
}

/**
 * Block until the PR's own checks finish, and fail on any red one.
 *
 * `--watch --fail-fast` returns non-zero the moment a check fails, so a red browser suite stops the
 * ship rather than being discovered after production already has the change.
 */
function requireCiGreen(pr) {
  log('ci', `waiting for checks on PR #${pr}`);
  run('ci', `gh pr checks ${pr} --watch --fail-fast`);
  log('ci', 'all PR checks green ✓');
}

// 1 — kill switch (checked first, and again right before deploy)
function killed() {
  if (process.env.SELF_IMPROVEMENT_KILL && process.env.SELF_IMPROVEMENT_KILL !== '') return true;
  if (KILL_FILE && existsSync(KILL_FILE)) return true;
  return false;
}
if (killed()) die('kill-switch', 'kill switch is active — refusing to run.');

/**
 * Validate intent before doing anything slow or outward-facing.
 *
 * Everything below runs for minutes (gates, CI watch, deploy). A run that could never legitimately
 * merge should say so immediately rather than after a ten-minute wait — and, more importantly,
 * before it has already changed production.
 */
if (!DRY_RUN && WILL_MERGE) {
  if (SKIP_SCORE) {
    die('config', '--skip-score cannot merge. Pass --no-merge, or drop --skip-score.');
  }
  if (!SELF_IMPROVE_SECRET) {
    die(
      'config',
      'SELF_IMPROVE_TRIGGER_SECRET is not set, so the before/after audit cannot run and an ' +
        'unattended merge cannot be justified. Set the secret, or pass --no-merge.'
    );
  }
}

// 2-4 — gates (never deploy on a red gate)
run('type-check', 'npm run type-check');
run('tests', 'npm run test');
run('build', 'node scripts/opennext-build.cjs');
log('gates', 'all gates green ✓');

if (DRY_RUN) {
  log('dry-run', 'gates passed; skipping deploy/verify/merge.');
  process.exit(0);
}

// 5 — CI green. Local gates never run the browser suite, so this is the only proof the app still
// renders. Required whenever we intend to merge.
if (PR) {
  requireCiGreen(PR);
} else if (WILL_MERGE) {
  die('ci', 'refusing to merge without a PR number to check.');
}

// 6 — baseline score, captured BEFORE production changes.
//
// Fail closed: if we cannot measure, we cannot justify an unattended merge, so refuse before
// deploying rather than after. That keeps main and production in step — aborting here changes
// nothing, whereas aborting post-deploy would leave production ahead of main.
// Config was already validated above, so reaching here without a secret means we are not merging.
let baseline = null;
if (SKIP_SCORE) {
  log('score', 'skipped by --skip-score (merge disabled).');
} else if (!SELF_IMPROVE_SECRET) {
  log('score', 'no secret set and not merging — skipping the score gate.');
} else {
  baseline = measureScore('baseline (live, pre-deploy)');
}

// Re-check the kill switch at the last safe moment before an outward-facing action.
if (killed()) die('kill-switch', 'kill switch activated before deploy — aborting.');

// 7 — deploy
//
// Deploy BEFORE merging, deliberately: production briefly runs the un-merged branch, but a failed
// verification rolls production back and leaves main untouched. Merging first would put a bad
// commit on main that the next automatic build would redeploy, undoing the rollback.
const deployOut = run('deploy', 'npx wrangler deploy');
const versionMatch = deployOut.match(/Current Version ID:\s*([0-9a-f-]+)/i);
const version = versionMatch ? versionMatch[1] : 'unknown';
log('deploy', `deployed. Version ID: ${version}`);

// 8 — verify live (auto-rollback on failure)
let liveOk = false;
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" ${TARGET}`, { encoding: 'utf8' }).trim();
  liveOk = code.startsWith('2');
  log('verify', `GET ${TARGET} → ${code}`);
} catch (err) {
  log('verify', `live check errored: ${err.message}`);
}
if (!liveOk) {
  rollback('live verify failed');
  die('verify', 'rolled back after failed live verification.');
}

// 9 — verify the change actually improved things. A fix that ships cleanly and scores worse is
// still a regression, and this is the gate that catches it.
function rollback(reason) {
  log('rollback', reason);
  try {
    execSync(`npx wrangler rollback --message "autonomous-ship: ${reason}"`, { stdio: 'inherit' });
  } catch (err) {
    log('rollback', `rollback command errored: ${err.message}`);
  }
}

if (baseline !== null) {
  const after = measureScore('after deploy');
  const delta = after - baseline;
  log('score', `delta: ${delta >= 0 ? '+' : ''}${delta} (${baseline} → ${after})`);

  if (after < baseline) {
    rollback(`score regressed ${baseline} → ${after}`);
    die('score', `AI-readiness dropped ${baseline} → ${after}. Rolled back; PR left open for review.`);
  }

  if (delta === 0) {
    // Not a failure — many fixes are structural and move nothing measurable. Worth surfacing so a
    // steady stream of zero-delta merges is visible rather than silently accumulating.
    log('score', 'no measurable change; shipping anyway (structural fixes often score flat).');
  }
}

// 10 — merge (only with --pr, on green)
//
// No --delete-branch: deleting a base branch closes any PR stacked on it, and a closed PR whose
// base is gone can be neither reopened nor retargeted. Branch cleanup is not worth that risk.
if (WILL_MERGE) {
  run('merge', `gh pr merge ${PR} --squash`);
  log('merge', `PR #${PR} merged.`);
} else {
  log('merge', 'skipped (no --pr or --no-merge).');
}

log('done', `shipped. Version ID: ${version}`);
