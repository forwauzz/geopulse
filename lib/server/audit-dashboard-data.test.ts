import { describe, expect, it } from 'vitest';
import {
  buildAuditDashboardView,
  deriveAccessMatrix,
  deriveStructuredDataHealth,
  extractScanIssues,
  severityForWeight,
  type AuditScanRow,
} from './audit-dashboard-data';

/**
 * A `full_results_json` payload carrying an accessMatrix, shaped like the scan route persists it
 * (workers/scan-engine/access-matrix.ts nested under `accessMatrix`).
 */
function withAccessMatrix(
  rows: Array<{ label: string; status: 'eligible' | 'blocked' | 'not_tested' }>,
  opts: {
    training?: Array<{ token: string; vendor: string; allowed: boolean | null }>;
    pageFetched?: boolean;
  } = {}
) {
  return {
    accessMatrix: {
      registryVersion: 'test',
      rows: rows.map((r) => ({ destination: r.label, ...r, control: '', detail: '' })),
      trainingPanel: opts.training ?? [],
      diagnosis: { pageFetched: opts.pageFetched ?? true },
    },
  };
}

function issue(checkId: string, passed: boolean, extra: Partial<Record<string, unknown>> = {}) {
  return { checkId, check: checkId, passed, weight: 5, finding: '', ...extra };
}

function scan(overrides: Partial<AuditScanRow> = {}): AuditScanRow {
  return {
    id: 's-1',
    url: 'https://example.com',
    domain: 'example.com',
    score: 74,
    letter_grade: 'B',
    created_at: '2026-07-01T00:00:00Z',
    issues_json: [],
    full_results_json: null,
    ...overrides,
  };
}

describe('extractScanIssues', () => {
  it('prefers the full issue list over the trimmed issues_json', () => {
    const s = scan({
      issues_json: [issue('a', false)],
      full_results_json: { issues: [issue('a', false), issue('b', true)] },
    });
    expect(extractScanIssues(s)).toHaveLength(2);
  });

  it('falls back to allIssues for deep-audit shapes, then issues_json', () => {
    const deep = scan({ full_results_json: { allIssues: [issue('a', true)] } });
    expect(extractScanIssues(deep)).toHaveLength(1);
    const legacy = scan({ issues_json: [issue('a', true)], full_results_json: {} });
    expect(extractScanIssues(legacy)).toHaveLength(1);
  });
});

describe('deriveAccessMatrix', () => {
  it('reads the five retrieval destinations and counts eligible vs tested', () => {
    const s = scan({
      full_results_json: withAccessMatrix([
        { label: 'Google Search + AI Overviews', status: 'eligible' },
        { label: 'ChatGPT Search', status: 'eligible' },
        { label: 'Claude', status: 'blocked' },
        { label: 'Perplexity', status: 'eligible' },
        { label: 'Bing / Copilot', status: 'not_tested' },
      ]),
    });
    const m = deriveAccessMatrix(s);
    expect(m?.destinations).toHaveLength(5);
    expect(m?.testedCount).toBe(4); // not_tested excluded
    expect(m?.eligibleCount).toBe(3);
    expect(m?.pageBlocked).toBe(false);
  });

  it('keeps training tokens separate and never counts a training block as blocked access', () => {
    const s = scan({
      full_results_json: withAccessMatrix(
        [{ label: 'Claude', status: 'eligible' }],
        { training: [{ token: 'GPTBot', vendor: 'OpenAI', allowed: false }] }
      ),
    });
    const m = deriveAccessMatrix(s);
    expect(m?.eligibleCount).toBe(1);
    expect(m?.trainingChoices).toEqual([{ token: 'GPTBot', vendor: 'OpenAI', allowed: false }]);
  });

  it('flags a blocked page fetch so the card can explain the Not-tested rows', () => {
    const s = scan({
      full_results_json: withAccessMatrix(
        [{ label: 'Claude', status: 'not_tested' }],
        { pageFetched: false }
      ),
    });
    expect(deriveAccessMatrix(s)?.pageBlocked).toBe(true);
  });

  it('returns null for scans that predate the access matrix', () => {
    expect(deriveAccessMatrix(scan({ full_results_json: { issues: [] } }))).toBeNull();
    expect(deriveAccessMatrix(scan({ full_results_json: null }))).toBeNull();
  });
});

describe('deriveStructuredDataHealth', () => {
  it('computes the pass ratio over structured-data checks only', () => {
    const health = deriveStructuredDataHealth([
      issue('jsonld', true),
      issue('schema-types', false),
      issue('open-graph', true),
      issue('https-only', false),
    ] as never);
    expect(health?.percent).toBe(67);
    expect(health?.parts).toHaveLength(3);
  });

  it('returns null when no structured-data checks are present', () => {
    expect(deriveStructuredDataHealth([issue('https-only', true)] as never)).toBeNull();
  });
});

describe('severityForWeight', () => {
  it('maps weights to bands', () => {
    expect(severityForWeight(10)).toBe('high');
    expect(severityForWeight(8)).toBe('high');
    expect(severityForWeight(5)).toBe('medium');
    expect(severityForWeight(2)).toBe('low');
  });
});

describe('buildAuditDashboardView', () => {
  it('handles the empty state', () => {
    const view = buildAuditDashboardView([]);
    expect(view.latest).toBeNull();
    expect(view.accessMatrix).toBeNull();
    expect(view.trendPoints).toHaveLength(0);
    expect(view.priorityActions).toHaveLength(0);
  });

  it('derives everything from the newest scan and orders the trend chronologically', () => {
    const rows = [
      scan({
        id: 'new',
        score: 80,
        created_at: '2026-07-02T00:00:00Z',
        issues_json: [
          issue('ai-crawler-access', true),
          issue('jsonld', false, { weight: 9, fix: 'Add JSON-LD.' }),
          issue('open-graph', true),
        ],
      }),
      scan({ id: 'old', score: 60, created_at: '2026-07-01T00:00:00Z' }),
    ];
    const view = buildAuditDashboardView(rows);
    expect(view.latest?.scanId).toBe('new');
    expect(view.trendPoints.map((p) => p.score)).toEqual([60, 80]);
    expect(view.priorityActions[0]).toMatchObject({ title: 'jsonld', severity: 'high', scanId: 'new' });
    expect(view.recent).toHaveLength(2);
  });
});
