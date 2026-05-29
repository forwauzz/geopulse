/**
 * Daily benchmark recap.
 *
 * Summarizes the last 24h of marketing-firm benchmark runs into a short email
 * digest: how many runs fired, how many succeeded, who got cited, which topics
 * drove citations, and which platforms moved.
 *
 * Pure analyzer + renderers. The Cloudflare worker fetches the data and calls
 * sendBenchmarkDailyRecap; tests cover the analyzer + HTML/text renderers
 * without touching Supabase or Resend.
 */

import { inferProviderFromModelId } from './benchmark-metrics';
import type {
  BenchmarkDomainRow,
  BenchmarkQueryRow,
  QueryCitationRow,
  QueryRunRow,
} from './benchmark-repository';

// ── Types ────────────────────────────────────────────────────────────────────

export type RecapRunStatusCounts = {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly other: number;
};

export type RecapPlatformBreakdown = {
  readonly platform: 'gemini' | 'openai' | 'perplexity' | 'unknown';
  readonly completedRuns: number;
  readonly citedRuns: number;
  readonly visibilityPct: number;
};

export type RecapCitedDomain = {
  readonly domain: string;
  readonly citedRuns: number;
  readonly inCohortSeed: boolean;
  readonly newToday: boolean;
};

export type RecapTopicEntry = {
  readonly topic: string;
  readonly runs: number;
  readonly citedRuns: number;
  readonly inclusionRate: number;
};

export type BenchmarkDailyRecap = {
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly vertical: string;
  readonly runStatus: RecapRunStatusCounts;
  readonly totalCitations: number;
  readonly cohortVisibilityPct: number;
  readonly distinctDomainsRun: number;
  readonly distinctDomainsCited: number;
  readonly platformBreakdown: readonly RecapPlatformBreakdown[];
  readonly topCitedDomains: readonly RecapCitedDomain[];
  readonly topTopics: readonly RecapTopicEntry[];
  readonly newlyCitedDomains: readonly string[];
  readonly headline: string;
};

