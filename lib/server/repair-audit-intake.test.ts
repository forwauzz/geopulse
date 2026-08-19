import { describe, expect, it, vi } from 'vitest';
import { buildRepairAuditEnvelope, deliverRepairAudit } from './repair-audit-intake';
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
});
