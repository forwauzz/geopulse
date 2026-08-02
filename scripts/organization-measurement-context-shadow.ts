import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  evaluateOrganizationMeasurementCompatibility,
  readOrganizationMeasurementBinding,
} from '../lib/intelligence/organization-measurement-context';

type Row = Record<string, unknown>;

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const client = createServiceRoleClient(url, key);
  const configId = argument('config-id');
  let configQuery = client
    .from('client_benchmark_configs')
    .select('id,startup_workspace_id,agency_account_id,query_set_id,competitor_list,metadata,updated_at')
    .order('updated_at', { ascending: false })
    .limit(configId ? 1 : 200);
  if (configId) configQuery = configQuery.eq('id', configId);
  const { data: configData, error: configError } = await configQuery;
  if (configError) throw configError;
  const configs = (configData ?? []) as Row[];
  const querySetIds = [...new Set(configs.flatMap((row) =>
    typeof row['query_set_id'] === 'string' ? [row['query_set_id']] : []
  ))];
  const { data: querySetData, error: querySetError } = querySetIds.length > 0
    ? await client.from('benchmark_query_sets')
        .select('id,version,metadata')
        .in('id', querySetIds)
    : { data: [], error: null };
  if (querySetError) throw querySetError;
  const querySets = new Map(((querySetData ?? []) as Row[]).map((row) => [String(row['id']), row]));

  const rows = configs.map((config) => {
    const binding = readOrganizationMeasurementBinding(config['metadata']);
    if (!binding) return { configId: String(config['id']), status: 'unbound', reasons: ['configuration_unbound'] };
    const querySetId = typeof config['query_set_id'] === 'string' ? config['query_set_id'] : null;
    const querySet = querySetId ? querySets.get(querySetId) : null;
    const compatibility = evaluateOrganizationMeasurementCompatibility({
      binding,
      configMetadata: object(config['metadata']),
      querySet: querySet ? { version: String(querySet['version']), metadata: querySet['metadata'] } : null,
      competitorList: Array.isArray(config['competitor_list'])
        ? config['competitor_list'].filter((value): value is string => typeof value === 'string')
        : [],
    });
    return {
      configId: String(config['id']),
      status: compatibility.compatible ? 'compatible' : 'blocked',
      contextVersion: binding.contextVersion,
      baselineRequired: compatibility.baselineRequired,
      reasons: compatibility.reasons,
    };
  });
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({
    ok: true,
    writeMode: false,
    providerCalls: false,
    configCount: rows.length,
    counts,
    rows,
  }, null, 2));
}

void main();
