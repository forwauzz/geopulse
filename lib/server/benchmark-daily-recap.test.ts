import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkDailyRecap,
  renderBenchmarkDailyRecapHtml,
  renderBenchmarkDailyRecapText,
} from './benchmark-daily-recap';
import type {
  BenchmarkDomainRow,
  BenchmarkQueryRow,
  QueryCitationRow,
  QueryRunRow,
} from './benchmark-repository';

const NOW = new Date('2026-05-28T00:00:00Z');

function domain(id: string, canonical: string): BenchmarkDomainRow {
  return {
    id,
    domain: canonical,
    canonical_domain: canonical,
    site_url: `https://${canonical}`,
    display_name: canonical,
    vertical: 'marketing_firms',
    subvertical: null,
    geo_region: null,
    is_customer: false,
    is_competitor: false,
    metadata: { seed_priority: 1 },
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function run(
  id: string,
  domainId: string,
  queryId: string,
  status: QueryRunRow['status'] = 'completed',
  modelId = 'gemini-2.5-flash-lite'
): QueryRunRow {
  return {
    id,
    run_group_id: 'rg-1',
    domain_id: domainId,
    query_id: queryId,
    model_id: modelId,
    auditor_model_id: null,
    status,
    response_text: 'r',
    response_metadata: {},
    error_message: null,
    executed_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
  };
}

function citation(
  id: string,
  runId: string,
  citedDomain: string,
  citationType: QueryCitationRow['citation_type'] = 'explicit_url'
): QueryCitationRow {
  return {
    id,
    query_run_id: runId,
    cited_domain: citedDomain,
    cited_url: `https://${citedDomain}/page`,
    grounding_evidence_id: null,
    grounding_page_url: null,
    grounding_page_type: null,
    rank_position: 1,
    citation_type: citationType,
    sentiment: null,
    confidence: 0.9,
    metadata: {},
    created_at: NOW.toISOString(),
  };
}

function query(id: string, topic: string): BenchmarkQueryRow {
  return {
    id,
    query_set_id: 'qs-1',
    query_key: id,
    query_text: 'q',
    intent_type: 'discovery',
    topic,
    weight: 1,
    metadata: {},
    created_at: NOW.toISOString(),
  };
}

describe('buildBenchmarkDailyRecap', () => {
  const seeds = [domain('d1', 'winner.com'), domain('d2', 'midpack.com')];
  const queriesById = new Map([
    ['q-seo', query('q-seo', 'seo')],
    ['q-ppc', query('q-ppc', 'paid_media')],
  ]);

  it('produces a zero-state recap when there are no runs', () => {
    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs: [],
      citations: [],
      queriesById,
      priorCitedDomains: new Set(),
    });

    expect(recap.runStatus.total).toBe(0);
    expect(recap.cohortVisibilityPct).toBe(0);
    expect(recap.headline).toMatch(/idle/i);
    expect(recap.platformBreakdown).toEqual([]);
    expect(recap.topCitedDomains).toEqual([]);
  });

  it('counts run statuses and citations correctly', () => {
    const runs = [
      run('r1', 'd1', 'q-seo', 'completed'),
      run('r2', 'd1', 'q-ppc', 'completed'),
      run('r3', 'd2', 'q-seo', 'failed'),
      run('r4', 'd2', 'q-ppc', 'skipped'),
    ];
    const citations = [citation('c1', 'r1', 'winner.com'), citation('c2', 'r2', 'thirdparty.com')];

    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(),
    });

    expect(recap.runStatus).toEqual({
      total: 4,
      completed: 2,
      failed: 1,
      skipped: 1,
      other: 0,
    });
    expect(recap.totalCitations).toBe(2);
    expect(recap.cohortVisibilityPct).toBe(1); // 2/2 completed runs had citations
    expect(recap.distinctDomainsRun).toBe(2);
    expect(recap.distinctDomainsCited).toBe(2);
  });

  it('ranks the most-cited domain first and flags seed membership', () => {
    const runs = [
      run('r1', 'd1', 'q-seo'),
      run('r2', 'd1', 'q-ppc'),
      run('r3', 'd2', 'q-seo'),
    ];
    const citations = [
      citation('c1', 'r1', 'winner.com'),
      citation('c2', 'r2', 'winner.com'),
      citation('c3', 'r3', 'outsider.com'),
    ];

    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(['winner.com']),
    });

    expect(recap.topCitedDomains[0]?.domain).toBe('winner.com');
    expect(recap.topCitedDomains[0]?.citedRuns).toBe(2);
    expect(recap.topCitedDomains[0]?.inCohortSeed).toBe(true);
    expect(recap.topCitedDomains[0]?.newToday).toBe(false);

    const outsider = recap.topCitedDomains.find((d) => d.domain === 'outsider.com');
    expect(outsider?.inCohortSeed).toBe(false);
    expect(outsider?.newToday).toBe(true);
    expect(recap.newlyCitedDomains).toEqual(['outsider.com']);
  });

  it('computes topic inclusion rates and platform visibility', () => {
    const runs = [
      run('r1', 'd1', 'q-seo', 'completed', 'gemini-2.5-flash-lite'),
      run('r2', 'd1', 'q-ppc', 'completed', 'gemini-2.5-flash-lite'),
      run('r3', 'd2', 'q-seo', 'completed', 'gpt-4o-mini'),
    ];
    const citations = [citation('c1', 'r1', 'winner.com'), citation('c2', 'r3', 'winner.com')];

    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(),
    });

    const seo = recap.topTopics.find((t) => t.topic === 'seo');
    const ppc = recap.topTopics.find((t) => t.topic === 'paid_media');
    expect(seo?.inclusionRate).toBe(1); // 2/2 seo runs cited
    expect(ppc?.inclusionRate).toBe(0); // 0/1 ppc runs cited

    const gemini = recap.platformBreakdown.find((p) => p.platform === 'gemini');
    const openai = recap.platformBreakdown.find((p) => p.platform === 'openai');
    expect(gemini?.completedRuns).toBe(2);
    expect(gemini?.citedRuns).toBe(1);
    expect(openai?.completedRuns).toBe(1);
    expect(openai?.citedRuns).toBe(1);
  });

  it('headline summarizes the day in one line', () => {
    const runs = [run('r1', 'd1', 'q-seo'), run('r2', 'd1', 'q-ppc', 'failed')];
    const citations = [citation('c1', 'r1', 'newcomer.com')];

    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(),
    });

    expect(recap.headline).toContain('1 completed');
    expect(recap.headline).toContain('1 failed');
    expect(recap.headline).toContain('100.0%');
    expect(recap.headline).toContain('1 newly-cited domain');
  });

  it('text and html renderers produce output without throwing', () => {
    const runs = [run('r1', 'd1', 'q-seo')];
    const citations = [citation('c1', 'r1', 'winner.com')];
    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(),
    });

    const text = renderBenchmarkDailyRecapText(recap);
    expect(text).toContain('Daily benchmark recap');
    expect(text).toContain('winner.com');

    const html = renderBenchmarkDailyRecapHtml(recap);
    expect(html).toContain('<html');
    expect(html).toContain('winner.com');
    expect(html).toContain('Daily benchmark recap');
  });

  it('html renderer escapes domain values', () => {
    const runs = [run('r1', 'd1', 'q-seo')];
    const citations = [citation('c1', 'r1', '<script>x</script>')];
    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(),
    });
    const html = renderBenchmarkDailyRecapHtml(recap);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
