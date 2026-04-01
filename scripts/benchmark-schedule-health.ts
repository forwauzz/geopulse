import { createBenchmarkAdminData } from '../lib/server/benchmark-admin-data';
import {
  buildBenchmarkScheduleHealthSummary,
  buildRecentBenchmarkWindowDates,
} from '../lib/server/benchmark-schedule-health';
import {
  parseBenchmarkScheduleConfig,
  toBenchmarkScheduleWindowDate,
} from '../lib/server/benchmark-schedule';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function parseArgs(argv: string[]): { latestWindowDate: string | null; count: number } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(token.slice(2), value);
    index += 1;
  }

  const rawCount = Number.parseInt(values.get('count') ?? '4', 10);
  return {
    latestWindowDate: values.get('latest-window-date') ?? null,
    count: Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 4,
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

  const config = parseBenchmarkScheduleConfig(process.env as Record<string, string | undefined>);
  if (!config) {
    console.error('Benchmark schedule config is not enabled or is incomplete.');
    process.exit(1);
  }

  const latestWindowDate =
    args.latestWindowDate ??
    toBenchmarkScheduleWindowDate(new Date(), config.windowHours);
  const windowDates = buildRecentBenchmarkWindowDates({
    latestWindowDate,
    windowHours: config.windowHours,
    count: args.count,
  });

  const supabase = createServiceRoleClient(url, key);
  const adminData = createBenchmarkAdminData(supabase as any);
  const runs = await adminData.getRunGroups({
    querySetId: config.querySetId,
    modelId: config.modelId,
  });
  const summary = buildBenchmarkScheduleHealthSummary({
    runs,
    querySetId: config.querySetId,
    modelId: config.modelId,
    scheduleVersion: config.scheduleVersion,
    windowHours: config.windowHours,
    windowDates,
  });

  console.log('benchmark schedule health:');
  console.log(`  schedule_version: ${summary.scheduleVersion}`);
  console.log(`  query_set_id: ${summary.querySetId}`);
  console.log(`  model_id: ${summary.modelId}`);
  console.log(`  window_hours: ${summary.windowHours}`);
  console.log(`  latest_window_date: ${latestWindowDate}`);
  console.log(`  checked_windows: ${summary.windowDates.join(', ')}`);
  console.log('windows:');
  for (const window of summary.windows) {
    console.log(
      `  - ${window.windowDate} | runs ${window.runCount} | paired_domains ${window.pairedDomainCount}/${window.domainCount} | triggers ${window.triggerSources.join(',') || '-'} | statuses ${window.statuses.join(',') || '-'} | latest_created_at ${window.latestCreatedAt ?? '-'} | missing ${window.missing ? 'yes' : 'no'}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
