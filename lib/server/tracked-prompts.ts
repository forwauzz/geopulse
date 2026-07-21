/**
 * User-visible prompt tracking: which buyer questions we ask the AI engines about a domain, and
 * whether the domain got cited in each engine's latest BLIND answer.
 *
 * Blind runs only — they are the only mode whose prompt never names the target, so a ✓ here means
 * the engine surfaced the site unaided. Users can add their own prompts; those land in a per-domain
 * query set (`user-prompts-<domain>`) that the nightly sweep picks up, so a new prompt shows as
 * "queued" until its first run.
 */
import { canonicalizeDomain, engineForModelId, type EngineKey } from './dashboard-citation-metrics';

type SupabaseLike = { from(table: string): any };

export type TrackedPromptRow = {
  readonly queryText: string;
  readonly source: 'core' | 'yours';
  /** Per engine: true = cited in the latest blind answer, false = not cited, null = no run yet. */
  readonly engines: Partial<Record<EngineKey, boolean | null>>;
};

export type TrackedPromptPanel = {
  readonly tracked: boolean;
  readonly domainId: string | null;
  readonly engineOrder: readonly EngineKey[];
  readonly prompts: readonly TrackedPromptRow[];
  readonly customPromptCount: number;
};

export const MAX_CUSTOM_PROMPTS = 10;

export function userPromptSetName(domain: string): string {
  return `user-prompts-${canonicalizeDomain(domain)}`;
}

function slugifyPromptKey(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'prompt';
}

export async function getTrackedPromptPanel(args: {
  readonly supabase: SupabaseLike;
  readonly domain: string;
}): Promise<TrackedPromptPanel> {
  const empty: TrackedPromptPanel = {
    tracked: false,
    domainId: null,
    engineOrder: ['chatgpt', 'gemini'],
    prompts: [],
    customPromptCount: 0,
  };
  const canonical = canonicalizeDomain(args.domain);
  if (!canonical) return empty;

  try {
    const { data: domainRow } = await args.supabase
      .from('benchmark_domains')
      .select('id')
      .eq('canonical_domain', canonical)
      .maybeSingle();
    if (!domainRow?.id) return empty;

    // Latest blind run group per model for this domain.
    const { data: groups } = await args.supabase
      .from('benchmark_run_groups')
      .select('id, model_set_version, metadata, started_at')
      .eq('metadata->>domain_id', domainRow.id)
      .eq('metadata->>run_mode', 'blind_discovery')
      .order('started_at', { ascending: false })
      .limit(24);

    const latestGroupByEngine = new Map<EngineKey, { id: string }>();
    for (const g of (groups ?? []) as Array<{ id: string; model_set_version?: string }>) {
      const engine = engineForModelId(g.model_set_version ?? '');
      if (!engine || latestGroupByEngine.has(engine)) continue;
      latestGroupByEngine.set(engine, { id: g.id });
    }

    // Per engine: which query ids got a measured-domain citation in that latest blind run.
    const citedByEngine = new Map<EngineKey, Set<string>>();
    const ranByEngine = new Map<EngineKey, Set<string>>();
    for (const [engine, group] of latestGroupByEngine) {
      const { data: runs } = await args.supabase
        .from('query_runs')
        .select('id, query_id, status')
        .eq('run_group_id', group.id);
      const runRows = (runs ?? []) as Array<{ id: string; query_id: string; status: string }>;
      const completed = runRows.filter((r) => r.status === 'completed');
      ranByEngine.set(engine, new Set(completed.map((r) => r.query_id)));

      const runIds = completed.map((r) => r.id);
      if (runIds.length === 0) {
        citedByEngine.set(engine, new Set());
        continue;
      }
      const { data: citations } = await args.supabase
        .from('query_citations')
        .select('query_run_id, cited_domain')
        .in('query_run_id', runIds)
        .eq('cited_domain', canonical);
      const citedRunIds = new Set(
        ((citations ?? []) as Array<{ query_run_id: string }>).map((c) => c.query_run_id)
      );
      citedByEngine.set(
        engine,
        new Set(completed.filter((r) => citedRunIds.has(r.id)).map((r) => r.query_id))
      );
    }

    // The prompt list: every query that has run for this domain, plus the user's custom set.
    const queryIds = new Set<string>();
    for (const ran of ranByEngine.values()) for (const id of ran) queryIds.add(id);

    const { data: customSet } = await args.supabase
      .from('benchmark_query_sets')
      .select('id')
      .eq('name', userPromptSetName(canonical))
      .maybeSingle();

    let customQueries: Array<{ id: string; query_text: string }> = [];
    if (customSet?.id) {
      const { data } = await args.supabase
        .from('benchmark_queries')
        .select('id, query_text')
        .eq('query_set_id', customSet.id)
        .order('created_at', { ascending: true });
      customQueries = (data ?? []) as Array<{ id: string; query_text: string }>;
      for (const q of customQueries) queryIds.add(q.id);
    }

    if (queryIds.size === 0) return { ...empty, tracked: true, domainId: domainRow.id };

    const { data: queryRows } = await args.supabase
      .from('benchmark_queries')
      .select('id, query_text, metadata, query_set_id')
      .in('id', [...queryIds]);

    const customIds = new Set(customQueries.map((q) => q.id));
    const engineOrder: EngineKey[] = ['chatgpt', 'gemini'];
    const prompts: TrackedPromptRow[] = ((queryRows ?? []) as Array<{
      id: string;
      query_text: string;
    }>).map((q) => {
      const engines: Partial<Record<EngineKey, boolean | null>> = {};
      for (const engine of engineOrder) {
        const ran = ranByEngine.get(engine)?.has(q.id) ?? false;
        engines[engine] = ran ? (citedByEngine.get(engine)?.has(q.id) ?? false) : null;
      }
      return {
        queryText: q.query_text,
        source: customIds.has(q.id) ? ('yours' as const) : ('core' as const),
        engines,
      };
    });

    // Yours first, then core, stable by text.
    prompts.sort((a, b) =>
      a.source === b.source ? a.queryText.localeCompare(b.queryText) : a.source === 'yours' ? -1 : 1
    );

    return {
      tracked: true,
      domainId: domainRow.id,
      engineOrder,
      prompts,
      customPromptCount: customQueries.length,
    };
  } catch {
    return empty;
  }
}

