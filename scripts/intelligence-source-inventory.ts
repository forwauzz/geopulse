import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  INTELLIGENCE_SOURCE_REGISTRY,
  postgresIntelligenceSources,
  validateIntelligenceSourceRegistry,
  type IntelligenceSourceDefinition,
  type PostgresIntelligenceSource,
} from '../lib/intelligence/source-registry';

type InventoryRow = {
  sourceId: string;
  count: number | null;
  earliest: string | null;
  latest: string | null;
  statusDistributions: Record<string, Record<string, number>>;
  nullIdentityCounts: Record<string, number | null>;
  staleRunningCount: number | null;
  failedCount: number | null;
  error: string | null;
};

type InventoryClient =
  | ReturnType<typeof createServiceRoleClient>
  | ReturnType<ReturnType<typeof createServiceRoleClient>['schema']>;

const STATUS_PAGE_SIZE = 1_000;
const STALE_RUNNING_HOURS = 6;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function primaryTimestamp(source: IntelligenceSourceDefinition): string | null {
  return source.timestampFields.find((field) => !field.includes('.')) ?? null;
}

function simpleFields(fields: readonly string[]): string[] {
  return [...new Set(fields.filter((field) => !field.includes('.')))];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record['message'];
    const code = record['code'];
    if (typeof message === 'string') {
      return typeof code === 'string' ? `${code}: ${message}` : message;
    }
  }
  return String(error);
}

async function readStatusDistributions(
  client: InventoryClient,
  source: PostgresIntelligenceSource
): Promise<Record<string, Record<string, number>>> {
  const fields = simpleFields(source.statusFields).filter(
    (field) => !field.includes('error') && !field.includes('message')
  );
  if (fields.length === 0) return {};

  const distributions = Object.fromEntries(
    fields.map((field) => [field, {} as Record<string, number>])
  );
  for (let offset = 0; ; offset += STATUS_PAGE_SIZE) {
    const result = await client
      .from(source.table)
      .select(fields.join(','))
      .range(offset, offset + STATUS_PAGE_SIZE - 1);
    if (result.error) throw result.error;

    const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      for (const field of fields) {
        const value = row[field];
        const key = value === null || value === undefined ? '<null>' : String(value);
        distributions[field]![key] = (distributions[field]![key] ?? 0) + 1;
      }
    }
    if (rows.length < STATUS_PAGE_SIZE) break;
  }
  return distributions;
}

async function readNullIdentityCounts(
  client: InventoryClient,
  source: PostgresIntelligenceSource
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  for (const field of simpleFields(source.identityFields)) {
    const countResult = await client
      .from(source.table)
      .select('*', { count: 'exact', head: true })
      .is(field, null);
    result[field] = countResult.error ? null : countResult.count;
  }
  return result;
}

async function readLifecycleCounts(
  client: InventoryClient,
  source: PostgresIntelligenceSource,
  timestamp: string | null
): Promise<{ staleRunningCount: number | null; failedCount: number | null }> {
  if (!simpleFields(source.statusFields).includes('status')) {
    return { staleRunningCount: null, failedCount: null };
  }

  const failedResult = await client
    .from(source.table)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed');

  let staleRunningCount: number | null = null;
  if (timestamp) {
    const staleBefore = new Date(
      Date.now() - STALE_RUNNING_HOURS * 60 * 60 * 1_000
    ).toISOString();
    const staleResult = await client
      .from(source.table)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running')
      .lt(timestamp, staleBefore);
    staleRunningCount = staleResult.error ? null : staleResult.count;
  }

  return {
    staleRunningCount,
    failedCount: failedResult.error ? null : failedResult.count,
  };
}

async function inventoryPostgresSource(
  supabase: ReturnType<typeof createServiceRoleClient>,
  source: PostgresIntelligenceSource
): Promise<InventoryRow> {
  const client = source.schema === 'analytics' ? supabase.schema('analytics') : supabase;
  const timestamp = primaryTimestamp(source);
  try {
    const countResult = await client
      .from(source.table)
      .select('*', { count: 'exact', head: true });
    if (countResult.error) throw countResult.error;

    let earliest: string | null = null;
    let latest: string | null = null;
    if (timestamp) {
      const [firstResult, lastResult] = await Promise.all([
        client.from(source.table).select(timestamp).not(timestamp, 'is', null).order(timestamp, { ascending: true }).limit(1).maybeSingle(),
        client.from(source.table).select(timestamp).not(timestamp, 'is', null).order(timestamp, { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (firstResult.error) throw firstResult.error;
      if (lastResult.error) throw lastResult.error;
      earliest = String((firstResult.data as Record<string, unknown> | null)?.[timestamp] ?? '') || null;
      latest = String((lastResult.data as Record<string, unknown> | null)?.[timestamp] ?? '') || null;
    }

    const [statusDistributions, nullIdentityCounts, lifecycle] = await Promise.all([
      readStatusDistributions(client, source),
      readNullIdentityCounts(client, source),
      readLifecycleCounts(client, source, timestamp),
    ]);

    return {
      sourceId: source.id,
      count: countResult.count,
      earliest,
      latest,
      statusDistributions,
      nullIdentityCounts,
      staleRunningCount: lifecycle.staleRunningCount,
      failedCount: lifecycle.failedCount,
      error: null,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      count: null,
      earliest: null,
      latest: null,
      statusDistributions: {},
      nullIdentityCounts: {},
      staleRunningCount: null,
      failedCount: null,
      error: errorMessage(error),
    };
  }
}

async function main(): Promise<void> {
  const validationErrors = validateIntelligenceSourceRegistry();
  if (validationErrors.length > 0) {
    throw new Error(`Invalid intelligence source registry:\n${validationErrors.join('\n')}`);
  }

  if (hasFlag('--catalog')) {
    console.log(JSON.stringify(INTELLIGENCE_SOURCE_REGISTRY, null, 2));
    return;
  }

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Use --catalog for an offline registry dump.'
    );
  }

  const supabase = createServiceRoleClient(url, key);
  const rows: InventoryRow[] = [];
  for (const source of postgresIntelligenceSources()) {
    rows.push(await inventoryPostgresSource(supabase, source));
  }

  const result = {
    generatedAt: new Date().toISOString(),
    registryVersion: 1,
    staleRunningHours: STALE_RUNNING_HOURS,
    sourceCount: INTELLIGENCE_SOURCE_REGISTRY.length,
    postgresSourceCount: rows.length,
    rows,
  };

  if (hasFlag('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`GEO Intelligence source inventory (${result.generatedAt})`);
  console.log(`Registered sources: ${String(result.sourceCount)} (${String(result.postgresSourceCount)} Postgres)`);
  for (const row of rows) {
    if (row.error) {
      console.log(`- ${row.sourceId}: unavailable (${row.error})`);
    } else {
      console.log(
        `- ${row.sourceId}: ${String(row.count ?? 0)} rows | ${row.earliest ?? 'n/a'} -> ${row.latest ?? 'n/a'}`
      );
      if (Object.keys(row.statusDistributions).length > 0) {
        console.log(`  statuses: ${JSON.stringify(row.statusDistributions)}`);
      }
      if (Object.keys(row.nullIdentityCounts).length > 0) {
        console.log(`  null identities: ${JSON.stringify(row.nullIdentityCounts)}`);
      }
      if (row.staleRunningCount !== null || row.failedCount !== null) {
        console.log(
          `  lifecycle: stale_running_${String(STALE_RUNNING_HOURS)}h=${String(row.staleRunningCount ?? 'n/a')}, failed=${String(row.failedCount ?? 'n/a')}`
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
