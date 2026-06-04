/**
 * Diagnostic: inspect the most recent failed query_runs.
 *
 * Prints the error_message, model_id, status, and metadata for the last N
 * failed runs so we can see why the benchmark lane is failing.
 */

import { createServiceRoleClient } from '../lib/supabase/service-role';

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createServiceRoleClient(url, key);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('query_runs')
    .select('id,domain_id,query_id,model_id,status,error_message,response_metadata,executed_at,created_at')
    .eq('status', 'failed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Supabase error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No failed runs in the last 24h.');
    return;
  }

  console.log(`Last ${data.length} failed runs (most recent first):\n`);

  // Group by error_message to find patterns fast.
  const grouped = new Map<string, typeof data>();
  for (const row of data) {
    const key = (row.error_message ?? '<no error message>').slice(0, 200);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  for (const [errMsg, rows] of grouped.entries()) {
    console.log(`── ${rows.length} run(s) failed with:`);
    console.log(`   ${errMsg}`);
    console.log(`   models: ${[...new Set(rows.map((r) => r.model_id))].join(', ')}`);
    console.log(`   most recent: ${rows[0]?.created_at}`);
    const sampleMeta = rows[0]?.response_metadata;
    if (sampleMeta && Object.keys(sampleMeta).length > 0) {
      console.log(`   sample metadata: ${JSON.stringify(sampleMeta).slice(0, 300)}`);
    }
    console.log('');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