/** Add a user prompt for a tracked domain; creates the per-domain set on first use. */
export async function addTrackedPrompt(args: {
  readonly supabase: SupabaseLike;
  readonly domain: string;
  readonly queryText: string;
}): Promise<{ ok: true } | { ok: false; code: 'invalid' | 'not_tracked' | 'limit' | 'error' }> {
  const canonical = canonicalizeDomain(args.domain);
  const text = args.queryText.trim().replace(/\s+/g, ' ').slice(0, 240);
  if (!canonical || text.length < 12) return { ok: false, code: 'invalid' };

  try {
    const { data: domainRow } = await args.supabase
      .from('benchmark_domains')
      .select('id, vertical')
      .eq('canonical_domain', canonical)
      .maybeSingle();
    if (!domainRow?.id) return { ok: false, code: 'not_tracked' };

    const setName = userPromptSetName(canonical);
    const { data: existingSet } = await args.supabase
      .from('benchmark_query_sets')
      .select('id')
      .eq('name', setName)
      .maybeSingle();

    let setId: string | undefined = existingSet?.id;
    if (!setId) {
      const { data: created, error } = await args.supabase
        .from('benchmark_query_sets')
        .insert({
          name: setName,
          version: 'v1',
          vertical: domainRow.vertical ?? null,
          description: `User-added prompts tracked for ${canonical}.`,
          status: 'active',
          metadata: { user_managed: true, canonical_domain: canonical },
        })
        .select('id')
        .single();
      if (error || !created?.id) return { ok: false, code: 'error' };
      setId = created.id;
    }

    const { data: existing } = await args.supabase
      .from('benchmark_queries')
      .select('id, query_text')
      .eq('query_set_id', setId);
    const rows = (existing ?? []) as Array<{ query_text: string }>;
    if (rows.length >= MAX_CUSTOM_PROMPTS) return { ok: false, code: 'limit' };
    if (rows.some((r) => r.query_text.trim().toLowerCase() === text.toLowerCase())) {
      return { ok: true };
    }

    const { error: insertError } = await args.supabase.from('benchmark_queries').insert({
      query_set_id: setId,
      query_key: `${slugifyPromptKey(text)}-${rows.length + 1}`,
      query_text: text,
      intent_type: 'discovery',
      topic: 'user_added',
      weight: 1,
      metadata: { user_added: true },
    });
    if (insertError) return { ok: false, code: 'error' };
    return { ok: true };
  } catch {
    return { ok: false, code: 'error' };
  }
}
