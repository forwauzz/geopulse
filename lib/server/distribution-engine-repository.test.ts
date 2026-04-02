import { describe, expect, it } from 'vitest';
import { createDistributionEngineRepository } from './distribution-engine-repository';

function createMaybeSingleBuilder(response: { data: unknown; error: unknown }) {
  return {
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(response);
    },
  };
}

function createSingleSelectBuilder(response: { data: unknown; error: unknown }) {
  return {
    select() {
      return this;
    },
    single() {
      return Promise.resolve(response);
    },
  };
}

describe('createDistributionEngineRepository', () => {
  it('upserts accounts with merged metadata and normalized ids', async () => {
    const tableCalls: string[] = [];
    let onConflictValue: string | null = null;
    let upsertPayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        tableCalls.push(table);

        if (table === 'distribution_accounts' && tableCalls.length === 1) {
          return {
            select() {
              return createMaybeSingleBuilder({
                data: {
                  id: 'acct-row-1',
                  account_id: 'acct_1',
                  provider_name: 'linkedin',
                  account_label: 'Founder LinkedIn',
                  external_account_id: 'urn:li:person:123',
                  status: 'connected',
                  default_audience_id: null,
                  metadata: { existing: true },
                  connected_by_user_id: 'user-1',
                  last_verified_at: '2026-04-02T00:00:00.000Z',
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
                error: null,
              });
            },
          };
        }

        if (table === 'distribution_accounts' && tableCalls.length === 2) {
          return {
            upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
              upsertPayload = payload;
              onConflictValue = options.onConflict;
              return createSingleSelectBuilder({
                data: {
                  id: 'acct-row-1',
                  account_id: 'acct_1',
                  provider_name: 'linkedin',
                  account_label: 'Founder LinkedIn',
                  external_account_id: 'urn:li:person:123',
                  status: 'connected',
                  default_audience_id: 'aud-1',
                  metadata: { existing: true, source: 'admin' },
                  connected_by_user_id: 'user-1',
                  last_verified_at: '2026-04-02T00:00:00.000Z',
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T01:00:00.000Z',
                },
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table call for ${table}`);
      },
    } as any;

    const repo = createDistributionEngineRepository(supabase);
    const row = await repo.upsertAccount({
      accountId: ' acct_1 ',
      providerName: 'linkedin',
      accountLabel: ' Founder LinkedIn ',
      externalAccountId: ' urn:li:person:123 ',
      defaultAudienceId: ' aud-1 ',
      metadata: { source: 'admin' },
    });

    expect(onConflictValue).toBe('account_id');
    expect(upsertPayload).toMatchObject({
      account_id: 'acct_1',
      provider_name: 'linkedin',
      account_label: 'Founder LinkedIn',
      external_account_id: 'urn:li:person:123',
      status: 'connected',
      default_audience_id: 'aud-1',
      metadata: { existing: true, source: 'admin' },
      connected_by_user_id: 'user-1',
    });
    expect(row.metadata).toEqual({ existing: true, source: 'admin' });
  });

  it('upserts assets while preserving existing metadata and approval state', async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    let accountCallCount = 0;

    const supabase = {
      from(table: string) {
        if (table === 'distribution_assets') {
          accountCallCount += 1;

          if (accountCallCount === 1) {
            return {
              select() {
                return createMaybeSingleBuilder({
                  data: {
                    id: 'asset-row-1',
                    asset_id: 'asset_1',
                    content_item_id: 'content-row-1',
                    source_type: 'content_item',
                    source_key: null,
                    asset_type: 'thread_post',
                    provider_family: 'linkedin',
                    title: 'Original',
                    body_markdown: 'Body',
                    body_plaintext: 'Body',
                    caption_text: 'Caption',
                    status: 'review',
                    cta_url: 'https://getgeopulse.com',
                    metadata: { original: true },
                    created_by_user_id: 'user-1',
                    approved_by_user_id: 'user-2',
                    approved_at: '2026-04-02T01:00:00.000Z',
                    created_at: '2026-04-02T00:00:00.000Z',
                    updated_at: '2026-04-02T01:00:00.000Z',
                  },
                  error: null,
                });
              },
            };
          }

          return {
            upsert(payload: Record<string, unknown>) {
              upsertPayload = payload;
              return createSingleSelectBuilder({
                data: {
                  id: 'asset-row-1',
                  asset_id: 'asset_1',
                  content_item_id: 'content-row-1',
                  source_type: 'content_item',
                  source_key: null,
                  asset_type: 'thread_post',
                  provider_family: 'linkedin',
                  title: 'Refined',
                  body_markdown: '## Refined',
                  body_plaintext: null,
                  caption_text: null,
                  status: 'approved',
                  cta_url: 'https://getgeopulse.com',
                  metadata: { original: true, revision: 2 },
                  created_by_user_id: 'user-1',
                  approved_by_user_id: 'user-2',
                  approved_at: '2026-04-02T01:00:00.000Z',
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T02:00:00.000Z',
                },
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const repo = createDistributionEngineRepository(supabase);
    const row = await repo.upsertAsset({
      assetId: 'asset_1',
      assetType: 'thread_post',
      providerFamily: 'linkedin',
      title: 'Refined',
      bodyMarkdown: '## Refined',
      status: 'approved',
      metadata: { revision: 2 },
    });

    expect(upsertPayload).toMatchObject({
      asset_id: 'asset_1',
      content_item_id: 'content-row-1',
      source_type: 'content_item',
      status: 'approved',
      metadata: { original: true, revision: 2 },
      approved_by_user_id: 'user-2',
      approved_at: '2026-04-02T01:00:00.000Z',
    });
    expect(row.metadata).toEqual({ original: true, revision: 2 });
  });

  it('replaces media and defaults sort order by input order', async () => {
    let deletedAssetId: string | null = null;
    let insertPayload: Array<Record<string, unknown>> | null = null;

    const supabase = {
      from(table: string) {
        if (table === 'distribution_asset_media') {
          return {
            delete() {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('distribution_asset_id');
                  deletedAssetId = value;
                  return Promise.resolve({ error: null });
                },
              };
            },
            insert(payload: Array<Record<string, unknown>>) {
              insertPayload = payload;
              return {
                select() {
                  return Promise.resolve({
                    data: [
                      {
                        id: 'media-1',
                        distribution_asset_id: 'asset-row-1',
                        media_kind: 'image',
                        storage_url: 'https://r2.dev/a.png',
                        mime_type: 'image/png',
                        alt_text: 'Alt',
                        caption: null,
                        sort_order: 0,
                        provider_ready_status: 'pending',
                        metadata: null,
                        created_at: '2026-04-02T00:00:00.000Z',
                        updated_at: '2026-04-02T00:00:00.000Z',
                      },
                      {
                        id: 'media-2',
                        distribution_asset_id: 'asset-row-1',
                        media_kind: 'thumbnail',
                        storage_url: 'https://r2.dev/b.png',
                        mime_type: null,
                        alt_text: null,
                        caption: 'B',
                        sort_order: 3,
                        provider_ready_status: 'ready',
                        metadata: { cover: true },
                        created_at: '2026-04-02T00:00:00.000Z',
                        updated_at: '2026-04-02T00:00:00.000Z',
                      },
                    ],
                    error: null,
                  });
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const repo = createDistributionEngineRepository(supabase);
    const rows = await repo.replaceAssetMedia('asset-row-1', [
      {
        mediaKind: 'image',
        storageUrl: ' https://r2.dev/a.png ',
        mimeType: ' image/png ',
        altText: ' Alt ',
      },
      {
        mediaKind: 'thumbnail',
        storageUrl: 'https://r2.dev/b.png',
        caption: ' B ',
        sortOrder: 3,
        providerReadyStatus: 'ready',
        metadata: { cover: true },
      },
    ]);

    expect(deletedAssetId).toBe('asset-row-1');
    expect(insertPayload).toEqual([
      {
        distribution_asset_id: 'asset-row-1',
        media_kind: 'image',
        storage_url: 'https://r2.dev/a.png',
        mime_type: 'image/png',
        alt_text: 'Alt',
        caption: null,
        sort_order: 0,
        provider_ready_status: 'pending',
        metadata: {},
      },
      {
        distribution_asset_id: 'asset-row-1',
        media_kind: 'thumbnail',
        storage_url: 'https://r2.dev/b.png',
        mime_type: null,
        alt_text: null,
        caption: 'B',
        sort_order: 3,
        provider_ready_status: 'ready',
        metadata: { cover: true },
      },
    ]);
    expect(rows[0]?.metadata).toEqual({});
    expect(rows[1]?.metadata).toEqual({ cover: true });
  });

  it('lists dispatchable jobs with the expected status and schedule filters', async () => {
    let statusFilter: unknown[] | null = null;
    let orFilter: string | null = null;
    let limitValue: number | null = null;

    const supabase = {
      from(table: string) {
        expect(table).toBe('distribution_jobs');
        return {
          select() {
            return this;
          },
          in(column: string, value: unknown[]) {
            expect(column).toBe('status');
            statusFilter = value;
            return this;
          },
          or(value: string) {
            orFilter = value;
            return this;
          },
          order() {
            return this;
          },
          limit(value: number) {
            limitValue = value;
            return Promise.resolve({
              data: [
                {
                  id: 'job-row-1',
                  job_id: 'job_1',
                  distribution_asset_id: 'asset-row-1',
                  distribution_account_id: 'acct-row-1',
                  publish_mode: 'scheduled',
                  scheduled_for: '2026-04-02T08:00:00.000Z',
                  status: 'scheduled',
                  destination_url: null,
                  provider_post_id: null,
                  last_error: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  created_at: '2026-04-02T07:00:00.000Z',
                  updated_at: '2026-04-02T07:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const repo = createDistributionEngineRepository(supabase);
    const rows = await repo.listDispatchableJobs({
      now: '2026-04-02T09:00:00.000Z',
      limit: 5,
    });

    expect(statusFilter).toEqual(['queued', 'scheduled']);
    expect(orFilter).toBe('scheduled_for.is.null,scheduled_for.lte.2026-04-02T09:00:00.000Z');
    expect(limitValue).toBe(5);
    expect(rows[0]?.job_id).toBe('job_1');
  });

  it('creates job attempts with normalized request and response summaries', async () => {
    let insertPayload: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        expect(table).toBe('distribution_job_attempts');
        return {
          insert(payload: Record<string, unknown>) {
            insertPayload = payload;
            return createSingleSelectBuilder({
              data: {
                id: 'attempt-1',
                distribution_job_id: 'job-row-1',
                attempt_number: 2,
                request_summary: null,
                response_summary: { accepted: false },
                provider_status_code: 429,
                error_message: 'Rate limited',
                created_at: '2026-04-02T00:00:00.000Z',
              },
              error: null,
            });
          },
        };
      },
    } as any;

    const repo = createDistributionEngineRepository(supabase);
    const row = await repo.createJobAttempt({
      distributionJobId: 'job-row-1',
      attemptNumber: 2,
      responseSummary: { accepted: false },
      providerStatusCode: 429,
      errorMessage: 'Rate limited',
    });

    expect(insertPayload).toEqual({
      distribution_job_id: 'job-row-1',
      attempt_number: 2,
      request_summary: {},
      response_summary: { accepted: false },
      provider_status_code: 429,
      error_message: 'Rate limited',
    });
    expect(row.request_summary).toEqual({});
    expect(row.response_summary).toEqual({ accepted: false });
  });
});
