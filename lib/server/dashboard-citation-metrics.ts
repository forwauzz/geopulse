/**
 * Joins a user's audited domain to the benchmark citation system.
 *
 * The benchmark tables are populated by scheduled sweeps over admin-curated domains — most
 * self-serve domains have no rows, and that absence is a real answer ("not tracked yet"), never a
 * reason to synthesize a number. When rows exist, the dashboard shows the newest citation rate per
 * engine, preferring ungrounded runs (does the model know the site cold?) because that is the
 * closest proxy for real-world visibility.
 */

export type EngineKey = 'chatgpt' | 'perplexity' | 'claude' | 'gemini';

export type EngineCitationMetric = {
  readonly engine: EngineKey;
  readonly modelId: string;
  /** 0..1 as stored in benchmark_domain_metrics. */
  readonly citationRate: number;
  readonly runMode: string | null;
  readonly computedAt: string | null;
};

type SupabaseLike = {
  from(table: string): any;
};

export function engineForModelId(modelId: string): EngineKey | null {
  const id = modelId.trim().toLowerCase();
  if (!id) return null;
  if (id.startsWith('gemini')) return 'gemini';
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('chatgpt')) return 'chatgpt';
  if (id.includes('sonar')) return 'perplexity';
  if (id.startsWith('claude')) return 'claude';
  return null;
}

export function canonicalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^www\./, '');
}

function runModeOf(row: { metrics?: unknown }): string | null {
  const metrics = row.metrics;
  if (!metrics || typeof metrics !== 'object') return null;
  const mode = (metrics as Record<string, unknown>)['run_mode'];
  return typeof mode === 'string' ? mode : null;
}

/**
 * Newest citation metric per engine for `domain`, or {} when the domain is not benchmarked.
 * Fail-soft: any query problem reads as "not tracked", never as a dashboard error.
 *
 * Mode preference: blind_discovery > ungrounded_inference > grounded_site. Blind is the only mode
 * whose prompt never names the target, so it is the number that survives a user re-asking the
 * question in the engine themselves; the others are progressively more assisted.
 */
export async function loadEngineCitationMetrics(args: {
  readonly supabase: SupabaseLike;
  readonly domain: string;
}): Promise<Partial<Record<EngineKey, EngineCitationMetric>>> {
  const canonical = canonicalizeDomain(args.domain);
  if (!canonical) return {};

  try {
    const { data: domainRow, error: domainError } = await args.supabase
      .from('benchmark_domains')
      .select('id')
      .eq('canonical_domain', canonical)
      .maybeSingle();
    if (domainError || !domainRow?.id) return {};

    const { data: metricRows, error: metricsError } = await args.supabase
      .from('benchmark_domain_metrics')
      .select('model_id, citation_rate, metrics, computed_at')
      .eq('domain_id', domainRow.id)
      .order('computed_at', { ascending: false })
      .limit(60);
    if (metricsError || !Array.isArray(metricRows)) return {};

    const MODE_RANK: Record<string, number> = {
      blind_discovery: 3,
      ungrounded_inference: 2,
      grounded_site: 1,
    };

    const out: Partial<Record<EngineKey, EngineCitationMetric>> = {};
    const rankByEngine = new Map<EngineKey, number>();
    // Rows arrive newest-first; per engine, a higher-ranked mode always replaces a lower-ranked
    // one, and within the same mode the first (newest) row wins.
    for (const row of metricRows as Array<{
      model_id?: string;
      citation_rate?: number | null;
      metrics?: unknown;
      computed_at?: string | null;
    }>) {
      const modelId = typeof row.model_id === 'string' ? row.model_id : '';
      const engine = engineForModelId(modelId);
      if (!engine) continue;
      if (typeof row.citation_rate !== 'number') continue;
      const runMode = runModeOf(row);
      const rank = MODE_RANK[runMode ?? ''] ?? 0;
      if (rank <= (rankByEngine.get(engine) ?? -1)) continue;

      rankByEngine.set(engine, rank);
      out[engine] = {
        engine,
        modelId,
        citationRate: row.citation_rate,
        runMode,
        computedAt: row.computed_at ?? null,
      };
    }
    return out;
  } catch {
    return {};
  }
}
