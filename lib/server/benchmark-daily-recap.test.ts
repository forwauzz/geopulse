import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkDailyRecap,
  fetchAndBuildBenchmarkDailyRecap,
  renderBenchmarkDailyRecapHtml,
  renderBenchmarkDailyRecapText,
} from './benchmark-daily-recap';
import type {
  BenchmarkDomainRow,
  BenchmarkQueryRow,
  BenchmarkRunGroupRow,
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

function runGroup(
  id: string,
  scheduleVersion = 'schedule-v1',
  modelSetVersion = 'single-model:gemini-2.5-flash-lite',
  createdAt = NOW.toISOString()
): BenchmarkRunGroupRow {
  return {
    id,
    query_set_id: 'qs-1',
    label: id,
    run_scope: 'scheduled_internal_benchmark',
    model_set_version: modelSetVersion,
    status: 'completed',
    notes: null,
    metadata: { trigger_source: 'worker_cron', schedule_version: scheduleVersion },
    startup_workspace_id: null,
    agency_account_id: null,
    started_at: createdAt,
    completed_at: createdAt,
    created_at: createdAt,
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
  const groups = [runGroup('rg-1')];
  const queriesById = new Map([
    ['q-seo', query('q-seo', 'seo')],
    ['q-ppc', query('q-ppc', 'paid_media')],
  ]);

  it('produces a zero-state recap when there are no runs', () => {
    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runGroups: groups,
      runs: [],
      citations: [],
      queriesById,
      priorCitedDomains: new Set(),
    });

    expect(recap.runStatus.total).toBe(0);
    expect(recap.answerCitationRate).toBe(0);
    expect(recap.cohortBusinessVisibility).toEqual({ visible: 0, tested: 0, rate: 0 });
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
      runGroups: groups,
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
    expect(recap.answerCitationRate).toBe(1); // 2/2 completed answers cited a source
    expect(recap.cohortBusinessVisibility).toEqual({ visible: 1, tested: 1, rate: 1 });
    expect(recap.distinctDomainsRun).toBe(2);
    expect(recap.distinctDomainsCited).toBe(2);
  });

  it('excludes other verticals and superseded protocols from current health', () => {
    const oldGroup = runGroup(
      'rg-old',
      'schedule-v0',
      'single-model:gemini-2.5-flash-lite',
      '2026-05-27T00:00:00Z'
    );
    const activeGroup = runGroup('rg-active', 'schedule-v1', 'single-model:sonar');
    const otherGroup = runGroup('rg-other', 'schedule-v1', 'single-model:sonar');
    const otherVertical = { ...domain('d-other', 'clinic.test'), vertical: 'healthcare' };
    const activeRun = {
      ...run('r-active', 'd1', 'q-seo', 'completed', 'sonar'),
      run_group_id: activeGroup.id,
    };
    const oldFailure = {
      ...run('r-old', 'd1', 'q-seo', 'failed'),
      run_group_id: oldGroup.id,
    };
    const unrelatedFailure = {
      ...run('r-other', otherVertical.id, 'q-seo', 'failed', 'sonar'),
      run_group_id: otherGroup.id,
    };

    const recap = buildBenchmarkDailyRecap({
      vertical: 'msp_it',
      now: NOW,
      seedDomains: seeds,
      runGroups: [oldGroup, activeGroup, otherGroup],
      runs: [activeRun, oldFailure, unrelatedFailure],
      citations: [
        citation('c-active', activeRun.id, 'winner.com'),
        citation('c-other', unrelatedFailure.id, 'clinic.test'),
      ],
      queriesById,
      priorCitedDomains: new Set(),
    });

    expect(recap.protocol).toEqual({
      scheduleVersion: 'schedule-v1',
      modelSetVersion: 'single-model:sonar',
    });
    expect(recap.runStatus).toEqual({ total: 1, completed: 1, failed: 0, skipped: 0, other: 0 });
    expect(recap.excludedNonActiveRuns).toBe(1);
    expect(recap.cohortBusinessVisibility).toEqual({ visible: 1, tested: 1, rate: 1 });
    expect(recap.newlyCitedDomains).toEqual(['winner.com']);
  });

  it('fails closed before querying when the recap vertical is empty', async () => {
    await expect(
      fetchAndBuildBenchmarkDailyRecap({
        supabase: { from: () => { throw new Error('must not query'); } },
        vertical: '   ',
        now: NOW,
      })
    ).rejects.toThrow('benchmark_recap_vertical_required');
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
      runGroups: groups,
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
      runGroups: groups,
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
    expect(gemini?.answerCitationRate).toBe(0.5);
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
      runGroups: groups,
      runs,
      citations,
      queriesById,
      priorCitedDomains: new Set(),
    });

    expect(recap.headline).toContain('1 completed');
    expect(recap.headline).toContain('1 active-protocol failed');
    expect(recap.headline).toContain('100.0% answers cited sources');
    expect(recap.headline).toContain('0/1 cohort businesses visible');
    expect(recap.headline).toContain('1 new source domain');
  });

  it('text and html renderers produce output without throwing', () => {
    const runs = [run('r1', 'd1', 'q-seo')];
    const citations = [citation('c1', 'r1', 'winner.com')];
    const recap = buildBenchmarkDailyRecap({
      vertical: 'marketing_firms',
      now: NOW,
      seedDomains: seeds,
      runGroups: groups,
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
      runGroups: groups,
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
