import { createBenchmarkExecutionAdapter } from '../lib/server/benchmark-execution';
import { runScheduledBenchmarkSweep } from '../lib/server/benchmark-schedule';
import { createServiceRoleClient } from '../lib/supabase/service-role';

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createServiceRoleClient(url, key);
  const summary = await runScheduledBenchmarkSweep({
    supabase,
    env: process.env as Record<string, string | undefined>,
    adapter: createBenchmarkExecutionAdapter(process.env),
  });

  if (!summary.enabled) {
    console.error('Benchmark schedule is not enabled or is incomplete.');
    process.exit(1);
  }

  console.log('benchmark schedule run now:');
  console.log(`  query_set_id: ${summary.querySetId}`);
  console.log(`  model_id: ${summary.modelId}`);
  console.log(`  schedule_version: ${summary.scheduleVersion}`);
  console.log(`  window_date: ${summary.windowDate}`);
  console.log(`  domain_count: ${summary.domainCount}`);
  console.log(`  launched_runs: ${summary.launchedRuns}`);
  console.log(`  skipped_existing_runs: ${summary.skippedExistingRuns}`);
  console.log(`  failed_runs: ${summary.failedRuns}`);
  console.log(`  stopped_early: ${summary.stoppedEarly}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
