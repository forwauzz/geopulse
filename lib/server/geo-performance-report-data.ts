import type { SupabaseClient } from '@supabase/supabase-js';
import { createBenchmarkRepository } from './benchmark-repository';
import type { GpmReportPayload, GpmPromptRow, GpmCompetitorRow } from './geo-performance-report-payload';

export async function buildGpmReportPayload(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly runGroupId: string;
  readonly configId: string;
  readonly domain: string;
  readonly topic: string;
  readonly location: string;
  readonly windowDate: string;
  readonly platform: string;
  readonly measuredCanonicalDomain: string;
}): Promise<GpmReportPayload> {
  const repo = createBenchmarkRepository(args.supabase);

  // 1. Domain metrics (one row per model for this run group)
  const metricRows = await repo.listDomainMetricsForRunGroup(args.runGroupId);
  const metric = metricRows[0] ?? null;
  const metricsJson = (metric?.metrics ?? {}) as Record<string, unknown>;

  const citationRate = metric?.citation_rate ?? 0;
  const shareOfVoice = metric?.share_of_voice ?? 0;
  const queryCoverage = metric?.query_coverage ?? 0;

  const platform = args.platform;
  const platformVisKey =
    platform === 'chatgpt' ? 'chatgpt_visibility_pct'
    : platform === 'gemini' ? 'gemini_visibility_pct'
    : 'perplexity_visibility_pct';
  const visibilityPct = typeof metricsJson[platformVisKey] === 'number'
    ? (metricsJson[platformVisKey] as number)
    : citationRate;
  const industryRank = typeof metricsJson['industry_rank'] === 'number'
    ? (metricsJson['industry_rank'] as number)
    : null;

  const modelId = metric?.model_id ?? '';

  // 2. Query runs + their query text
  const queryRuns = await repo.listQueryRunsForRunGroup(args.runGroupId);
  const queryIds = queryRuns.map((r) => r.query_id);

  let queryTextMap: Map<string, { key: string; text: string }> = new Map();
  if (queryIds.length > 0) {
    const { data: queryRows, error } = await args.supabase
      .from('benchmark_queries')
      .select('id,query_key,query_text')
      .in('id', queryIds);
    if (error) throw error;
    for (const q of (queryRows ?? []) as { id: string; query_key: string; query_text: string }[]) {
      queryTextMap.set(q.id, { key: q.query_key, text: q.query_text });
    }
  }

  // 3. All citations for this run group
  const allCitations = await repo.listCitationsForRunGroup(args.runGroupId);

  // Index citations by query_run_id
  const citationsByRunId = new Map<string, typeof allCitations>();
  for (const c of allCitations) {
    const bucket = citationsByRunId.get(c.query_run_id) ?? [];
    bucket.push(c);
    citationsByRunId.set(c.query_run_id, bucket);
  }

  // 4. Build prompt rows
  const prompts: GpmPromptRow[] = [];
  for (const run of queryRuns) {
    const qInfo = queryTextMap.get(run.query_id);
    if (!qInfo) continue;

    const citations = citationsByRunId.get(run.id) ?? [];

    // Client cited?
    const clientCitation = citations.find(
      (c) =>
        !c.metadata['is_competitor'] &&
        (c.cited_domain === args.measuredCanonicalDomain ||
          (c.cited_url && c.cited_url.includes(args.measuredCanonicalDomain)))
    );
    const cited = clientCitation !== undefined;
    const rankPosition = clientCitation?.rank_position ?? null;

    // Top non-client, non-competitor citation for this query
    const topCompetitor = citations.find(
      (c) =>
        !c.metadata['is_competitor'] &&
        c.cited_domain !== args.measuredCanonicalDomain &&
        c.cited_domain
    );

    prompts.push({
      queryKey: qInfo.key,
      queryText: qInfo.text,
      cited,
      rankPosition,
      topCompetitorInQuery: topCompetitor?.cited_domain ?? null,
    });
  }

  // 5. Competitor co-citation summary
  const competitorCountMap = new Map<string, number>();
  for (const c of allCitations) {
    if (!c.metadata['is_competitor']) continue;
    const name = (c.metadata['competitor_name'] as string | undefined) ?? c.cited_domain ?? 'Unknown';
    competitorCountMap.set(name, (competitorCountMap.get(name) ?? 0) + 1);
  }
  const totalQueries = queryRuns.length;
  const competitors: GpmCompetitorRow[] = Array.from(competitorCountMap.entries())
    .map(([name, citationCount]) => ({ name, citationCount, totalQueries }))
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 10);

  // 6. Opportunities: prompts where client not cited
  const opportunities = prompts
    .filter((p) => !p.cited)
    .map((p) => ({ queryText: p.queryText, topCompetitorInQuery: p.topCompetitorInQuery }));

  return {
    configId: args.configId,
    domain: args.domain,
    topic: args.topic,
    location: args.location,
    windowDate: args.windowDate,
    platform,
    modelId,
    reportedAt: new Date().toISOString(),
    citationRate,
    shareOfVoice,
    queryCoverage,
    visibilityPct,
    industryRank,
    prompts,
    competitors,
    opportunities,
  };
}
