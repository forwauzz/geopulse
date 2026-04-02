import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { normalizeEvalDomain, summarizePromptfooResults, type PromptfooFramework } from '../lib/server/promptfoo-results';

type CliArgs = {
  framework: PromptfooFramework;
  configPath: string;
  siteUrl: string | null;
  domain: string | null;
  promptSetName: string;
  rubricVersion: string;
  generatorVersion: string;
  notes: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(token.slice(2), value);
    index += 1;
  }

  const frameworkRaw = values.get('framework');
  const framework =
    frameworkRaw === 'promptfoo_retrieval' ? 'promptfoo_retrieval' : 'promptfoo_report';
  const configPath =
    values.get('config') ??
    (framework === 'promptfoo_retrieval'
      ? 'eval/promptfoo/promptfooconfig.retrieval.yaml'
      : 'eval/promptfoo/promptfooconfig.report.yaml');

  return {
    framework,
    configPath,
    siteUrl: values.get('site-url') ?? null,
    domain: values.get('domain') ?? null,
    promptSetName:
      values.get('prompt-set-name') ??
      (framework === 'promptfoo_retrieval' ? 'retrieval-regression' : 'report-regression'),
    rubricVersion: values.get('rubric-version') ?? 'promptfoo-v1',
    generatorVersion: values.get('generator-version') ?? 'promptfoo-local',
    notes: values.get('notes') ?? null,
  };
}

function runPromptfoo(configPath: string): Record<string, unknown> {
  const tempDir = mkdtempSync(join(tmpdir(), 'geopulse-promptfoo-'));
  const outputPath = join(tempDir, 'eval-output.json');
  const result = spawnSync(
    process.execPath,
    [
      './scripts/run-promptfoo.cjs',
      'eval',
      '-c',
      configPath,
      '--no-progress-bar',
      '--no-share',
      '--output',
      outputPath,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: process.cwd(),
        USERPROFILE: process.cwd(),
      },
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    rmSync(tempDir, { recursive: true, force: true });
    process.exit(result.status ?? 1);
  }

  const payload = JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
  rmSync(tempDir, { recursive: true, force: true });
  return payload;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const payload = runPromptfoo(args.configPath);
  const summary = summarizePromptfooResults(args.framework, payload);
  const domain = normalizeEvalDomain(args.siteUrl, args.domain);
  const siteUrl = args.siteUrl?.trim() || null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (args.framework === 'promptfoo_report') {
    const { data, error } = await supabase
      .from('report_eval_runs')
      .insert({
        rubric_version: args.rubricVersion,
        generator_version: args.generatorVersion,
        overall_score: summary.overallScore,
        metrics: summary.metrics,
        report_id: null,
        scan_id: null,
        framework: args.framework,
        domain,
        site_url: siteUrl,
        prompt_set_name: args.promptSetName,
        metadata: summary.metadata,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Insert failed:', error.message);
      process.exit(1);
    }

    console.log('report_eval_runs insert ok:', data?.id, 'overall_score:', summary.overallScore);
    return;
  }

  const { data, error } = await supabase
    .from('retrieval_eval_runs')
    .insert({
      rubric_version: args.rubricVersion,
      generator_version: args.generatorVersion,
      prompt_set_name: args.promptSetName,
      overall_score: summary.overallScore,
      metrics: summary.metrics,
      notes: args.notes,
      framework: args.framework,
      domain,
      site_url: siteUrl,
      metadata: summary.metadata,
      scan_run_id: null,
      report_id: null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log('retrieval_eval_runs insert ok:', data?.id, 'overall_score:', summary.overallScore);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
