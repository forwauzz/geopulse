import { describe, expect, it } from 'vitest';
import { retrieveIntelligenceEvidence } from './evidence-retrieval';

function builder(data: unknown[] = []) {
  const api: any = {
    select: () => api,
    eq: () => api,
    in: () => api,
    gte: () => api,
    order: () => api,
    limit: () => Promise.resolve({ data, error: null }),
    maybeSingle: () => Promise.resolve({ data: { id: 'domain-1' }, error: null }),
  };
  return api;
}

describe('structured intelligence evidence retrieval', () => {
  it('returns inspectable eligible evidence', async () => {
    const db = {
      from(table: string) {
        return table === 'intelligence_domains'
          ? builder()
          : builder([{
              stable_evidence_id: 'scan:1',
              source_kind: 'agency_scan',
              source_table: 'scans',
              source_id: '1',
              collected_at: '2026-07-27T00:00:00.000Z',
              inline_excerpt: 'Measured score 72.',
              artifact_ref: 'https://getgeopulse.com/share/one',
              privacy: 'private_tenant',
              tenant_type: 'agency_client',
              tenant_id: 'client-1',
              metadata: {},
              intelligence_runs: { quality_state: 'valid', observed_at: '2026-07-27T00:00:00.000Z' },
            }]);
      },
    };

    const result = await retrieveIntelligenceEvidence(db, {
      tenantType: 'agency_client',
      tenantId: 'client-1',
      domainHost: 'example.com',
    });
    expect(result.status).toBe('ready');
    expect(result.evidence[0]).toMatchObject({
      evidenceId: 'scan:1',
      sourceUrl: 'https://getgeopulse.com/share/one',
      qualityState: 'valid',
    });
  });

  it('returns a truthful pending state for a domain that is not indexed', async () => {
    const api: any = {
      select: () => api,
      eq: () => api,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    const result = await retrieveIntelligenceEvidence({ from: () => api }, {
      platformInternal: true,
      domainHost: 'missing.example',
    });
    expect(result).toEqual({
      status: 'insufficient_evidence',
      evidence: [],
      limitations: ['The domain has not been indexed by the intelligence layer yet.'],
    });
  });
});
