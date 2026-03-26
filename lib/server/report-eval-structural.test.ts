import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { structuralReportScore } from './report-eval-structural';

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'eval', 'fixtures', name), 'utf8');
}

describe('structuralReportScore', () => {
  it('scores the primary sample fixture highly', () => {
    const r = structuralReportScore(fixture('sample-deep-audit.md'));
    expect(r.overall).toBeGreaterThanOrEqual(85);
    expect(r.metrics.hasCoverageSummary).toBe(10);
    expect(r.metrics.hasTechnicalAppendix).toBe(10);
  });

  it('recognizes blocked and low-confidence statuses in golden fixture', () => {
    const r = structuralReportScore(fixture('sample-deep-audit-statuses.md'));
    expect(r.overall).toBeGreaterThanOrEqual(85);
    expect(r.metrics.statusDiversity).toBeGreaterThanOrEqual(10);
  });

  it('scores empty markdown low', () => {
    const r = structuralReportScore('');
    expect(r.overall).toBeLessThan(30);
  });
});
