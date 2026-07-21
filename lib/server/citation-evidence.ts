/**
 * The receipts behind a citation rate. For each engine's most meaningful recent run, this returns
 * the actual questions asked, whether the domain was named in each answer, the sentence where it
 * was named, and who got named instead when it wasn't — so a user never has to take a percentage
 * on faith.
 */
import { canonicalizeDomain, engineForModelId, type EngineKey } from './dashboard-citation-metrics';

type SupabaseLike = { from(table: string): any };

export type CitationEvidenceRow = {
  readonly queryText: string;
  readonly cited: boolean;
  /** The sentence of the answer that names the domain (cited rows). */
  readonly excerpt: string | null;
  /** Competitor domains the answer named instead (uncited rows). */
  readonly namedInstead: readonly string[];
};

export type EngineEvidence = {
  readonly engine: EngineKey;
  readonly modelId: string;
  readonly runMode: string | null;
  readonly executedAt: string | null;
  readonly citedCount: number;
  readonly totalCount: number;
  readonly rows: readonly CitationEvidenceRow[];
};

/** Same preference as the tiles: the honest blind number first, assisted modes as fallback. */
const MODE_RANK: Record<string, number> = {
  blind_discovery: 3,
  ungrounded_inference: 2,
  grounded_site: 1,
};

export function runModeLabel(runMode: string | null): string {
  if (runMode === 'blind_discovery') return 'asked cold — your name never appeared in the question';
  if (runMode === 'ungrounded_inference') return 'brand-aware — the model was told which site is being measured';
  if (runMode === 'grounded_site') return 'site-assisted — the model was given your pages to read';
  return 'measurement run';
}

/** The sentence (or clause) of `text` containing `needle`, trimmed for display. */
export function extractMentionSentence(text: string, needle: string): string | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx === -1) return null;
  const boundary = /[.!?\n]/;
  let start = idx;
  while (start > 0 && !boundary.test(text[start - 1]!)) start -= 1;
  let end = idx + needle.length;
  while (end < text.length && !boundary.test(text[end]!)) end += 1;
  const sentence = text.slice(start, Math.min(end + 1, text.length)).trim();
  return sentence.length > 260 ? `${sentence.slice(0, 257)}…` : sentence;
}

export async function getCitationEvidence(args: {
  readonly supabase: SupabaseLike;
  readonly domain: string;
  readonly maxRowsPerEngine?: number;
}): Promise<EngineEvidence[]> {
  const canonical = canonicalizeDomain(args.domain);
  if (!canonical) return [];

  try {
    const { data: domainRow } = await args.supabase
      .from('benchmark_domains')
      .select('id')
      .eq('canonical_domain', canonical)
      .maybeSingle();
    if (!domainRow?.id) return [];

    const { data: groups } = await args.supabase
      .from('benchmark_run_groups')
      .select('id, model_set_version, metadata, started_at')
      .eq('metadata->>domain_id', domainRow.id)
      .order('started_at', { ascending: false })
      .limit(40);

    const chosen = new Map<EngineKey, { id: string; modelId: string; runMode: string | null; startedAt: string | null; rank: number }>();
    for (const g of (groups ?? []) as Array<{
      id: string;
      model_set_version?: string;
      metadata?: Record<string, unknown>;
      started_at?: string;
    }>) {
      const engine = engineForModelId(g.model_set_version ?? '');
      if (!engine) continue;
      const runMode = typeof g.metadata?.['run_mode'] === 'string' ? (g.metadata['run_mode'] as string) : null;
      const rank = MODE_RANK[runMode ?? ''] ?? 0;
      const existing = chosen.get(engine);
      if (existing && rank <= existing.rank) continue;
      chosen.set(engine, {
        id: g.id,
        modelId: g.model_set_version ?? '',
        runMode,
        startedAt: g.started_at ?? null,
        rank,
      });
    }

    const out: EngineEvidence[] = [];
    for (const [engine, group] of chosen) {
      const { data: runs } = await args.supabase
        .from('query_runs')
        .select('id, query_id, status, response_text')
        .eq('run_group_id', group.id);
      const completed = ((runs ?? []) as Array<{
        id: string;
        query_id: string;
        status: string;
        response_text: string | null;
      }>).filter((r) => r.status === 'completed');
      if (completed.length === 0) continue;

      const runIds = completed.map((r) => r.id);
      const [{ data: queries }, { data: citations }] = await Promise.all([
        args.supabase
          .from('benchmark_queries')
          .select('id, query_text')
          .in('id', completed.map((r) => r.query_id)),
        args.supabase
          .from('query_citations')
          .select('query_run_id, cited_domain')
          .in('query_run_id', runIds),
      ]);

      const textByQueryId = new Map(
        ((queries ?? []) as Array<{ id: string; query_text: string }>).map((q) => [q.id, q.query_text])
      );
      const citationsByRun = new Map<string, string[]>();
      for (const c of (citations ?? []) as Array<{ query_run_id: string; cited_domain: string | null }>) {
        if (!c.cited_domain) continue;
        const list = citationsByRun.get(c.query_run_id) ?? [];
        list.push(c.cited_domain);
        citationsByRun.set(c.query_run_id, list);
      }

      const rows: CitationEvidenceRow[] = completed
        .map((run) => {
          const cited = (citationsByRun.get(run.id) ?? []).includes(canonical);
          const namedInstead = cited
            ? []
            : [...new Set((citationsByRun.get(run.id) ?? []).filter((d) => d !== canonical))].slice(0, 4);
          return {
            queryText: textByQueryId.get(run.query_id) ?? 'Question',
            cited,
            excerpt: cited && run.response_text ? extractMentionSentence(run.response_text, canonical) : null,
            namedInstead,
          };
        })
        // Uncited first — the losses are what the user needs to act on.
        .sort((a, b) => Number(a.cited) - Number(b.cited))
        .slice(0, args.maxRowsPerEngine ?? 12);

      out.push({
        engine,
        modelId: group.modelId,
        runMode: group.runMode,
        executedAt: group.startedAt,
        citedCount: completed.filter((run) => (citationsByRun.get(run.id) ?? []).includes(canonical)).length,
        totalCount: completed.length,
        rows,
      });
    }

    return out.sort((a, b) => a.engine.localeCompare(b.engine));
  } catch {
    return [];
  }
}
