import { describe, expect, it } from 'vitest';
import { buildOutcomeActions, loadClientOutcomeEngine } from './client-outcome-engine';

describe('buildOutcomeActions', () => {
  const scan = {
    issues_json: [
      { checkId: 'jsonld', check: 'Add structured data', passed: false, weight: 9, finding: 'Missing', fix: 'Add Organization JSON-LD.' },
      { checkId: 'title', check: 'Clarify title', passed: false, weight: 4, finding: 'Vague', fix: 'Name the service and city.' },
      { checkId: 'robots', check: 'Crawler access', passed: true, weight: 10, finding: '', fix: null },
    ],
  };

  it('ranks real audit and uncited-prompt actions by impact and effort', () => {
    const actions = buildOutcomeActions({
      scan,
      uncitedPrompts: ['best vestibular therapy in Vancouver'],
      events: [],
    });
    expect(actions.map((action) => action.key)).toEqual([
      'audit:jsonld',
      'audit:title',
      'prompt:best vestibular therapy in vancouver',
    ]);
    expect(actions[0]).toMatchObject({
      impact: 'high',
      effort: 'medium',
      status: 'pending',
      source: 'website_audit',
    });
  });

  it('keeps completion state and history keyed to the recommendation', () => {
    const actions = buildOutcomeActions({
      scan,
      uncitedPrompts: [],
      events: [{
        actionKey: 'audit:jsonld',
        status: 'completed',
        at: '2026-07-24T12:00:00.000Z',
        byUserId: 'user-1',
      }],
    });
    const completed = actions.find((action) => action.key === 'audit:jsonld');
    expect(completed).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-24T12:00:00.000Z',
    });
    expect(actions.at(-1)?.key).toBe('audit:jsonld');
  });
});

describe('scoped customer outcome', () => {
  it('does not average a stale ChatGPT run from another SanoMed query set', async () => {
    type Row = Record<string, unknown>;
    const seed: Record<string, Row[]> = {
      benchmark_domains: [{ id: 'sano-domain', canonical_domain: 'sanomedsolutions.com' }],
      benchmark_run_groups: [
        { id: 'gemini-current', query_set_id: 'verified-set', agency_account_id: 'lifter', 'metadata->>domain_id': 'sano-domain', status: 'completed', started_at: '2026-08-02' },
        { id: 'perplexity-current', query_set_id: 'verified-set', agency_account_id: 'lifter', 'metadata->>domain_id': 'sano-domain', status: 'completed', started_at: '2026-08-02' },
        { id: 'chatgpt-old', query_set_id: 'uk-set', agency_account_id: 'lifter', 'metadata->>domain_id': 'sano-domain', status: 'completed', started_at: '2026-08-01' },
      ],
      benchmark_domain_metrics: [
        { run_group_id: 'gemini-current', domain_id: 'sano-domain', model_id: 'gemini-3.5-flash-lite', citation_rate: 0, metrics: { run_mode: 'blind_discovery', completed_runs: 10 }, computed_at: '2026-08-02T01:02:11Z' },
        { run_group_id: 'perplexity-current', domain_id: 'sano-domain', model_id: 'sonar', citation_rate: 0.9, metrics: { run_mode: 'blind_discovery', completed_runs: 10 }, computed_at: '2026-08-02T01:02:19Z' },
        { run_group_id: 'chatgpt-old', domain_id: 'sano-domain', model_id: 'gpt-4o-mini', citation_rate: 0, metrics: { run_mode: 'blind_discovery', completed_runs: 10 }, computed_at: '2026-08-01' },
      ],
      query_runs: [
        { id: 'gemini-run', query_id: 'current-question', run_group_id: 'gemini-current', status: 'completed' },
        { id: 'perplexity-run', query_id: 'current-question', run_group_id: 'perplexity-current', status: 'completed' },
        { id: 'old-run', query_id: 'uk-question', run_group_id: 'chatgpt-old', status: 'completed' },
      ],
      query_citations: [{ query_run_id: 'perplexity-run', cited_domain: 'sanomedsolutions.com' }],
      benchmark_queries: [
        { id: 'current-question', query_text: 'Where can I get travel vaccines in the West Island of Montreal?' },
        { id: 'uk-question', query_text: 'Which occupational health software is best in Leatherhead?' },
      ],
    };
    const supabase = {
      from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        const rows = () => (seed[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        const chain: any = {
          select() { return chain; },
          eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return chain; },
          in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return chain; },
          order() { return chain; },
          limit(value: number) { return Promise.resolve({ data: rows().slice(0, value), error: null }); },
          maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
          then(resolve: (result: { data: Row[]; error: null }) => unknown) {
            return Promise.resolve({ data: rows(), error: null }).then(resolve);
          },
        };
        return chain;
      },
    };

    const outcome = await loadClientOutcomeEngine({
      supabase,
      domain: 'sanomedsolutions.com',
      measurementScope: {
        querySetId: 'verified-set',
        agencyAccountId: 'lifter',
        enabledPlatforms: ['gemini', 'perplexity'],
      },
    });

    expect(outcome.visibilityPct).toBe(45);
    expect(outcome.engines.map((engine) => engine.engine).sort()).toEqual(['gemini', 'perplexity']);
    expect(outcome.actions.map((action) => action.title).join(' ')).not.toContain('Leatherhead');
  });
});
