import { describe, expect, it } from 'vitest';
import { structuralReportScore } from './report-eval-structural';

describe('structuralReportScore', () => {
  it('scores a complete fixture highly', () => {
    const md = `
# GEO-Pulse — AI Search Readiness Report

## Executive Summary
Your site scored 72/100 (B).

## Priority Action Plan
1. **Fix titles** [High]

## Score Breakdown — All Checks
| Check | Status |
|-------|--------|
| Title | FAIL |

## Pages Scanned
- https://example.com/ — 80/100 (A)
`;
    const r = structuralReportScore(md);
    expect(r.overall).toBeGreaterThanOrEqual(80);
  });

  it('scores empty markdown low', () => {
    const r = structuralReportScore('');
    expect(r.overall).toBeLessThan(30);
  });
});
