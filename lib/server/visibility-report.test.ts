import { describe, expect, it } from 'vitest';
import type { BenchmarkMetricComputation } from './benchmark-metrics';
import { fmtDelta, fmtPct, renderVisibilitySummary } from './visibility-report';

function metrics(overrides: Partial<BenchmarkMetricComputation['metrics']> = {}, top: Partial<BenchmarkMetricComputation> = {}): BenchmarkMetricComputation {
  return {
    queryCoverage: 1,
    citationRate: 0.5,
    measuredDomainCitationRate: 0.42,
    shareOfVoice: 0.31,
    exactPageQualityRate: 0,
    visibilityPctByPlatform: { gemini: 0.5, openai: 0.4, perplexity: 0.2 },
    ...top,
    metrics: {
      scheduled_runs: 20,
      completed_runs: 18,
      skipped_runs: 0,
      failed_runs: 2,
      cited_runs: 9,
      inclusion_rate: 0.5,
      measured_domain_cited_runs: 8,
      measured_domain_citation_rate: 0.42,
      domain_citation_count: 8,
      pool_citation_count: 40,
      explicit_url_citation_count: 3,
      explicit_domain_citation_count: 3,
      brand_mention_citation_count: 2,
      exact_page_matched_runs: 0,
      exact_page_supported_runs: 0,
      exact_page_quality_rate: 0,
      industry_rank: 3.2,
      chatgpt_visibility_pct: 0.4,
      gemini_visibility_pct: 0.5,
      perplexity_visibility_pct: 0.2,
      ...overrides,
    },
  };
}

describe('visibility-report formatting', () => {
  it('fmtPct rounds fractions to whole percent, floors at 0%', () => {
    expect(fmtPct(0.42)).toBe('42%');
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(-0.1)).toBe('0%');
    expect(fmtPct(1)).toBe('100%');
  });

  it('fmtDelta gives signed point change with arrows, null when no prior', () => {
    expect(fmtDelta(0.42, null)).toBeNull();
    expect(fmtDelta(0.42, 0.30)).toMatchObject({ text: '▲ 12 pts' });
    expect(fmtDelta(0.30, 0.42)).toMatchObject({ text: '▼ 12 pts' });
    expect(fmtDelta(0.42, 0.42)).toMatchObject({ text: 'no change' });
  });
});

describe('renderVisibilitySummary', () => {
  it('renders a headline + block when runs completed', () => {
    const out = renderVisibilitySummary({ domain: 'acme.com', metrics: metrics(), promptsTracked: 12, competitorsTracked: 4 });
    expect(out.hasData).toBe(true);
    expect(out.headline).toBe('acme.com appeared in 42% of tracked AI answers');
    expect(out.html).toContain('AI Visibility Performance');
    expect(out.html).toContain('Share of voice');
    expect(out.html).toContain('#3.2'); // industry rank
    expect(out.html).toContain('12 buyer prompts');
  });

  it('returns hasData=false when no engine runs completed (skip the section, no wall of zeros)', () => {
    const out = renderVisibilitySummary({ domain: 'acme.com', metrics: metrics({ completed_runs: 0 }) });
    expect(out.hasData).toBe(false);
    expect(out.html).toBe('');
  });

  it('omits the rank row when rank is null', () => {
    const out = renderVisibilitySummary({ domain: 'acme.com', metrics: metrics({ industry_rank: null }) });
    expect(out.html).not.toContain('Average rank');
  });
});
