import { createBenchmarkExecutionAdapter, type BenchmarkExecutionEnvLike } from '../lib/server/benchmark-execution';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import { runBenchmarkGroupSkeleton } from '../lib/server/benchmark-runner';

type CliArgs = {
  domainId: string | null;
  querySetId: string | null;
  modelId: string | null;
  auditorModelId: string | null;
  runMode: string | null;
  runLabel: string | null;
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
    domainId: values.get('domain-id') ?? null,
    querySetId: values.get('query-set-id') ?? null,
    modelId: values.get('model-id') ?? null,
    auditorModelId: values.get('auditor-model-id') ?? null,
    runMode: values.get('run-mode') ?? null,
    runLabel: values.get('run-label') ?? null,
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

  if (!args.domainId || !args.querySetId || !args.modelId) {
    console.error('Missing --domain-id, --query-set-id, or --model-id.');
    process.exit(1);
  }

  const supabase = createServiceRoleClient(url, key);
  const adapter = createBenchmarkExecutionAdapter(process.env as BenchmarkExecutionEnvLike);
  const result = await runBenchmarkGroupSkeleton(supabase, {
    domainId: args.domainId,
    querySetId: args.querySetId,
    modelId: args.modelId,
    auditorModelId: args.auditorModelId ?? undefined,
    runMode: args.runMode ?? undefined,
    runLabel: args.runLabel ?? undefined,
    notes: args.notes ?? undefined,
  }, adapter);

  console.log(
    'benchmark run ok:',
    'run_group_id:',
    result.runGroupId,
    'query_runs:',
    result.queryRunCount,
    'skipped:',
    result.skippedQueryCount
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
