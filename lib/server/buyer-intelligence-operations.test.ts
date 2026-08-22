import { describe, expect, it, vi } from 'vitest';
import { loadBuyerIntelligenceOperatingReport } from './buyer-intelligence-operations';

vi.mock('./gpm-spend-guard', () => ({ loadGpmMonthSpendUsd: vi.fn().mockResolvedValue(1.23456) }));

function db(rows: unknown[], snapshots: number) {
  return {
    from(table: string) {
      if (table === 'buyer_intelligence_generations') {
        const query = { gte: vi.fn(), limit: vi.fn() } as any;
        query.gte.mockReturnValue(query);
        query.limit.mockResolvedValue({ data: rows, error: null });
        return { select: vi.fn(() => query) };
      }
      const query = { gte: vi.fn() } as any;
      query.gte.mockResolvedValue({ count: snapshots, error: null });
      return { select: vi.fn(() => query) };
    },
  } as never;
}

describe('buyer intelligence operating report', () => {
  it('reports safe monthly counts, spend, retries, and connector decisions', async () => {
    const report = await loadBuyerIntelligenceOperatingReport({
      supabase: db([
        { status: 'succeeded', attempts: 1, artifact_r2_key: 'private/a.pdf' },
        { status: 'failed', attempts: 2, artifact_r2_key: null },
        { status: 'queued', attempts: 3, artifact_r2_key: null },
      ], 4),
      env: { GPM_REPORT_DELIVERY_ENABLED: 'false', MONTHLY_BUYER_INTELLIGENCE_ENABLED: 'true' },
      now: new Date('2026-08-13T20:00:00.000Z'),
    });
    expect(report).toMatchObject({
      jobs: { total: 3, succeeded: 1, failed: 1, retrying: 1 },
      artifacts: { stored: 1, snapshots: 4 },
      estimatedProviderSpendUsd: 1.2346,
      legacyConsumerCount: 0,
      connectorDecisions: { brevo: { decision: 'revise' }, hubspot: { decision: 'defer' } },
    });
    expect(JSON.stringify(report)).not.toContain('private/a.pdf');
  });

  it('makes an explicitly enabled legacy GPM artifact consumer visible', async () => {
    const report = await loadBuyerIntelligenceOperatingReport({
      supabase: db([], 0),
      env: { GPM_REPORT_DELIVERY_ENABLED: 'true', MONTHLY_BUYER_INTELLIGENCE_ENABLED: 'false' },
    });
    expect(report.legacyConsumerCount).toBe(1);
    expect(report.boundedExceptions).toEqual(expect.arrayContaining([
      expect.stringContaining('gpm_artifact_delivery'),
      expect.stringContaining('canonical recurring generation is disabled'),
    ]));
  });
});
