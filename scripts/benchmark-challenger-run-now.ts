import { createBenchmarkExecutionAdapter } from '../lib/server/benchmark-execution';
import {
  runScheduledBenchmarkSweep,
  toBenchmarkChallengerScheduleEnv,
} from '../lib/server/benchmark-schedule';
import { runIntelligenceLearningLoop } from '../lib/server/intelligence-learning-loop';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function values(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) continue;
    parsed.set(token.slice(2), value);
    index += 1;
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = values(process.argv.slice(2));
  const querySetId = args.get('query-set-id');
  if (!querySetId) throw new Error('missing_--query-set-id');
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('production_supabase_env_missing');

  const supabase = createServiceRoleClient(url, key);
  const scheduleEnv = toBenchmarkChallengerScheduleEnv({
    BENCHMARK_CHALLENGER_ENABLED: 'true',
    BENCHMARK_CHALLENGER_QUERY_SET_ID: querySetId,
    BENCHMARK_CHALLENGER_MODEL_ID: args.get('model-id') ?? 'sonar',
    BENCHMARK_CHALLENGER_RUN_MODES: args.get('run-mode') ?? 'blind_discovery',
    BENCHMARK_CHALLENGER_VERTICAL: 'healthcare',
    BENCHMARK_CHALLENGER_DOMAINS: args.get('domain') ?? 'techehealthservices.com',
    BENCHMARK_CHALLENGER_DOMAIN_LIMIT: '1',
    BENCHMARK_CHALLENGER_MAX_RUNS: '1',
    BENCHMARK_CHALLENGER_MAX_FAILURES: '1',
    BENCHMARK_CHALLENGER_WINDOW_HOURS: '24',
    BENCHMARK_CHALLENGER_VERSION: args.get('version') ?? 'teche-clinic-v1',
    BENCHMARK_CHALLENGER_QUERY_DELAY_MS: args.get('query-delay-ms') ?? '3500',
    BENCHMARK_CHALLENGER_INCLUDE_USER_PROMPTS: 'false',
  });
  const summary = await runScheduledBenchmarkSweep({
    supabase,
    env: scheduleEnv,
    adapter: createBenchmarkExecutionAdapter({
      ...process.env,
      // Local scripts load secrets from .env files but not Wrangler's checked-in vars.
      // Match production's multi-provider routing instead of silently falling back to stub.
      BENCHMARK_EXECUTION_PROVIDER: process.env['BENCHMARK_EXECUTION_PROVIDER'] ?? 'multi',
    }),
    triggerSource: 'manual_run_now',
  });
  const quality = summary.launchedRuns > 0
    ? await supabase.rpc('refresh_recent_benchmark_intelligence_quality', { p_recent_hours: 72 })
    : { data: null, error: null };
  if (quality.error) throw quality.error;
  const learning = summary.launchedRuns > 0
    ? await runIntelligenceLearningLoop(supabase)
    : null;
  console.log(JSON.stringify({ summary, qualityRefresh: quality.data, learning }, null, 2));
  if (summary.failedRuns > 0 || summary.stoppedEarly) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
