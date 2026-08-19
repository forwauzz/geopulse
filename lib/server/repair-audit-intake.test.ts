import { describe, expect, it, vi } from 'vitest';
import {
  buildRepairAuditEnvelope,
  deliverRepairAudit,
  persistAndDeliverRepairAudit,
  retryPendingRepairAudits,
  type RepairAuditKv,
} from './repair-audit-intake';
import type { SelfImprovementRunResult } from './self-improvement';

function audited(): SelfImprovementRunResult {
  return {
    ok: true,
    status: 'audited',
    runId: 'audit-run-1',
    score: 80,
    letterGrade: 'B',
    checkCatalogVersion: 'catalog-v1',
    plan: [{
      check: 'Internal links', checkId: 'internal-links', weight: 10, category: 'technical',
      finding: 'Few internal links.', fix: 'Add relevant internal links.', status: 'FAIL',
      bucket: 'hygiene', confidence: 'high',
    }],
  };
}

function blockedRetrievalAgents(): SelfImprovementRunResult {
  return {
    ok: true,
    status: 'audited',
    runId: 'audit-run-retrieval',
    score: 70,
    letterGrade: 'C',
    checkCatalogVersion: '2026-07-21',
    plan: [{
      check: 'AI retrieval agent access (robots.txt)',
      checkId: 'ai-crawler-access',
      weight: 10,
      category: 'ai_readiness',
      finding: 'robots.txt blocks OAI-SearchBot.',
      fix: 'Allow approved retrieval agents.',
      status: 'FAIL',
      bucket: 'eligibility',
      confidence: 'high',
    }],
  };
}

function memoryKv(): RepairAuditKv & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    put: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    get: vi.fn(async (key: string) => {
      const value = values.get(key);
      return value ? JSON.parse(value) as unknown : null;
    }),
    delete: vi.fn(async (key: string) => { values.delete(key); }),
    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const matching = [...values.keys()]
        .filter((key) => !options?.prefix || key.startsWith(options.prefix))
        .sort();
      const offset = options?.cursor ? Number(options.cursor) : 0;
      const limit = options?.limit ?? 1000;
      const keys = matching.slice(offset, offset + limit).map((name) => ({ name }));
      const nextOffset = offset + keys.length;
      return {
        keys,
        list_complete: nextOffset >= matching.length,
        ...(nextOffset < matching.length ? { cursor: String(nextOffset) } : {}),
      };
    }),
  };
}

