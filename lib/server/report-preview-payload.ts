/**
 * Read-only payload for the settings preview.
 *
 * The preview has to show what the client actually receives, which means real figures rather than
 * placeholder blocks. Everything here is a SELECT against already-stored rows — the last completed
 * scan and the last benchmark metrics. Nothing in this module runs a scan, calls a model, writes a
 * report row, uploads to R2, or sends mail. The preview must never cost anything or produce a
 * deliverable.
 */

export type PreviewCategory = {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly letterGrade: string | null;
  readonly earnedWeight: number | null;
  readonly totalWeight: number | null;
};

export type PreviewEngine = {
  readonly key: string;
  readonly label: string;
  readonly visibilityPct: number;
  readonly measured: boolean;
};

export type ReportPreviewPayload = {
  readonly clientName: string;
  readonly domain: string;
  readonly topic: string | null;
  readonly location: string | null;
  readonly period: string;
  readonly trackedSince: string | null;
  readonly readinessScore: number | null;
  readonly categories: readonly PreviewCategory[];
  readonly issues: readonly string[];
  readonly questionsTracked: number;
  readonly questionsCited: number;
  readonly combinedVisibilityPct: number;
  readonly engines: readonly PreviewEngine[];
  readonly brandMentions: number;
  readonly siteCitations: number;
  readonly shareOfAnswersPct: number | null;
  readonly competitors: readonly { readonly domain: string; readonly wins: number }[];
  readonly competitorSet: readonly string[];
  /** False when there is only one comparable period, which is the state for every client today. */
  readonly hasTrend: boolean;
  readonly hasAveragePosition: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI readiness',
  extractability: 'Extractability',
  trust: 'Trust',
};

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  google: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
  copilot: 'Copilot',
};

type SupabaseLike = {
  from(table: string): any;
};

function num(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readCategories(full: unknown): PreviewCategory[] {
  if (!full || typeof full !== 'object') return [];
  const raw = (full as Record<string, unknown>)['categoryScores'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const key = typeof row['category'] === 'string' ? row['category'] : null;
    const score = num(row['score']);
    if (!key || score === null) return [];
    return [
      {
        key,
        label: CATEGORY_LABELS[key] ?? key,
        score,
        letterGrade: typeof row['letterGrade'] === 'string' ? row['letterGrade'] : null,
        earnedWeight: num(row['earnedWeight']),
        totalWeight: num(row['totalWeight']),
      },
    ];
  });
}

function readIssues(full: unknown): string[] {
  if (!full || typeof full !== 'object') return [];
  const raw = (full as Record<string, unknown>)['highlightedIssues'];
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      const title = row['recommendation'] ?? row['description'] ?? row['title'];
      return typeof title === 'string' && title.trim() ? [title.trim()] : [];
    })
    .slice(0, 4);
}

/**
 * Load the most recent stored state for one agency client. Returns null when the client has never
 * been measured, which the caller renders as an explicit "nothing measured yet" preview rather
 * than inventing numbers.
 */
export async function loadReportPreviewPayload(args: {
  readonly supabase: SupabaseLike;
  readonly agencyClientId: string;
}): Promise<ReportPreviewPayload | null> {
  const { data: client } = await args.supabase
    .from('agency_clients')
    .select('id, name, canonical_domain, agency_account_id')
    .eq('id', args.agencyClientId)
    .maybeSingle();
  if (!client?.canonical_domain) return null;

  const domain: string = client.canonical_domain;

  const { data: scans } = await args.supabase
    .from('scans')
    .select('score, full_results_json, created_at')
    .ilike('url', `%${domain}%`)
    .order('created_at', { ascending: false })
    .limit(2);

  const latestScan = Array.isArray(scans) && scans.length > 0 ? scans[0] : null;
  const categories = readCategories(latestScan?.full_results_json);

  // Resolve the config by THIS client's domain. Matching on agency_account_id alone returns
  // whichever config happens to be first, so a client's preview could show another client's
  // topic, competitors and metrics.
  const { data: benchmarkDomain } = await args.supabase
    .from('benchmark_domains')
    .select('id')
    .eq('domain', domain)
    .maybeSingle();

  const { data: config } = benchmarkDomain?.id
    ? await args.supabase
        .from('client_benchmark_configs')
        .select('topic, location, competitor_list, created_at, benchmark_domain_id')
        .eq('agency_account_id', client.agency_account_id)
        .eq('benchmark_domain_id', benchmarkDomain.id)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const competitorSet: string[] = Array.isArray(config?.competitor_list)
    ? (config!.competitor_list as string[])
    : [];

  const engines: PreviewEngine[] = [];
  let questionsTracked = 0;
  let brandMentions = 0;
  let siteCitations = 0;
  let shareOfAnswersPct: number | null = null;

  if (config?.benchmark_domain_id) {
    const { data: metrics } = await args.supabase
      .from('benchmark_domain_metrics')
      .select('model_id, share_of_voice, metrics, computed_at')
      .eq('domain_id', config.benchmark_domain_id)
      .order('computed_at', { ascending: false })
      .limit(6);

    const rows = Array.isArray(metrics) ? metrics : [];
    for (const key of ['chatgpt', 'google', 'perplexity'] as const) {
      const field =
        key === 'chatgpt'
          ? 'chatgpt_visibility_pct'
          : key === 'google'
            ? 'gemini_visibility_pct'
            : 'perplexity_visibility_pct';
      const hit = rows.find((row: any) => num(row?.metrics?.[field]) !== null);
      const pct = hit ? (num(hit.metrics?.[field]) ?? 0) : 0;
      engines.push({
        key,
        label: ENGINE_LABELS[key]!,
        visibilityPct: Math.round(pct * 100),
        measured: Boolean(hit),
      });
    }

    const first = rows[0];
    questionsTracked = num(first?.metrics?.['total_queries']) ?? 0;
    brandMentions = num(first?.metrics?.['brand_mention_citation_count']) ?? 0;
    siteCitations = num(first?.metrics?.['explicit_url_citation_count']) ?? 0;
    const sov = rows.map((r: any) => num(r?.share_of_voice) ?? 0).find((v: number) => v > 0);
    shareOfAnswersPct = sov ? Math.round(sov * 1000) / 10 : null;
  }

  const combined = engines.length
    ? Math.round(engines.reduce((sum, e) => sum + e.visibilityPct, 0) / engines.length)
    : 0;

  return {
    clientName: client.name ?? domain,
    domain,
    topic: config?.topic ?? null,
    location: config?.location ?? null,
    period: new Date(latestScan?.created_at ?? Date.now()).toLocaleDateString('en-CA', {
      month: 'long',
      year: 'numeric',
    }),
    trackedSince: config?.created_at
      ? new Date(config.created_at).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })
      : null,
    readinessScore: num(latestScan?.score),
    categories,
    issues: readIssues(latestScan?.full_results_json),
    questionsTracked,
    questionsCited: 0,
    combinedVisibilityPct: combined,
    engines,
    brandMentions,
    siteCitations,
    shareOfAnswersPct,
    competitors: [],
    competitorSet,
    // One comparable period today for every Lifter client; the trend section renders as pending.
    hasTrend: Array.isArray(scans) && scans.length > 1,
    hasAveragePosition: siteCitations > 0,
  };
}
