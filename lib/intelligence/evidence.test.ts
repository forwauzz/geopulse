import { describe, expect, it } from 'vitest';
import {
  canAccessEvidence,
  evidenceContentHash,
  stableEvidenceId,
  validateEvidenceCandidates,
  type EvidenceCandidate,
} from './evidence';

function candidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    sourceKind: 'benchmark_query_run',
    sourceTable: 'query_runs',
    sourceId: 'run-1',
    evidenceKind: 'raw_model_response',
    objectClass: 'original',
    storageKind: 'postgres_source',
    status: 'present',
    privacy: 'internal',
    retentionClass: 'measurement_history',
    ...overrides,
  };
}

describe('evidence catalog contract', () => {
  it('keeps stable identity separate from content deduplication', () => {
    expect(stableEvidenceId(candidate())).not.toBe(
      stableEvidenceId(candidate({ sourceId: 'run-2' }))
    );
    expect(evidenceContentHash('same bytes')).toBe(evidenceContentHash('same bytes'));
  });

  it('does not grant one tenant access to another tenant evidence', () => {
    const evidence = candidate({
      privacy: 'private_tenant',
      tenantType: 'startup_workspace',
      tenantId: 'workspace-1',
    });
    expect(canAccessEvidence(evidence, {
      tenantType: 'startup_workspace',
      tenantId: 'workspace-1',
    })).toBe(true);
    expect(canAccessEvidence(evidence, {
      tenantType: 'startup_workspace',
      tenantId: 'workspace-2',
    })).toBe(false);
    expect(canAccessEvidence(evidence, { isPlatformAdmin: true })).toBe(true);
  });

  it('requires explicit missing state, tenant ownership, and R2 pointers', () => {
    const validation = validateEvidenceCandidates([
      candidate({ status: 'missing' }),
      candidate({ sourceId: '2', privacy: 'private_tenant' }),
      candidate({ sourceId: '3', storageKind: 'r2' }),
    ]);
    expect(validation.invalid).toEqual([
      'benchmark_query_run:2:raw_model_response:tenant',
      'benchmark_query_run:3:raw_model_response:artifact',
      'benchmark_query_run:run-1:raw_model_response:missing',
    ]);
  });
});