export type BenchmarkDailyRecapInput = {
  readonly vertical: string;
  readonly now: Date;
  readonly windowHours?: number;
  readonly seedDomains: readonly BenchmarkDomainRow[];
  readonly runs: readonly QueryRunRow[];
  readonly citations: readonly QueryCitationRow[];
  readonly queriesById: ReadonlyMap<string, BenchmarkQueryRow>;
  readonly priorCitedDomains: ReadonlySet<string>;
  readonly leaderboardLimit?: number;
  readonly topicLimit?: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Analyzer ─────────────────────────────────────────────────────────────────

export function buildBenchmarkDailyRecap(input: BenchmarkDailyRecapInput): BenchmarkDailyRecap {
  const windowHours = input.windowHours ?? 24;
  const windowEnd = input.now;
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);
  const leaderboardLimit = input.leaderboardLimit ?? 10;
  const topicLimit = input.topicLimit ?? 5;

  const status: RecapRunStatusCounts = {
    total: input.runs.length,
    completed: input.runs.filter((r) => r.status === 'completed').length,
    failed: input.runs.filter((r) => r.status === 'failed').length,
    skipped: input.runs.filter((r) => r.status === 'skipped').length,
    other: input.runs.filter(
      (r) => r.status !== 'completed' && r.status !== 'failed' && r.status !== 'skipped'
    ).length,
  };

  const completedRuns = input.runs.filter((r) => r.status === 'completed');
  const completedRunIds = new Set(completedRuns.map((r) => r.id));
  const completedCitations = input.citations.filter((c) => completedRunIds.has(c.query_run_id));

  const citationsByRun = new Map<string, QueryCitationRow[]>();
  for (const c of completedCitations) {
    const list = citationsByRun.get(c.query_run_id) ?? [];
    list.push(c);
    citationsByRun.set(c.query_run_id, list);
  }

  // Cohort-wide visibility: % of completed runs that produced ≥1 citation.
  const citedCompletedRuns = completedRuns.filter(
    (r) => (citationsByRun.get(r.id) ?? []).length > 0
  );
  const cohortVisibilityPct =
    completedRuns.length === 0 ? 0 : citedCompletedRuns.length / completedRuns.length;

  // Platform breakdown.
  const platforms: Array<RecapPlatformBreakdown['platform']> = [
    'gemini',
    'openai',
    'perplexity',
    'unknown',
  ];
  const platformBreakdown: RecapPlatformBreakdown[] = platforms
    .map((platform) => {
      const runs = completedRuns.filter((r) => inferProviderFromModelId(r.model_id) === platform);
      const cited = runs.filter((r) => (citationsByRun.get(r.id) ?? []).length > 0).length;
      return {
        platform,
        completedRuns: runs.length,
        citedRuns: cited,
        visibilityPct: runs.length === 0 ? 0 : cited / runs.length,
      };
    })
    .filter((p) => p.completedRuns > 0);

  // Cited-domain leaderboard.
  const seedSet = new Set(input.seedDomains.map((d) => d.canonical_domain));
  type Agg = { runIds: Set<string> };
  const citedAgg = new Map<string, Agg>();
  for (const c of completedCitations) {
    if (!c.cited_domain) continue;
    const agg = citedAgg.get(c.cited_domain) ?? { runIds: new Set<string>() };
    agg.runIds.add(c.query_run_id);
    citedAgg.set(c.cited_domain, agg);
  }

  const topCitedDomains: RecapCitedDomain[] = Array.from(citedAgg.entries())
    .map(([domain, agg]) => ({
      domain,
      citedRuns: agg.runIds.size,
      inCohortSeed: seedSet.has(domain),
      newToday: !input.priorCitedDomains.has(domain),
    }))
    .sort((a, b) => b.citedRuns - a.citedRuns)
    .slice(0, leaderboardLimit);

  const newlyCitedDomains = Array.from(citedAgg.keys())
    .filter((d) => !input.priorCitedDomains.has(d))
    .sort();

  // Topic breakdown.
  const topicAgg = new Map<string, { runs: number; cited: number }>();
  for (const run of completedRuns) {
    const query = input.queriesById.get(run.query_id);
    const topic = query?.topic;
    if (!topic) continue;
    const bucket = topicAgg.get(topic) ?? { runs: 0, cited: 0 };
    bucket.runs += 1;
    if ((citationsByRun.get(run.id) ?? []).length > 0) bucket.cited += 1;
    topicAgg.set(topic, bucket);
  }
  const topTopics: RecapTopicEntry[] = Array.from(topicAgg.entries())
    .map(([topic, v]) => ({
      topic,
      runs: v.runs,
      citedRuns: v.cited,
      inclusionRate: v.runs === 0 ? 0 : v.cited / v.runs,
    }))
    .sort((a, b) => b.inclusionRate - a.inclusionRate || b.runs - a.runs)
    .slice(0, topicLimit);

  const distinctDomainsRun = new Set(input.runs.map((r) => r.domain_id)).size;

  const headline = buildHeadline({
    completed: status.completed,
    failed: status.failed,
    cohortVisibilityPct,
    newlyCitedCount: newlyCitedDomains.length,
  });

  return {
    generatedAt: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    vertical: input.vertical,
    runStatus: status,
    totalCitations: completedCitations.length,
    cohortVisibilityPct,
    distinctDomainsRun,
    distinctDomainsCited: citedAgg.size,
    platformBreakdown,
    topCitedDomains,
    topTopics,
    newlyCitedDomains,
    headline,
  };
}

