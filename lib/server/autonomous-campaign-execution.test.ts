import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = {
  listAccounts: vi.fn(),
  upsertAsset: vi.fn(),
  getJobByJobId: vi.fn(),
  createJob: vi.fn(),
};

vi.mock('./distribution-engine-repository', () => ({
  createDistributionEngineRepository: () => repo,
}));

import { dispatchPreparedSeoNewsletters } from './autonomous-campaign-execution';

describe('dispatchPreparedSeoNewsletters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one idempotent publish job and marks the loop executing', async () => {
    repo.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        account_id: 'buttondown-main',
        provider_name: 'buttondown',
        status: 'connected',
      },
    ]);
    repo.upsertAsset.mockResolvedValue({ id: 'asset-1' });
    repo.getJobByJobId.mockResolvedValue(null);
    repo.createJob.mockResolvedValue({ id: 'job-1' });

    const loopUpdates: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'content_items') {
          const query: any = {
            select: () => query,
            eq: () => query,
            in: () => query,
            order: () => query,
            limit: () => Promise.resolve({
              data: [{
                id: 'newsletter-1',
                content_id: 'seo-agent:topic:newsletter',
                title: 'Topic',
                draft_markdown: '# Topic\n\nUseful body.',
                canonical_url: '/blog/topic',
                metadata: { derived_from_canonical: true },
              }],
              error: null,
            }),
          };
          return query;
        }
        if (table === 'agent_work_loops') {
          const query: any = {
            select: () => query,
            eq: () => query,
            maybeSingle: () => Promise.resolve({
              data: { id: 'loop-1', attempt_count: 0, max_attempts: 3 },
              error: null,
            }),
            update: (payload: Record<string, unknown>) => {
              loopUpdates.push(payload);
              return query;
            },
            then: (resolve: (value: unknown) => void) => resolve({ error: null }),
          };
          return query;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await dispatchPreparedSeoNewsletters({
      supabase,
      now: new Date('2026-07-26T12:00:00.000Z'),
    });

    expect(result).toEqual({ prepared: 1, jobsCreated: 1, skippedNoAccount: 0 });
    expect(repo.createJob).toHaveBeenCalledWith(expect.objectContaining({
      distributionAssetId: 'asset-1',
      distributionAccountId: 'account-1',
      publishMode: 'publish_now',
      status: 'queued',
    }));
    expect(loopUpdates).toEqual([
      expect.objectContaining({
        state: 'executing',
        attempt_count: 1,
        founder_required: false,
      }),
    ]);
  });

  it('routes a missing newsletter connector to one explicit founder decision', async () => {
    repo.listAccounts.mockResolvedValue([]);
    const loopUpdates: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'content_items') {
          const query: any = {
            select: () => query,
            eq: () => query,
            in: () => query,
            order: () => query,
            limit: () => Promise.resolve({
              data: [{
                id: 'newsletter-1',
                content_id: 'seo-agent:topic:newsletter',
                title: 'Topic',
                draft_markdown: '# Topic',
                canonical_url: '/blog/topic',
                metadata: { derived_from_canonical: true },
              }],
              error: null,
            }),
          };
          return query;
        }
        if (table === 'agent_work_loops') {
          const query: any = {
            update: (payload: Record<string, unknown>) => {
              loopUpdates.push(payload);
              return query;
            },
            eq: () => query,
            in: () => Promise.resolve({ error: null }),
          };
          return query;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await dispatchPreparedSeoNewsletters({ supabase });

    expect(result).toEqual({ prepared: 1, jobsCreated: 0, skippedNoAccount: 1 });
    expect(loopUpdates).toEqual([
      expect.objectContaining({
        state: 'blocked',
        founder_required: true,
        blocker: expect.stringContaining('Buttondown'),
      }),
    ]);
  });
});
