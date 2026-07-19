#!/usr/bin/env node
/**
 * fix-agent-apply.mjs — the Fix Agent's deterministic fixers.
 *
 * Each fixer is a small, IDEMPOTENT rule: it inspects the repo, decides whether a known
 * AI-search-readiness gap exists, and applies the exact change. No LLM, no API key, no
 * hallucination — so its output is safe to auto-apply and review as a normal diff.
 *
 * The Fix Agent runs this in CI; anything it changes becomes a PR attributed to the agent.
 * Model-written changes (Workers AI) are intentionally NOT part of this script — those stay
 * PR-only + human-reviewed.
 *
 * Usage:
 *   node scripts/fix-agent-apply.mjs           # apply fixers, print a summary
 *   node scripts/fix-agent-apply.mjs --dry-run # report only, change nothing
 *   node scripts/fix-agent-apply.mjs --json    # machine-readable summary (for the PR body)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const JSON_OUT = args.includes('--json');

const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);
const write = (p, body) => {
  const full = join(ROOT, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
};

/**
 * A fixer: { id, checkId, title, why, detect() -> boolean (needs fixing), apply() -> string[] (files) }
 * `detect` must be cheap and side-effect free.
 */
const FIXERS = [
  {
    id: 'llms-txt',
    checkId: 'llms-txt',
    title: 'Add /llms.txt so AI crawlers get a guided index of the site',
    why: 'Answer engines use llms.txt to find the pages worth reading first.',
    detect: () => read('public/llms.txt') === null && read('app/llms.txt/route.ts') === null,
    apply: () => {
      write(
        'public/llms.txt',
        [
          '# llms.txt — guidance for AI crawlers and answer engines',
          '',
          '> Replace the summary and links below with your highest-value pages.',
          '',
          '## Key pages',
          '- /: what this site is',
          '- /about: who is behind it',
          '',
        ].join('\n')
      );
      return ['public/llms.txt'];
    },
  },
  {
    id: 'robots-txt',
    checkId: 'robots-txt',
    title: 'Add robots.txt so crawlers are not blocked by default',
    why: 'Without robots.txt some crawlers back off; it also advertises the sitemap.',
    detect: () => read('app/robots.ts') === null && read('public/robots.txt') === null,
    apply: () => {
      write(
        'public/robots.txt',
        ['User-agent: *', 'Allow: /', '', '# Sitemap: https://example.com/sitemap.xml', ''].join('\n')
      );
      return ['public/robots.txt'];
    },
  },
  {
    id: 'security-headers',
    checkId: 'security-headers',
    title: 'Declare the core security headers in next.config',
    why: 'Trust signals: HSTS, nosniff and frame-deny are checked by the audit.',
    detect: () => {
      const cfg = read('next.config.ts') ?? read('next.config.mjs') ?? read('next.config.js');
      if (cfg === null) return false; // not a Next app — nothing deterministic to do
      const lower = cfg.toLowerCase();
      return !(
        lower.includes('strict-transport-security') &&
        lower.includes('x-content-type-options') &&
        lower.includes('x-frame-options')
      );
    },
    // Editing an arbitrary next.config safely is not deterministic enough to automate — report it
    // so the PR body tells a human exactly what to add, rather than mangling their config.
    apply: () => [],
    reportOnly: true,
  },
];

const applied = [];
const reported = [];
const skipped = [];

for (const fixer of FIXERS) {
  let needs = false;
  try {
    needs = Boolean(fixer.detect());
  } catch (err) {
    skipped.push({ id: fixer.id, reason: `detect failed: ${err.message}` });
    continue;
  }
  if (!needs) {
    skipped.push({ id: fixer.id, reason: 'already satisfied' });
    continue;
  }
  if (fixer.reportOnly) {
    reported.push({ id: fixer.id, title: fixer.title, why: fixer.why });
    continue;
  }
  if (DRY_RUN) {
    reported.push({ id: fixer.id, title: fixer.title, why: fixer.why, dryRun: true });
    continue;
  }
  try {
    const files = fixer.apply() ?? [];
    applied.push({ id: fixer.id, title: fixer.title, why: fixer.why, files });
  } catch (err) {
    skipped.push({ id: fixer.id, reason: `apply failed: ${err.message}` });
  }
}

const summary = { applied, reported, skipped, changed: applied.length > 0 };

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('[fix-agent] deterministic fixers');
  for (const a of applied) console.log(`  ✓ applied  ${a.id} — ${a.title} (${a.files.join(', ')})`);
  for (const r of reported) console.log(`  ! needs review  ${r.id} — ${r.title}`);
  for (const s of skipped) console.log(`  · skipped  ${s.id} — ${s.reason}`);
  console.log(`[fix-agent] changed=${summary.changed}`);
}

// Exit 0 always: "nothing to fix" is a success, not a failure.
process.exit(0);
