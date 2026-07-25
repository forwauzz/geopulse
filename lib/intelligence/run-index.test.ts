import { describe, expect, it } from 'vitest';
import {
  classifyScanSource,
  runSourceKey,
  runSourceSnapshot,
  validateRunIndexCandidates,
  type RunIndexCandidate,
} from './run-index';

function candidate(overrides: Partial<RunIndexCandidate> = {}): RunIndexCandidate {
  return {
    sourceKind: 'free_scan',
    sourceTable: 'scans',
    sourceId: 'scan-1',
    sourceStatus: 'complete',
    qualityState: 'unknown',
    startedAt: null,
    completedAt: null,
    observedAt: '2026-01-01T00:00:00Z',
    provider: null,
    modelId: null,
    runMode: null,
    versions: {},
    artifactRef: null,
    tenantType: 'user',
    tenantId: 'user-1',
    visibility: 'tenant',
    ...overrides,
  };
}

describe('canonical run index contract', () => {
  it('uses a reversible stable source key', () => {
    expect(runSourceKey(candidate())).toBe('free_scan:scan-1');
  });

  it('creates stable source snapshots without metadata ordering drift', () => {
    expect(runSourceSnapshot(candidate({ versions: { b: '2', a: '1' } }))).toBe(
      runSourceSnapshot(candidate({ versions: { a: '1', b: '2' } }))
    );
  });

  it('detects duplicates and orphaned parents without dropping rows', () => {
    const child = candidate({
      sourceKind: 'page_scan',
      sourceId: 'page-1',
      parentSourceKind: 'deep_audit_run',
      parentSourceId: 'missing',
    });
    expect(validateRunIndexCandidates([candidate(), candidate(), child])).toEqual({
      duplicates: ['free_scan:scan-1'],
      missingParents: ['page_scan:page-1->deep_audit_run:missing'],
      unsupported: [],
    });
  });

  it.each([
    ['public_self_serve', 'free_scan'],
    ['agency_dashboard', 'agency_scan'],
    ['startup_dashboard', 'startup_scan'],
    ['admin_manual', 'admin_scan'],
    ['recurring', 'recurring_scan'],
    ['internal_benchmark', 'competitor_scan'],
    ['new_source', 'scan_unknown'],
  ])('classifies %s as %s', (source, kind) => {
    expect(classifyScanSource(source)).toBe(kind);
  });
});
