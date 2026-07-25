import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadAdminActionContext: vi.fn(),
  checkIntelligenceRateLimit: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/server/admin-runtime', () => ({
  loadAdminActionContext: mocks.loadAdminActionContext,
}));
vi.mock('@/lib/server/intelligence-rate-limit', () => ({
  checkIntelligenceRateLimit: mocks.checkIntelligenceRateLimit,
}));
vi.mock('@/lib/intelligence/reasoning-repository', () => ({
  SupabaseReasoningFactReader: class {},
}));
vi.mock('@/lib/intelligence/reasoning', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/intelligence/reasoning')>();
  return {
    ...original,
    createReasoningService: () => ({ execute: mocks.execute }),
  };
});

import { POST } from './route';

describe('POST /api/internal/intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkIntelligenceRateLimit.mockResolvedValue({ ok: true });
    mocks.loadAdminActionContext.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1' },
      env: { SCAN_CACHE: {} },
      adminDb: {},
    });
    mocks.execute.mockResolvedValue({
      contractVersion: 'intelligence-reasoning-v1',
      capability: 'domain_timeline',
      status: 'ready',
      finding: 'Citation rate was 0.5.',
      confidence: 0.8,
      evidenceIds: ['ev-1'],
      compatibleRunIds: ['run-1'],
      policyVersion: 'policy-v1',
      promptVersion: null,
      provider: 'deterministic',
      modelVersion: null,
      limitations: ['One compatible measurement.'],
      recommendedAction: 'inspect_source_evidence',
    });
  });

  it('requires a platform-admin session', async () => {
    mocks.loadAdminActionContext.mockResolvedValue({ ok: false, message: 'denied' });
    const response = await POST(new Request('https://example.test/api/internal/intelligence', {
      method: 'POST',
      body: '{}',
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rate bounds each authenticated actor before reading facts', async () => {
    mocks.checkIntelligenceRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 60 });
    const response = await POST(new Request('https://example.test/api/internal/intelligence', {
      method: 'POST',
      body: '{}',
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(await response.json()).toMatchObject({ error: 'rate_limited' });
  });

  it('returns the stable private contract for a valid read-only request', async () => {
    const response = await POST(new Request('https://example.test/api/internal/intelligence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capability: 'domain_timeline',
        canonicalDomainId: '0ca1e070-fc7f-497a-a9d8-a78f54170d22',
      }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Reasoning-Contract')).toBe('intelligence-reasoning-v1');
    expect(await response.json()).toMatchObject({
      contractVersion: 'intelligence-reasoning-v1',
      evidenceIds: ['ev-1'],
    });
  });
});
