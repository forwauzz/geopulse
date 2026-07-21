import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SELF_IMPROVEMENT_HOUR_UTC,
  DEFAULT_SELF_IMPROVEMENT_TARGET,
  buildImprovementPlan,
  buildSelfImprovementReportHtml,
  resolveSelfImprovementEnvConfig,
} from './self-improvement';
import type { FreeScanOutput, ScanIssueJson } from '../../workers/scan-engine/run-scan';

function issue(partial: Partial<ScanIssueJson>): ScanIssueJson {
  return {
    check: 'Check', checkId: 'c', weight: 10, passed: false, status: 'FAIL',
    category: 'ai_readiness', bucket: 'eligibility', finding: 'missing', fix: 'add it', ...partial,
  };
}

describe('resolveSelfImprovementEnvConfig', () => {
  it('defaults are safe (disabled, canonical target, noon UTC)', () => {
    const c = resolveSelfImprovementEnvConfig(undefined);
    expect(c.envEnabled).toBe(false);
    expect(c.targetUrl).toBe(DEFAULT_SELF_IMPROVEMENT_TARGET);
    expect(c.hourUtc).toBe(DEFAULT_SELF_IMPROVEMENT_HOUR_UTC);
    expect(c.envRecipient).toBeNull();
  });

  it('parses truthy flags and overrides', () => {
    const c = resolveSelfImprovementEnvConfig({
      SELF_IMPROVEMENT_ENABLED: 'true',
      SELF_IMPROVEMENT_TARGET_URL: 'https://example.com/',
      SELF_IMPROVEMENT_HOUR_UTC: '9',
      SELF_IMPROVEMENT_REPORT_TO: 'admin@example.com',
    });
    expect(c.envEnabled).toBe(true);
    expect(c.targetUrl).toBe('https://example.com/');
    expect(c.hourUtc).toBe(9);
    expect(c.envRecipient).toBe('admin@example.com');
  });

  it('rejects an out-of-range hour and non-truthy flags', () => {
    expect(resolveSelfImprovementEnvConfig({ SELF_IMPROVEMENT_HOUR_UTC: '99' }).hourUtc).toBe(DEFAULT_SELF_IMPROVEMENT_HOUR_UTC);
    expect(resolveSelfImprovementEnvConfig({ SELF_IMPROVEMENT_ENABLED: 'maybe' }).envEnabled).toBe(false);
  });
});

describe('buildImprovementPlan', () => {
  const output: FreeScanOutput = {
    score: 60,
    letterGrade: 'D',
    categoryScores: [],
    bucketScores: [],
    checkCatalogVersion: 'test',
    topIssues: [],
    issues: [
      issue({ checkId: 'pass1', passed: true, weight: 20 }),
      issue({ checkId: 'blocked', status: 'BLOCKED', weight: 15 }),
      issue({ checkId: 'llm403', status: 'LOW_CONFIDENCE', finding: 'http_403', weight: 12 }),
      issue({ checkId: 'low', weight: 5, fix: 'fix low' }),
      issue({ checkId: 'high', weight: 30, fix: 'fix high' }),
      issue({ checkId: 'mid', weight: 10, fix: undefined }),
    ],
  };

  it('keeps only actionable failures, ranked by weight', () => {
    const plan = buildImprovementPlan(output);
    expect(plan.map((p) => p.checkId)).toEqual(['high', 'mid', 'low']);
    expect(plan[0]!.fix).toBe('fix high');
  });

  it('supplies a default fix when none is present', () => {
    const plan = buildImprovementPlan(output);
    expect(plan.find((p) => p.checkId === 'mid')!.fix).toMatch(/review/i);
  });

  it('respects the max cap', () => {
    expect(buildImprovementPlan(output, 1)).toHaveLength(1);
  });
});

describe('buildSelfImprovementReportHtml', () => {
  it('renders score, grade, and escapes plan text', () => {
    const html = buildSelfImprovementReportHtml({
      targetUrl: 'https://getgeopulse.com/',
      score: 58,
      letterGrade: 'F',
      dateStr: '2026-07-18',
      plan: [{ check: 'Schema <types>', checkId: 'x', weight: 10, category: 'trust', finding: 'f', fix: 'Add <script>' }],
    });
    expect(html).toContain('58');
    expect(html).toContain('Grade F');
    expect(html).toContain('Schema &lt;types&gt;');
    expect(html).not.toContain('Add <script>'); // escaped
  });

  it('handles an empty plan gracefully', () => {
    const html = buildSelfImprovementReportHtml({
      targetUrl: 'https://getgeopulse.com/', score: 95, letterGrade: 'A', dateStr: '2026-07-18', plan: [],
    });
    expect(html).toMatch(/good shape/i);
  });
});
