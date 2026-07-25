import { describe, expect, it } from 'vitest';
import {
  documentPassesFilters,
  runRetrievalExperiment,
  stableEmbeddingId,
  type EmbeddingProvider,
  type RetrievalFixture,
} from './retrieval-experiment';

const fixture: RetrievalFixture = {
  fixtureVersion: 'test-v1',
  createdBeforeIndexing: true,
  topK: 1,
  documents: [
    {
      evidenceId: 'entity', sourceId: 'source-1', objectType: 'finding',
      text: 'Organization JSON-LD is absent', domain: 'a.example', lane: 'audit',
      model: null, quality: 'valid', visibility: 'internal', tenantId: null,
      observedAt: '2026-01-01T00:00:00Z',
    },
    {
      evidenceId: 'other', sourceId: 'source-2', objectType: 'finding',
      text: 'Page speed is excellent', domain: 'b.example', lane: 'audit',
      model: null, quality: 'valid', visibility: 'internal', tenantId: null,
      observedAt: '2026-01-01T00:00:00Z',
    },
    {
      evidenceId: 'private-b', sourceId: 'source-3', objectType: 'finding',
      text: 'Private entity details', domain: 'b.example', lane: 'audit',
      model: null, quality: 'valid', visibility: 'private_tenant', tenantId: 'tenant-b',
      observedAt: '2026-01-01T00:00:00Z',
    },
  ],
  tasks: [{
    taskId: 'entity-task',
    taskType: 'discovery',
    query: 'machine readable company identity missing',
    filters: { quality: ['valid'], visibility: ['internal'] },
    relevantEvidenceIds: ['entity'],
    forbiddenEvidenceIds: ['private-b'],
  }],
};

const provider: EmbeddingProvider = {
  provider: 'test',
  model: 'semantic-concepts',
  version: 'v1',
  async embed(texts) {
    return {
      vectors: texts.map((text) => {
        const entity = /organization|json-ld|machine readable|identity/i.test(text) ? 1 : 0;
        const speed = /speed/i.test(text) ? 1 : 0;
        return [entity, speed];
      }),
      tokenCount: texts.length,
      estimatedCostUsd: 0,
    };
  },
};

describe('bounded retrieval experiment', () => {
  it('uses stable versioned embedding IDs independent of reruns', () => {
    expect(stableEmbeddingId(fixture.documents[0]!, provider)).toBe(
      stableEmbeddingId(fixture.documents[0]!, provider)
    );
    expect(stableEmbeddingId(fixture.documents[0]!, provider)).not.toBe(
      stableEmbeddingId(fixture.documents[0]!, { ...provider, version: 'v2' })
    );
  });

  it('filters tenant access before ranking', () => {
    const privateDocument = fixture.documents[2]!;
    expect(documentPassesFilters(privateDocument, { tenantId: ['tenant-a'] }, {
      allowTenantPrivate: true,
    })).toBe(false);
    expect(documentPassesFilters(privateDocument, { tenantId: ['tenant-b'] }, {
      allowTenantPrivate: true,
    })).toBe(true);
    expect(documentPassesFilters(privateDocument, { tenantId: ['tenant-b'] }, {
      allowTenantPrivate: false,
    })).toBe(false);
  });

  it('returns stable evidence/source IDs and a measured baseline comparison', async () => {
    const report = await runRetrievalExperiment(fixture, provider, {
      minimumPrecisionImprovement: 0,
    });
    expect(report.semanticTasks[0]?.results[0]).toMatchObject({
      evidenceId: 'entity', sourceId: 'source-1',
    });
    expect(report.semantic.accessControlAccuracy).toBe(1);
    expect(report.semantic.recallAtK).toBe(1);
    expect(report.embeddings.some((item) => item.evidenceId === 'private-b')).toBe(false);
  });

  it('refuses an evaluation set labeled after indexing', async () => {
    await expect(runRetrievalExperiment({
      ...fixture, createdBeforeIndexing: false,
    }, provider)).rejects.toThrow('before indexing');
  });
});
