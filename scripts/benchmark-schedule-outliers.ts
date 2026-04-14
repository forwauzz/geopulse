import { createBenchmarkAdminData } from '../lib/server/benchmark-admin-data';
import { parseBenchmarkScheduleConfig, toBenchmarkScheduleWindowDate } from '../lib/server/benchmark-schedule';
import {
  buildBenchmarkScheduleWindowSummary,
  selectBenchmarkScheduleWindowOutliers,
} from '../lib/server/benchmark-schedule-window-summary';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function parseArgs(argv: string[]): { windowDate: string | null } {
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
    windowDate: values.get('window-date') ?? null,
  };
}

function formatPercent(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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

  const windowDate = args.windowDate ?? toBenchmarkScheduleWindowDate(new Date(), config.windowHours);
  const supabase = createServiceRoleClient(url, key);
  const adminData = createBenchmarkAdminData(supabase as any);
  const runs = await adminData.getRunGroups({
    querySetId: config.querySetId,
    modelId: config.modelId,
  });
  const summary = buildBenchmarkScheduleWindowSummary({
    runs,
    querySetId: config.querySetId,
    modelId: config.modelId,
    scheduleVersion: config.scheduleVersion,
    windowDate,
  });
  const outliers = selectBenchmarkScheduleWindowOutliers(summary, 5);

  console.log('benchmark schedule outliers:');
  console.log(`  window_date: ${summary.windowDate}`);
  console.log(`  schedule_version: ${summary.scheduleVersion}`);
  console.log(`  paired_domain_count: ${summary.pairedDomainCount}`);
  console.log('winners:');
  for (const winner of outliers.winners) {
    console.log(
      `  - ${winner.canonicalDomain} | delta +${formatPercent(winner.deltaCitationRate)} | ungrounded ${formatPercent(winner.ungroundedCitationRate)} | grounded ${formatPercent(winner.groundedCitationRate)} | exact-page ${formatPercent(winner.groundedExactPageQualityRate)} | grounded_run ${winner.groundedRunGroupId ?? '-'}`
    );
  }
  console.log('losers:');
  for (const loser of outliers.losers) {
    const delta = `${Math.round(loser.deltaCitationRate * 100)}%`;
    console.log(
      `  - ${loser.canonicalDomain} | delta ${delta} | ungrounded ${formatPercent(loser.ungroundedCitationRate)} | grounded ${formatPercent(loser.groundedCitationRate)} | exact-page ${formatPercent(loser.groundedExactPageQualityRate)} | grounded_run ${loser.groundedRunGroupId ?? '-'}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
