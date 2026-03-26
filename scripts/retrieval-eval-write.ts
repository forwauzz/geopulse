import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runRetrievalFixture, type RetrievalEvalFixture } from '../lib/server/retrieval-eval-writer';

type CliArgs = {
  fixturePath: string;
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

  return {
    fixturePath: values.get('fixture') ?? 'eval/fixtures/retrieval-eval-sample.json',
    siteUrl: values.get('site-url') ?? null,
    domain: values.get('domain') ?? null,
    promptSetName: values.get('prompt-set-name') ?? 'retrieval-sample',
    rubricVersion: values.get('rubric-version') ?? 'retrieval-foundation-v1',
    generatorVersion: values.get('generator-version') ?? 'deterministic-local',
    notes: values.get('notes') ?? null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), args.fixturePath), 'utf8')
  ) as RetrievalEvalFixture;

  const effectiveFixture: RetrievalEvalFixture = {
    ...fixture,
    siteUrl: args.siteUrl ?? fixture.siteUrl,
    domain: args.domain ?? fixture.domain,
  };

  const aggregate = runRetrievalFixture(effectiveFixture);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: runRow, error: runError } = await supabase
    .from('retrieval_eval_runs')
    .insert({
      scan_run_id: null,
      report_id: null,
      rubric_version: args.rubricVersion,
      generator_version: args.generatorVersion,
      prompt_set_name: args.promptSetName,
      overall_score: aggregate.overallScore,
      metrics: aggregate.metrics,
      notes: args.notes,
      framework: 'deterministic_retrieval',
      domain: aggregate.domain,
      site_url: aggregate.siteUrl,
      metadata: {
        fixture_path: args.fixturePath,
        page_count: effectiveFixture.pages.length,
        prompt_count: effectiveFixture.prompts.length,
      },
    })
    .select('id')
    .single();

  if (runError || !runRow?.id) {
    console.error('Run insert failed:', runError?.message ?? 'unknown error');
    process.exit(1);
  }

  const runId = runRow.id as string;
  const promptInserts = effectiveFixture.prompts.map((prompt) => ({
    run_id: runId,
    prompt_key: prompt.promptKey,
    prompt_text: prompt.promptText,
    expected_sources: prompt.expectedSources ?? null,
    expected_facts: prompt.expectedFacts ?? null,
  }));

  const { data: promptRows, error: promptError } = await supabase
    .from('retrieval_eval_prompts')
    .insert(promptInserts)
    .select('id,prompt_key');

  if (promptError || !promptRows) {
    console.error('Prompt insert failed:', promptError?.message ?? 'unknown error');
    process.exit(1);
  }

  const promptIdByKey = new Map<string, string>();
  for (const row of promptRows) {
    const promptKey = String((row as { prompt_key: unknown }).prompt_key ?? '');
    const promptId = String((row as { id: unknown }).id ?? '');
    if (promptKey && promptId) promptIdByKey.set(promptKey, promptId);
  }

  const passageInserts = aggregate.results.flatMap((result) => {
    const promptId = promptIdByKey.get(result.promptKey);
    if (!promptId) return [];
    return result.passages.map((passage) => ({
      run_id: runId,
      prompt_id: promptId,
      scan_page_url: passage.pageUrl,
      source_url: passage.pageUrl,
      section_label: passage.section,
      passage_text: passage.passageText,
      rank: passage.rank,
      metadata: { score: passage.score },
    }));
  });

  if (passageInserts.length > 0) {
    const { error: passageError } = await supabase.from('retrieval_eval_passages').insert(passageInserts);
    if (passageError) {
      console.error('Passage insert failed:', passageError.message);
      process.exit(1);
    }
  }

  const answerInserts = aggregate.results.flatMap((result) => {
    const promptId = promptIdByKey.get(result.promptKey);
    if (!promptId) return [];
    const prompt = effectiveFixture.prompts.find((item) => item.promptKey === result.promptKey);
    return [
      {
        run_id: runId,
        prompt_id: promptId,
        answer_text: result.answerText,
        cited_sources: result.passages.map((passage) => passage.pageUrl),
        metrics: {
          ...result.metrics,
          expected_sources: prompt?.expectedSources ?? [],
          expected_facts: prompt?.expectedFacts ?? [],
        },
      },
    ];
  });

  if (answerInserts.length > 0) {
    const { error: answerError } = await supabase.from('retrieval_eval_answers').insert(answerInserts);
    if (answerError) {
      console.error('Answer insert failed:', answerError.message);
      process.exit(1);
    }
  }

  console.log(
    'retrieval_eval_runs insert ok:',
    runId,
    'prompts:',
    promptInserts.length,
    'passages:',
    passageInserts.length,
    'answers:',
    answerInserts.length,
    'overall_score:',
    aggregate.overallScore
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
