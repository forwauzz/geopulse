import { createBenchmarkAdminData } from '../lib/server/benchmark-admin-data';
import { parseBenchmarkScheduleConfig } from '../lib/server/benchmark-schedule';
import { buildBenchmarkScheduleMultiWindowSummary } from '../lib/server/benchmark-schedule-window-summary';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function parseArgs(argv: string[]): { windowDates: string[] } {
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
    windowDates: (values.get('window-dates') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.windowDates.length === 0) {
    console.error('Missing --window-dates YYYY-MM-DDTHH,YYYY-MM-DDTHH');
    process.exit(1);
  }

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

  const supabase = createServiceRoleClient(url, key);
  const adminData = createBenchmarkAdminData(supabase as any);
  const runs = await adminData.getRunGroups({
    querySetId: config.querySetId,
    modelId: config.modelId,
  });
  const summary = buildBenchmarkScheduleMultiWindowSummary({
    runs,
    querySetId: config.querySetId,
    modelId: config.modelId,
    scheduleVersion: config.scheduleVersion,
    windowDates: args.windowDates,
  });

  const recurringWinners = summary.domains
    .filter((domain) => domain.positiveDeltaWindowCount === summary.windowCount)
    .slice(0, 5);
  const recurringLaggards = [...summary.domains]
    .filter((domain) => domain.negativeDeltaWindowCount === summary.windowCount)
    .sort((left, right) => {
      if (left.averageDeltaCitationRate !== right.averageDeltaCitationRate) {
        return left.averageDeltaCitationRate - right.averageDeltaCitationRate;
      }
      return left.canonicalDomain.localeCompare(right.canonicalDomain);
    })
    .slice(0, 5);

  console.log('benchmark schedule recurrence:');
  console.log(`  schedule_version: ${summary.scheduleVersion}`);
  console.log(`  query_set_id: ${summary.querySetId}`);
  console.log(`  model_id: ${summary.modelId}`);
  console.log(`  window_count: ${summary.windowCount}`);
  console.log(`  paired_domain_count: ${summary.pairedDomainCount}`);
  console.log(`  window_dates: ${summary.windowDates.join(', ')}`);
  console.log('recurring_winners:');
  for (const domain of recurringWinners) {
    console.log(
      `  - ${domain.canonicalDomain} | avg_delta +${formatPercent(domain.averageDeltaCitationRate)} | avg_ungrounded ${formatPercent(domain.averageUngroundedCitationRate)} | avg_grounded ${formatPercent(domain.averageGroundedCitationRate)} | paired_windows ${domain.pairedWindowCount}/${summary.windowCount} | exact_page_non_zero_windows ${domain.nonZeroExactPageWindowCount}`
    );
  }
  console.log('recurring_laggards:');
  for (const domain of recurringLaggards) {
    console.log(
      `  - ${domain.canonicalDomain} | avg_delta ${formatPercent(domain.averageDeltaCitationRate)} | avg_ungrounded ${formatPercent(domain.averageUngroundedCitationRate)} | avg_grounded ${formatPercent(domain.averageGroundedCitationRate)} | paired_windows ${domain.pairedWindowCount}/${summary.windowCount} | exact_page_non_zero_windows ${domain.nonZeroExactPageWindowCount}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
