type Db = { from(table: string): any; rpc?(name: string, args: Record<string, unknown>): any };

export type ProviderSpendRow = {
  readonly provider: string;
  readonly spentUsd: number;
  readonly capUsd: number;
  readonly remainingUsd: number;
  readonly percentUsed: number;
  readonly status: 'healthy' | 'attention' | 'blocked';
};

export async function reserveProviderSpend(args: {
  readonly db: Db;
  readonly provider: 'gemini' | 'perplexity' | 'openai' | 'dataforseo' | 'cloudflare' | 'email';
  readonly idempotencyKey: string;
  readonly operation: string;
  readonly estimatedCostUsd: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<boolean> {
  if (!args.db.rpc || args.estimatedCostUsd < 0) return false;
  const { data, error } = await args.db.rpc('reserve_provider_spend', {
    requested_provider: args.provider,
    requested_idempotency_key: args.idempotencyKey,
    requested_operation: args.operation,
    requested_estimated_cost_usd: args.estimatedCostUsd,
    requested_metadata: args.metadata ?? {},
  });
  return !error && data === true;
}

export function summarizeProviderSpend(
  caps: readonly { provider: string; monthly_cap_usd: number | string; enabled: boolean }[],
  reservations: readonly {
    provider: string;
    estimated_cost_usd: number | string;
    actual_cost_usd: number | string | null;
    status: string;
  }[],
): ProviderSpendRow[] {
  const spend = new Map<string, number>();
  for (const row of reservations) {
    if (row.status === 'released') continue;
    const value = Number(row.actual_cost_usd ?? row.estimated_cost_usd);
    spend.set(row.provider, (spend.get(row.provider) ?? 0) + (Number.isFinite(value) ? value : 0));
  }
  return caps.map((row) => {
    const capUsd = Number(row.monthly_cap_usd) || 0;
    const spentUsd = spend.get(row.provider) ?? 0;
    const percentUsed = capUsd > 0 ? Math.min(100, Math.round((spentUsd / capUsd) * 100)) : 100;
    return {
      provider: row.provider,
      spentUsd,
      capUsd,
      remainingUsd: Math.max(0, capUsd - spentUsd),
      percentUsed,
      status: !row.enabled || spentUsd >= capUsd
        ? 'blocked'
        : percentUsed >= 80
          ? 'attention'
          : 'healthy',
    };
  });
}

export async function loadProviderSpendSummary(
  db: Db,
  now = new Date(),
): Promise<ProviderSpendRow[]> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  try {
    const [{ data: caps, error: capError }, { data: reservations, error: reservationError }] = await Promise.all([
      db.from('provider_spend_caps').select('provider,monthly_cap_usd,enabled').order('provider'),
      db.from('provider_spend_reservations')
        .select('provider,estimated_cost_usd,actual_cost_usd,status')
        .gte('created_at', monthStart),
    ]);
    if (capError || reservationError) return [];
    return summarizeProviderSpend(caps ?? [], reservations ?? []);
  } catch {
    return [];
  }
}
