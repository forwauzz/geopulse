import { createBenchmarkRepository } from '../lib/server/benchmark-repository';
import {
  buildBenchmarkScheduleCapacitySummary,
  type BenchmarkScaleScenario,
} from '../lib/server/benchmark-schedule-capacity';
import {
  parseBenchmarkScheduleConfig,
  previewBenchmarkScheduleSweep,
} from '../lib/server/benchmark-schedule';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function parseArgv(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(token.slice(2), value);
  }

  return values;
}

function parseTargetDomainCounts(raw: string | undefined): number[] {
  if (!raw) return [];

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
}

function printScenario(scenario: BenchmarkScaleScenario): void {
  console.log(
    `  - ${scenario.domainCount} domains: ${scenario.runGroupCount} run groups, ${scenario.queryRunCount} query runs, ${scenario.windowsNeeded} windows, ${scenario.daysNeeded} days`
  );
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const config = parseBenchmarkScheduleConfig(process.env as Record<string, string | undefined>);
  if (!config) {
    console.error('Benchmark schedule config is not enabled or is incomplete.');
    process.exit(1);
  }

  const args = parseArgv(process.argv.slice(2));
  const supabase = createServiceRoleClient(url, key);
  const repo = createBenchmarkRepository(supabase);
  const preview = await previewBenchmarkScheduleSweep({
    repo,
    config,
  });
  const queries = await repo.getQueriesForQuerySet(preview.querySetId);
  const summary = buildBenchmarkScheduleCapacitySummary({
    selectedDomainCount: preview.domains.length,
    queryCount: queries.length,
    runModeCount: preview.runModes.length,
    maxRunsPerWindow: preview.maxRuns,
    windowHours: preview.windowHours,
    targetDomainCounts: parseTargetDomainCounts(args.get('targets')),
  });

  console.log('benchmark schedule capacity:');
  console.log(`  query set: ${preview.querySetName} ${preview.querySetVersion}`);
  console.log(`  query_count: ${summary.queryCount}`);
  console.log(`  model_id: ${preview.modelId}`);
  console.log(`  run_modes: ${preview.runModes.join(',')}`);
  console.log(`  selected_domains: ${summary.selectedDomainCount}`);
  console.log(`  max_runs_per_window: ${summary.maxRunsPerWindow}`);
  console.log(`  window_hours: ${summary.windowHours}`);
  console.log(`  windows_per_day: ${summary.windowsPerDay}`);
  console.log(`  max_runs_per_day: ${summary.maxRunsPerDay}`);
  console.log(`  max_domains_per_window: ${summary.maxDomainsPerWindow}`);
  console.log(`  max_domains_per_day: ${summary.maxDomainsPerDay}`);
  console.log(`  selected_run_groups: ${summary.selectedRunGroupCount}`);
  console.log(`  selected_query_runs: ${summary.selectedQueryRunCount}`);
  console.log(`  selected_windows_needed: ${summary.selectedWindowsNeeded}`);
  console.log(`  selected_days_needed: ${summary.selectedDaysNeeded}`);
  console.log('scale scenarios:');
  for (const scenario of summary.scenarios) {
    printScenario(scenario);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
