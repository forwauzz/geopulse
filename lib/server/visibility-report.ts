/**
 * AI Visibility Performance Report — the customer-facing renderer (spec §7.3 / Report C).
 *
 * Turns the benchmark engine's metrics (computeBenchmarkMetrics → BenchmarkMetricComputation) into
 * the owner-friendly "are we actually appearing in AI answers, how do we compare, what changed"
 * block that ships in the monthly monitor email. Pure and deterministic so it is fully unit-tested;
 * the data plumbing (fetch latest run group → metrics) and per-subscriber benchmark execution are
 * separate, cost-bearing layers wired on top.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BenchmarkMetricComputation } from './benchmark-metrics';
import { createBenchmarkRepository } from './benchmark-repository';
import { escapeEmailHtml } from './email-theme';

const ZERO_METRICS: BenchmarkMetricComputation['metrics'] = {
  scheduled_runs: 0, completed_runs: 0, skipped_runs: 0, failed_runs: 0, cited_runs: 0,
  inclusion_rate: 0, measured_domain_cited_runs: 0, measured_domain_citation_rate: 0,
  domain_citation_count: 0, pool_citation_count: 0, explicit_url_citation_count: 0,
  explicit_domain_citation_count: 0, brand_mention_citation_count: 0,
  exact_page_matched_runs: 0, exact_page_supported_runs: 0, exact_page_quality_rate: 0,
  industry_rank: null, chatgpt_visibility_pct: 0, gemini_visibility_pct: 0, perplexity_visibility_pct: 0,
};

function toFraction(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * DISPLAY-ONLY (free path): read the latest benchmark the scheduler already ran for this domain and
 * reconstruct the metrics — no new benchmark runs, no LLM cost. Returns null when we have never
 * benchmarked the domain (so the monthly report simply omits the visibility section). Never throws.
 */
