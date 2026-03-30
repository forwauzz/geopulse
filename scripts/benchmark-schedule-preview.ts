import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  parseBenchmarkScheduleConfig,
  previewBenchmarkScheduleSweep,
} from '../lib/server/benchmark-schedule';
import { createBenchmarkRepository } from '../lib/server/benchmark-repository';

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

  const supabase = createServiceRoleClient(url, key);
  const preview = await previewBenchmarkScheduleSweep({
    repo: createBenchmarkRepository(supabase),
    config,
  });

  console.log('benchmark schedule preview:');
  console.log(`  query set: ${preview.querySetName} ${preview.querySetVersion}`);
  console.log(`  query_set_id: ${preview.querySetId}`);
  console.log(`  model_id: ${preview.modelId}`);
  console.log(`  run_modes: ${preview.runModes.join(',')}`);
  console.log(`  vertical: ${preview.vertical ?? 'all'}`);
  console.log(`  seed_priorities: ${preview.seedPriorities.join(',') || 'all'}`);
  console.log(`  window_date: ${preview.windowDate}`);
  console.log(`  window_hours: ${preview.windowHours}`);
  console.log(`  domain_limit: ${preview.domainLimit}`);
  console.log(`  selected_domains: ${preview.domains.length}`);
  console.log('domains:');
  for (const domain of preview.domains) {
    console.log(`  - ${domain.canonical_domain} (${domain.site_url ?? 'no-site-url'})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