describe('canonical self-audit repair delivery', () => {
  it('preserves audit provenance and fails closed without exact repository repair evidence', () => {
    const envelope = buildRepairAuditEnvelope({ result: audited(), targetUrl: 'https://getgeopulse.com/', generatedAt: '2026-08-19T16:00:00.000Z' });
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      producer: 'canonical-cloudflare-scheduler',
      auditRunId: 'audit-run-1',
      repositoryProfileId: 'geopulse-v1',
      checkCatalogVersion: 'catalog-v1',
      findings: [{ checkId: 'internal-links', confidence: 'high', risk: 'prohibited' }],
    });
  });

  it('maps only the evidence-complete retrieval-access failure to the installed deterministic skill', () => {
    const envelope = buildRepairAuditEnvelope({
      result: blockedRetrievalAgents(),
      targetUrl: 'https://getgeopulse.com/',
      generatedAt: '2026-08-19T16:00:00.000Z',
    });
    expect(envelope?.findings).toEqual([expect.objectContaining({
      checkId: 'ai-crawler-access',
      status: 'FAIL',
      confidence: 'high',
      risk: 'low',
      repairHint: { instruction: { skillId: 'allow-ai-retrieval-agents', path: 'app/robots.ts' } },
    })]);

    const warning = blockedRetrievalAgents();
    warning.plan![0] = { ...warning.plan![0]!, status: 'WARNING' };
    expect(buildRepairAuditEnvelope({
      result: warning,
      targetUrl: 'https://getgeopulse.com/',
      generatedAt: '2026-08-19T16:00:00.000Z',
    })?.findings).toEqual([expect.objectContaining({ risk: 'prohibited' })]);

    const unsupportedCatalog = blockedRetrievalAgents();
    unsupportedCatalog.checkCatalogVersion = 'future-catalog';
    expect(buildRepairAuditEnvelope({
      result: unsupportedCatalog,
      targetUrl: 'https://getgeopulse.com/',
      generatedAt: '2026-08-19T16:00:00.000Z',
    })?.findings).toEqual([expect.objectContaining({ risk: 'prohibited' })]);
  });

  it('delivers through the internal service binding and reports an honest unsupported no-op', async () => {
    const fetch = vi.fn(async () => Response.json({ accepted: true, queued: false, repairId: null, reasons: ['no eligible supported finding'] }, { status: 202 }));
    const result = await deliverRepairAudit({ service: { fetch }, result: audited(), targetUrl: 'https://getgeopulse.com/', generatedAt: '2026-08-19T16:00:00.000Z' });
    expect(result).toEqual({ delivered: true, queued: false, reason: 'no eligible supported finding' });
    expect(fetch).toHaveBeenCalledWith('https://repair-agent.internal/v1/audits', expect.objectContaining({ method: 'POST' }));
  });

  it('does not report success for a skipped or uncommitted audit', async () => {
    const result = await deliverRepairAudit({ service: { fetch: vi.fn() }, result: { ok: false, status: 'skipped', reason: 'kill_switch' }, targetUrl: 'https://getgeopulse.com/', generatedAt: '2026-08-19T16:00:00.000Z' });
    expect(result).toEqual({ delivered: false, queued: false, reason: 'audit produced no committed run' });
  });

  it('persists before delivery and clears the durable outbox only after acceptance', async () => {
    const kv = memoryKv();
    const fetch = vi.fn(async () => Response.json({ accepted: true, queued: false, reasons: ['no eligible supported finding'] }, { status: 202 }));
    const result = await persistAndDeliverRepairAudit({
      kv,
      service: { fetch },
      result: audited(),
      targetUrl: 'https://getgeopulse.com/',
      generatedAt: '2026-08-19T16:00:00.000Z',
      nowMs: Date.parse('2026-08-19T16:00:00.000Z'),
    });
    expect(result).toMatchObject({ auditRunId: 'audit-run-1', delivered: true, attempts: 1, exhausted: false });
    expect(kv.put).toHaveBeenCalledBefore(fetch);
    expect(kv.values.size).toBe(0);
  });

  it('retries a transient failure on a later tick and preserves the same audit identity', async () => {
    const kv = memoryKv();
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('binding unavailable'))
      .mockResolvedValueOnce(Response.json({ accepted: true, queued: true, repairId: 'a'.repeat(32) }, { status: 202 }));
    const first = await persistAndDeliverRepairAudit({
      kv,
      service: { fetch },
      result: audited(),
      targetUrl: 'https://getgeopulse.com/',
      generatedAt: '2026-08-19T16:00:00.000Z',
      nowMs: Date.parse('2026-08-19T16:00:00.000Z'),
    });
    expect(first).toMatchObject({ delivered: false, attempts: 1, exhausted: false, nextAttemptAt: '2026-08-19T16:05:00.000Z' });
    const retried = await retryPendingRepairAudits({ kv, service: { fetch }, nowMs: Date.parse('2026-08-19T16:05:00.000Z') });
    expect(retried).toEqual([expect.objectContaining({ auditRunId: 'audit-run-1', delivered: true, queued: true, attempts: 2 })]);
    const submittedBodies = fetch.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as { auditRunId: string });
    expect(submittedBodies.map((body) => body.auditRunId)).toEqual(['audit-run-1', 'audit-run-1']);
    expect(kv.values.size).toBe(0);
  });

  it('stops after three evidence-backed attempts and retains an owned exhausted record', async () => {
    const kv = memoryKv();
    const fetch = vi.fn(async () => Response.json({ accepted: false, reasons: ['temporary rejection'] }, { status: 503 }));
    await persistAndDeliverRepairAudit({
      kv,
      service: { fetch },
      result: audited(),
      targetUrl: 'https://getgeopulse.com/',
      generatedAt: '2026-08-19T16:00:00.000Z',
      nowMs: Date.parse('2026-08-19T16:00:00.000Z'),
    });
    await retryPendingRepairAudits({ kv, service: { fetch }, nowMs: Date.parse('2026-08-19T16:05:00.000Z') });
    const third = await retryPendingRepairAudits({ kv, service: { fetch }, nowMs: Date.parse('2026-08-19T16:35:00.000Z') });
    expect(third).toEqual([expect.objectContaining({ attempts: 3, exhausted: true, nextAttemptAt: null })]);
    expect(fetch).toHaveBeenCalledTimes(3);
    const retained = JSON.parse([...kv.values.values()][0]!) as Record<string, unknown>;
    expect(retained).toMatchObject({ owner: 'repair-intake', retryPolicy: 'three_attempts_5m_30m', state: 'exhausted', attempts: 3, lastError: 'temporary rejection' });
    await retryPendingRepairAudits({ kv, service: { fetch }, nowMs: Date.parse('2026-08-20T16:35:00.000Z') });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('paginates past exhausted and future-due records to reach later due work', async () => {
    const kv = memoryKv();
    const template = buildRepairAuditEnvelope({ result: audited(), targetUrl: 'https://getgeopulse.com/', generatedAt: '2026-08-19T16:00:00.000Z' })!;
    const record = (auditRunId: string, state: 'pending' | 'exhausted', nextAttemptAt: string | null) => JSON.stringify({
      schemaVersion: 1,
      auditRunId,
      owner: 'repair-intake',
      retryPolicy: 'three_attempts_5m_30m',
      state,
      attempts: state === 'exhausted' ? 3 : 1,
      nextAttemptAt,
      lastError: state === 'exhausted' ? 'attempts exhausted' : 'temporary failure',
      createdAt: '2026-08-19T16:00:00.000Z',
      updatedAt: '2026-08-19T16:00:00.000Z',
      envelope: { ...template, auditRunId },
    });
    for (let index = 0; index < 24; index += 1) {
      const auditRunId = `a-exhausted-${String(index).padStart(2, '0')}`;
      await kv.put(`repair-audit-delivery:v1:${auditRunId}`, record(auditRunId, 'exhausted', null));
    }
    await kv.put('repair-audit-delivery:v1:b-future', record('b-future', 'pending', '2026-08-20T16:00:00.000Z'));
    await kv.put('repair-audit-delivery:v1:z-due', record('z-due', 'pending', '2026-08-19T16:05:00.000Z'));
    const fetch = vi.fn(async () => Response.json({ accepted: true, queued: false, reasons: ['no eligible supported finding'] }, { status: 202 }));

    const retried = await retryPendingRepairAudits({ kv, service: { fetch }, nowMs: Date.parse('2026-08-19T16:05:00.000Z'), limit: 1 });

    expect(retried).toEqual([expect.objectContaining({ auditRunId: 'z-due', delivered: true })]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(kv.list).toHaveBeenCalledTimes(2);
  });
});
