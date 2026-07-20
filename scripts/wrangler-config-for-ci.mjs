/**
 * Derives a CI-only wrangler config from `wrangler.jsonc` with the Workers AI binding removed.
 *
 * WHY: `next dev` gets its Cloudflare bindings — crucially the `vars` block of feature flags —
 * from the wrangler session `initOpenNextCloudflareForDev()` starts. Workers AI has no local
 * simulation (AI models always run on Cloudflare), so its presence forces that session into remote
 * mode and it demands an account login CI does not have. Dropping the binding is enough: nothing
 * in the e2e suite exercises the AI path, and every other binding emulates locally.
 *
 * The config is DERIVED rather than hand-maintained so it cannot drift from the real one.
 *
 * Deleting the block textually (rather than parsing) keeps this dependency-free — wrangler.jsonc
 * is JSONC, and `//` also appears inside URLs, so a whole-file comment stripper would be wrong.
 * If the block is ever reformatted past this pattern we FAIL LOUDLY: silently emitting a config
 * that still carried the AI binding would just resurrect the login error with no clue why.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'wrangler.jsonc';
const OUTPUT = 'wrangler.ci.jsonc';

/** The `ai` block: a top-level key whose object body contains no nested braces. */
const AI_BLOCK = /^[ \t]*"ai"[ \t]*:[ \t]*\{[^{}]*\},?[ \t]*\r?\n/m;

const source = readFileSync(SOURCE, 'utf8');
if (!AI_BLOCK.test(source)) {
  console.error(
    `${SOURCE}: could not find the "ai" binding block to strip.\n` +
      'If the binding was removed deliberately, delete this script and its CI step. If it was ' +
      'merely reformatted, update AI_BLOCK to match — leaving it in place breaks the smoke tests ' +
      'with "You must be logged in to use wrangler dev in remote mode".'
  );
  process.exit(1);
}

writeFileSync(OUTPUT, source.replace(AI_BLOCK, ''));
console.log(`${OUTPUT} written (Workers AI binding stripped for local dev bindings in CI).`);