function buildHeadline(args: {
  readonly completed: number;
  readonly failed: number;
  readonly cohortVisibilityPct: number;
  readonly newlyCitedCount: number;
}): string {
  if (args.completed === 0 && args.failed === 0) {
    return 'No benchmark runs in the last 24h — scheduled lane is idle.';
  }
  const parts: string[] = [];
  parts.push(`${args.completed} completed`);
  if (args.failed > 0) parts.push(`${args.failed} failed`);
  parts.push(`${pct(args.cohortVisibilityPct)} cohort visibility`);
  if (args.newlyCitedCount > 0) {
    parts.push(`${args.newlyCitedCount} newly-cited domain${args.newlyCitedCount === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

// ── Renderers ────────────────────────────────────────────────────────────────

export function renderBenchmarkDailyRecapText(recap: BenchmarkDailyRecap): string {
  const lines: string[] = [];
  lines.push(`GEO Pulse — Daily benchmark recap (${recap.vertical})`);
  lines.push(`Window: ${recap.windowStart} → ${recap.windowEnd}`);
  lines.push('');
  lines.push(recap.headline);
  lines.push('');
  lines.push('Runs:');
  lines.push(`  total:     ${recap.runStatus.total}`);
  lines.push(`  completed: ${recap.runStatus.completed}`);
  lines.push(`  failed:    ${recap.runStatus.failed}`);
  lines.push(`  skipped:   ${recap.runStatus.skipped}`);
  lines.push(`  other:     ${recap.runStatus.other}`);
  lines.push('');
  lines.push(
    `Distinct domains run: ${recap.distinctDomainsRun} · cited: ${recap.distinctDomainsCited} · total citations: ${recap.totalCitations}`
  );
  lines.push('');

  if (recap.platformBreakdown.length > 0) {
    lines.push('Visibility by platform:');
    for (const p of recap.platformBreakdown) {
      lines.push(`  ${p.platform}: ${p.citedRuns}/${p.completedRuns} (${pct(p.visibilityPct)})`);
    }
    lines.push('');
  }

  if (recap.topCitedDomains.length > 0) {
    lines.push('Top cited domains:');
    for (const d of recap.topCitedDomains) {
      const tags: string[] = [];
      if (d.inCohortSeed) tags.push('seed');
      if (d.newToday) tags.push('new');
      const tag = tags.length > 0 ? `  [${tags.join(',')}]` : '';
      lines.push(`  ${d.citedRuns}× ${d.domain}${tag}`);
    }
    lines.push('');
  }

  if (recap.topTopics.length > 0) {
    lines.push('Top topics by inclusion rate:');
    for (const t of recap.topTopics) {
      lines.push(`  ${t.topic}: ${t.citedRuns}/${t.runs} (${pct(t.inclusionRate)})`);
    }
    lines.push('');
  }

  if (recap.newlyCitedDomains.length > 0) {
    lines.push(`Newly cited (first time in window): ${recap.newlyCitedDomains.join(', ')}`);
  }

  return lines.join('\n');
}

export function renderBenchmarkDailyRecapHtml(recap: BenchmarkDailyRecap): string {
  const platformRows = recap.platformBreakdown
    .map(
      (p) =>
        `<tr><td style="padding:4px 8px;font-size:13px;">${escHtml(p.platform)}</td><td style="padding:4px 8px;font-size:13px;text-align:right;">${p.citedRuns}/${p.completedRuns}</td><td style="padding:4px 8px;font-size:13px;text-align:right;font-weight:700;">${pct(p.visibilityPct)}</td></tr>`
    )
    .join('');

  const citedRows = recap.topCitedDomains
    .map((d) => {
      const tags: string[] = [];
      if (d.inCohortSeed) tags.push('seed');
      if (d.newToday) tags.push('new');
      const tagHtml =
        tags.length === 0
          ? ''
          : ` <span style="font-size:11px;color:#586162;">[${escHtml(tags.join(','))}]</span>`;
      return `<tr><td style="padding:4px 8px;font-size:13px;">${escHtml(d.domain)}${tagHtml}</td><td style="padding:4px 8px;font-size:13px;text-align:right;font-weight:700;">${d.citedRuns}</td></tr>`;
    })
    .join('');

  const topicRows = recap.topTopics
    .map(
      (t) =>
        `<tr><td style="padding:4px 8px;font-size:13px;">${escHtml(t.topic)}</td><td style="padding:4px 8px;font-size:13px;text-align:right;">${t.citedRuns}/${t.runs}</td><td style="padding:4px 8px;font-size:13px;text-align:right;font-weight:700;">${pct(t.inclusionRate)}</td></tr>`
    )
    .join('');

  const newlyCitedBlock =
    recap.newlyCitedDomains.length === 0
      ? ''
      : `<tr><td style="padding:8px 32px 16px;"><h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Newly cited</h3><p style="font-size:13px;color:#2C3435;margin:0;">${escHtml(recap.newlyCitedDomains.join(', '))}</p></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F1F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F4;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:640px;">
  <tr><td style="background:#565E74;padding:24px 32px;">
    <span style="color:#fff;font-size:20px;font-weight:700;">GEO Pulse</span>
    <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:12px;">Daily benchmark recap · ${escHtml(recap.vertical)}</span>
  </td></tr>
  <tr><td style="padding:24px 32px 8px;">
    <h2 style="margin:0;color:#2C3435;font-size:18px;">${escHtml(recap.headline)}</h2>
    <p style="margin:8px 0 0;color:#586162;font-size:12px;">Window: ${escHtml(recap.windowStart)} → ${escHtml(recap.windowEnd)}</p>
  </td></tr>
  <tr><td style="padding:8px 32px 16px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Runs</h3>
    <p style="font-size:14px;color:#2C3435;margin:0;">
      <strong>${recap.runStatus.completed}</strong> completed ·
      <strong>${recap.runStatus.failed}</strong> failed ·
      <strong>${recap.runStatus.skipped}</strong> skipped ·
      total <strong>${recap.runStatus.total}</strong>
    </p>
    <p style="font-size:13px;color:#586162;margin:4px 0 0;">
      ${recap.distinctDomainsRun} distinct domains run · ${recap.distinctDomainsCited} cited · ${recap.totalCitations} citations
    </p>
  </td></tr>
  ${
    platformRows
      ? `<tr><td style="padding:8px 32px 16px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Visibility by platform</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E9E9;border-radius:6px;border-collapse:collapse;">
      <tr style="background:#F1F4F4;">
        <th style="padding:6px 8px;text-align:left;font-size:12px;">Platform</th>
        <th style="padding:6px 8px;text-align:right;font-size:12px;">Cited/Completed</th>
        <th style="padding:6px 8px;text-align:right;font-size:12px;">Visibility</th>
      </tr>
      ${platformRows}
    </table>
  </td></tr>`
      : ''
  }
  ${
    citedRows
      ? `<tr><td style="padding:8px 32px 16px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Top cited domains</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E9E9;border-radius:6px;border-collapse:collapse;">
      <tr style="background:#F1F4F4;">
        <th style="padding:6px 8px;text-align:left;font-size:12px;">Domain</th>
        <th style="padding:6px 8px;text-align:right;font-size:12px;">Cited runs</th>
      </tr>
      ${citedRows}
    </table>
  </td></tr>`
      : ''
  }
  ${
    topicRows
      ? `<tr><td style="padding:8px 32px 16px;">
    <h3 style="margin:0 0 8px;color:#565E74;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Top topics</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E9E9;border-radius:6px;border-collapse:collapse;">
      <tr style="background:#F1F4F4;">
        <th style="padding:6px 8px;text-align:left;font-size:12px;">Topic</th>
        <th style="padding:6px 8px;text-align:right;font-size:12px;">Cited/Runs</th>
        <th style="padding:6px 8px;text-align:right;font-size:12px;">Inclusion rate</th>
      </tr>
      ${topicRows}
    </table>
  </td></tr>`
      : ''
  }
  ${newlyCitedBlock}
  <tr><td style="padding:24px 32px;border-top:1px solid #F1F4F4;">
    <p style="color:#ABB4B5;font-size:11px;margin:0;">Generated ${escHtml(recap.generatedAt)} · GEO Pulse benchmarking</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Sender (Resend) ──────────────────────────────────────────────────────────

export type SendDailyRecapResult = { ok: true; id?: string } | { ok: false; reason: string };

export async function sendBenchmarkDailyRecap(input: {
  readonly recap: BenchmarkDailyRecap;
  readonly resendApiKey: string;
  readonly from: string;
  readonly to: string;
}): Promise<SendDailyRecapResult> {
  const dateStr = input.recap.windowEnd.slice(0, 10);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: `GEO Pulse — Daily benchmark recap · ${dateStr} · ${input.recap.headline}`,
      html: renderBenchmarkDailyRecapHtml(input.recap),
      text: renderBenchmarkDailyRecapText(input.recap),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, reason: t.slice(0, 500) };
  }
  try {
    const body = (await res.json()) as { id?: string };
    return { ok: true, id: body.id };
  } catch {
    return { ok: true };
  }
}

// ── Data fetcher (Supabase) ──────────────────────────────────────────────────

type DailyRecapSupabase = {
  from: (table: string) => any;
};

/**
 * Fetches the last `windowHours` of runs/citations + the seed cohort and
 * prior-window cited domains (so "newly cited" is meaningful), then runs the
 * pure analyzer. Kept thin on purpose so the analyzer stays testable.
 */
export async function fetchAndBuildBenchmarkDailyRecap(args: {
  readonly supabase: DailyRecapSupabase;
  readonly vertical: string;
  readonly now: Date;
  readonly windowHours?: number;
}): Promise<BenchmarkDailyRecap> {
  const windowHours = args.windowHours ?? 24;
  const windowEnd = args.now;
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);
  const priorWindowStart = new Date(windowStart.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Seed cohort for this vertical.
  const { data: domainData, error: domainErr } = await args.supabase
    .from('benchmark_domains')
    .select(
      'id,domain,canonical_domain,site_url,display_name,vertical,subvertical,geo_region,is_customer,is_competitor,metadata,created_at,updated_at'
    )
    .eq('vertical', args.vertical);
  if (domainErr) throw new Error(`benchmark_domains query failed: ${domainErr.message}`);
  const seedDomains = (domainData ?? []) as BenchmarkDomainRow[];

  // Runs in the recap window.
  const { data: runData, error: runErr } = await args.supabase
    .from('query_runs')
    .select(
      'id,run_group_id,domain_id,query_id,model_id,auditor_model_id,status,response_text,response_metadata,error_message,executed_at,created_at'
    )
    .gte('created_at', windowStart.toISOString())
    .lt('created_at', windowEnd.toISOString());
  if (runErr) throw new Error(`query_runs query failed: ${runErr.message}`);
  const runs = (runData ?? []) as QueryRunRow[];

  // Citations for those runs.
  const runIds = runs.map((r) => r.id);
  let citations: QueryCitationRow[] = [];
  if (runIds.length > 0) {
    const { data: citationData, error: citationErr } = await args.supabase
      .from('query_citations')
      .select(
        'id,query_run_id,cited_domain,cited_url,grounding_evidence_id,grounding_page_url,grounding_page_type,rank_position,citation_type,sentiment,confidence,metadata,created_at'
      )
      .in('query_run_id', runIds);
    if (citationErr) throw new Error(`query_citations query failed: ${citationErr.message}`);
    citations = (citationData ?? []) as QueryCitationRow[];
  }

  // Queries (for topic breakdown).
  const queryIds = Array.from(new Set(runs.map((r) => r.query_id)));
  const queriesById = new Map<string, BenchmarkQueryRow>();
  if (queryIds.length > 0) {
    const { data: queryData, error: queryErr } = await args.supabase
      .from('benchmark_queries')
      .select('id,query_set_id,query_key,query_text,intent_type,topic,weight,metadata,created_at')
      .in('id', queryIds);
    if (queryErr) throw new Error(`benchmark_queries query failed: ${queryErr.message}`);
    for (const q of (queryData ?? []) as BenchmarkQueryRow[]) queriesById.set(q.id, q);
  }

  // Prior cited domains: anything cited in the 30 days before the current window.
  // Used so "newly cited" surfaces a genuine first appearance, not noise.
  const priorCitedDomains = new Set<string>();
  const { data: priorCitations, error: priorErr } = await args.supabase
    .from('query_citations')
    .select('cited_domain,created_at')
    .gte('created_at', priorWindowStart.toISOString())
    .lt('created_at', windowStart.toISOString())
    .not('cited_domain', 'is', null);
  if (priorErr) throw new Error(`prior query_citations query failed: ${priorErr.message}`);
  for (const row of (priorCitations ?? []) as Array<{ cited_domain: string | null }>) {
    if (row.cited_domain) priorCitedDomains.add(row.cited_domain);
  }

  return buildBenchmarkDailyRecap({
    vertical: args.vertical,
    now: windowEnd,
    windowHours,
    seedDomains,
    runs,
    citations,
    queriesById,
    priorCitedDomains,
  });
}
