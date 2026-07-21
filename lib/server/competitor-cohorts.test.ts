import { describe, expect, it } from 'vitest';
import {
  COHORT_STALE_MS,
  extractComparisonSignals,
  selectStaleCohortDomains,
} from './competitor-cohorts';

const NOW = Date.parse('2026-07-21T12:00:00Z');

function domain(id: string, canonical: string, metadata: Record<string, unknown> = {}) {
  return { id, canonical_domain: canonical, metadata };
}

describe('extractComparisonSignals', () => {
  it('maps access-matrix rows to three-state signals', () => {
    const out = extractComparisonSignals({
      score: 72,
      full_results_json: {
        scoreState: 'measured',
        accessMatrix: {
          rows: [
            { destination: 'chatgpt_search', status: 'eligible' },
            { destination: 'claude', status: 'blocked' },
            { destination: 'perplexity', status: 'not_tested' },
          ],
        },
        issues: [
          { checkId: 'schema-types', status: 'PASS' },
          { checkId: 'llms-txt', status: 'FAIL' },
        ],
      },
    });
    expect(out.score).toBe(72);
    expect(out.scoreState).toBe('measured');
    expect(out.destinations.chatgpt_search).toBe('allows');
    expect(out.destinations.claude).toBe('blocks');
    expect(out.destinations.perplexity).toBe('not_verified');
    expect(out.structuredData).toBe('present');
    expect(out.llmsTxt).toBe('missing');
  });

  it('never renders a NOT_TESTED scan as a graded result', () => {
    const out = extractComparisonSignals({
      score: 55, // even if a stale score leaked into the row, not_tested wins
      full_results_json: {
        scoreState: 'not_tested',
        accessMatrix: { rows: [{ destination: 'claude', status: 'not_tested' }] },
        issues: [{ checkId: 'schema-types', status: 'NOT_EVALUATED' }],
      },
    });
    expect(out.score).toBeNull();
    expect(out.scoreState).toBe('not_tested');
    expect(out.destinations.claude).toBe('not_verified');
    expect(out.structuredData).toBe('not_verified');
  });

  it('treats WARNING as partial and missing payloads as not verified', () => {
    const out = extractComparisonSignals({ score: null, full_results_json: null });
    expect(out.structuredData).toBe('not_verified');
    expect(out.llmsTxt).toBe('not_verified');
    const warned = extractComparisonSignals({
      score: 60,
      full_results_json: { issues: [{ checkId: 'schema-types', status: 'WARNING' }] },
    });
    expect(warned.structuredData).toBe('partial');
  });
});

describe('selectStaleCohortDomains', () => {
  it('picks never-scanned domains first, then the oldest stale scans, capped', () => {
    const domains = [
      domain('a', 'fresh.ca'),
      domain('b', 'stale-old.ca'),
      domain('c', 'never.ca'),
      domain('d', 'stale-older.ca'),
    ];
    const latest = new Map<string, number>([
      ['fresh.ca', NOW - 1000],
      ['stale-old.ca', NOW - COHORT_STALE_MS - 1000],
      ['stale-older.ca', NOW - COHORT_STALE_MS - 5000],
    ]);
    const due = selectStaleCohortDomains(domains, latest, NOW, 2);
    expect(due.map((d) => d.id)).toEqual(['c', 'd']);
  });

  it('skips domains attempted recently even if they have no scan (dead-site cooldown)', () => {
    const domains = [
      domain('a', 'dead.ca', { local_cohort_last_attempt_at: new Date(NOW - 60_000).toISOString() }),
      domain('b', 'never.ca'),
    ];
    const due = selectStaleCohortDomains(domains, new Map(), NOW, 5);
    expect(due.map((d) => d.id)).toEqual(['b']);
  });

  it('re-tries a failed domain after the cooldown lapses', () => {
    const past = new Date(NOW - COHORT_STALE_MS - 1000).toISOString();
    const domains = [domain('a', 'dead.ca', { local_cohort_last_attempt_at: past })];
    const due = selectStaleCohortDomains(domains, new Map(), NOW, 5);
    expect(due.map((d) => d.id)).toEqual(['a']);
  });

  it('returns nothing when everything is fresh', () => {
    const domains = [domain('a', 'fresh.ca')];
    const latest = new Map([['fresh.ca', NOW - 1000]]);
    expect(selectStaleCohortDomains(domains, latest, NOW, 5)).toEqual([]);
  });
});