export async function fetchLatestVisibilityForDomain(
  supabase: SupabaseClient,
  canonicalDomain: string
): Promise<BenchmarkMetricComputation | null> {
  try {
    const repo = createBenchmarkRepository(supabase);
    const domain = await repo.getDomainByCanonicalDomain(canonicalDomain.toLowerCase());
    if (!domain) return null;

    const { data } = await supabase
      .from('benchmark_domain_metrics')
      .select('citation_rate, share_of_voice, query_coverage, metrics, created_at')
      .eq('domain_id', domain.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;

    const jsonb = (data.metrics ?? {}) as Record<string, unknown>;
    const metrics = { ...ZERO_METRICS, ...jsonb } as BenchmarkMetricComputation['metrics'];
    if (metrics.completed_runs <= 0) return null;

    return {
      queryCoverage: toFraction(data.query_coverage),
      citationRate: toFraction(metrics.inclusion_rate || data.citation_rate),
      measuredDomainCitationRate: toFraction(data.citation_rate ?? metrics.measured_domain_citation_rate),
      shareOfVoice: toFraction(data.share_of_voice),
      exactPageQualityRate: toFraction(metrics.exact_page_quality_rate),
      visibilityPctByPlatform: {
        gemini: toFraction(metrics.gemini_visibility_pct),
        openai: toFraction(metrics.chatgpt_visibility_pct),
        perplexity: toFraction(metrics.perplexity_visibility_pct),
      },
      metrics,
    };
  } catch {
    return null;
  }
}

const EMAIL = {
  ink: '#0f1b1b',
  body: '#2a3535',
  muted: '#586162',
  gold: '#b79c60',
  up: '#059669',
  down: '#dc2626',
  panel: '#f5f6f4',
} as const;

/** Fraction (0–1) → whole-percent string. */
export function fmtPct(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return '0%';
  return `${Math.round(fraction * 100)}%`;
}

/** Signed change label with an up/down arrow, given this period vs the prior period (0–1 fractions). */
export function fmtDelta(current: number, prior: number | null | undefined): { text: string; color: string } | null {
  if (prior == null || !Number.isFinite(prior)) return null;
  const deltaPts = Math.round(current * 100) - Math.round(prior * 100);
  if (deltaPts === 0) return { text: 'no change', color: EMAIL.muted };
  const up = deltaPts > 0;
  return { text: `${up ? '▲' : '▼'} ${Math.abs(deltaPts)} pts`, color: up ? EMAIL.up : EMAIL.down };
}

export interface VisibilitySummary {
  /** Headline line for the email / subject (e.g. "appeared in 42% of AI answers"). */
  readonly headline: string;
  /** Ready-to-embed HTML block for the monthly email. */
  readonly html: string;
  /** True when there is enough data to be worth showing. */
  readonly hasData: boolean;
}

function metricRow(label: string, value: string, delta?: { text: string; color: string } | null): string {
  const deltaHtml = delta
    ? `<span style="color:${delta.color};font-size:12px;font-weight:600;margin-left:8px;">${escapeEmailHtml(delta.text)}</span>`
    : '';
  return (
    `<tr>` +
    `<td style="padding:7px 0;color:${EMAIL.muted};font-size:13px;">${escapeEmailHtml(label)}</td>` +
    `<td style="padding:7px 0;text-align:right;color:${EMAIL.ink};font-size:15px;font-weight:700;">${escapeEmailHtml(value)}${deltaHtml}</td>` +
    `</tr>`
  );
}

/**
 * Render the Visibility Performance block. `prior` is the previous period's metrics (optional) for
 * the change column. Returns `hasData=false` when no engine runs completed, so the caller can skip
 * the section entirely rather than show a wall of zeros.
 */
export function renderVisibilitySummary(args: {
  domain: string;
  metrics: BenchmarkMetricComputation;
  prior?: BenchmarkMetricComputation | null;
  promptsTracked?: number;
  competitorsTracked?: number;
}): VisibilitySummary {
  const { domain, metrics, prior } = args;
  const m = metrics.metrics;
  const completed = m.completed_runs;

  if (completed <= 0) {
    return { hasData: false, headline: '', html: '' };
  }

  const appeared = metrics.measuredDomainCitationRate; // cited-in-answer rate for this domain
  const headline = `${domain} appeared in ${fmtPct(appeared)} of tracked AI answers`;

  const rows = [
    metricRow('Appeared in AI answers', fmtPct(appeared), fmtDelta(appeared, prior?.measuredDomainCitationRate)),
    metricRow('Share of voice vs competitors', fmtPct(metrics.shareOfVoice), fmtDelta(metrics.shareOfVoice, prior?.shareOfVoice)),
    m.industry_rank != null
      ? metricRow('Average rank when present', `#${m.industry_rank.toFixed(1)}`)
      : '',
    metricRow('ChatGPT', fmtPct(m.chatgpt_visibility_pct)),
    metricRow('Gemini', fmtPct(m.gemini_visibility_pct)),
    metricRow('Perplexity', fmtPct(m.perplexity_visibility_pct)),
  ]
    .filter(Boolean)
    .join('');

  const scope =
    args.promptsTracked || args.competitorsTracked
      ? `<p style="margin:10px 0 0;color:${EMAIL.muted};font-size:12px;">Across ${String(args.promptsTracked ?? completed)} buyer prompts` +
        (args.competitorsTracked ? ` and ${String(args.competitorsTracked)} competitors` : '') +
        ` · ${String(completed)} AI responses analyzed.</p>`
      : `<p style="margin:10px 0 0;color:${EMAIL.muted};font-size:12px;">${String(completed)} AI responses analyzed.</p>`;

  const html = [
    `<div style="margin:24px 0;border:1px solid #e4e7e2;border-radius:14px;padding:20px;background:${EMAIL.panel};">`,
    `<p style="margin:0 0 2px;color:${EMAIL.gold};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">AI Visibility Performance</p>`,
    `<p style="margin:0 0 12px;color:${EMAIL.ink};font-size:17px;font-weight:700;">${escapeEmailHtml(headline)}</p>`,
    `<table role="presentation" width="100%" style="border-collapse:collapse;">${rows}</table>`,
    scope,
    `</div>`,
  ].join('\n');

  return { hasData: true, headline, html };
}
