/**
 * Inserts one evaluation row using content-integrity rubric + fixture markdown.
 * Run: npm run eval:smoke
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { structuralReportScore } from '../lib/server/report-eval-structural';

const RUBRIC_VERSION = 'integrity-v2';
const GENERATOR_VERSION = 'smoke-fixture';
const SITE_URL = 'https://example.com/';
const DOMAIN = 'example.com';
const PROMPT_SET_NAME = 'smoke-fixture';
const FRAMEWORK = 'report_smoke';

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const fixturePath = join(process.cwd(), 'eval', 'fixtures', 'sample-deep-audit.md');
  const markdown = readFileSync(fixturePath, 'utf8');
  const { overall, metrics } = structuralReportScore(markdown);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('report_eval_runs')
    .insert({
      rubric_version: RUBRIC_VERSION,
      generator_version: GENERATOR_VERSION,
      overall_score: overall,
      metrics: metrics as unknown as Record<string, unknown>,
      report_id: null,
      scan_id: null,
      framework: FRAMEWORK,
      domain: DOMAIN,
      site_url: SITE_URL,
      prompt_set_name: PROMPT_SET_NAME,
      metadata: {
        suite_description: 'offline smoke fixture',
        fixture_path: fixturePath,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log('report_eval_runs insert ok:', data?.id, 'overall_score:', overall);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
