import { describe, expect, it } from 'vitest';
import { createDistributionEngineAdminData } from './distribution-engine-admin-data';

describe('createDistributionEngineAdminData', () => {
  it('hydrates overview rows with token, media, and attempt summaries', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'distribution_accounts') {
          return {
            select() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            then: undefined,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    supabase.from = (table: string) => {
      if (table === 'distribution_accounts') {
        return {
          select() {
            return this;
          },
          order() {
            return this;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({
              data: [
                {
                  id: 'acct-row-1',
                  account_id: 'acct_1',
                  provider_name: 'linkedin',
                  account_label: 'Founder LinkedIn',
                  external_account_id: 'urn:li:person:1',
                  status: 'connected',
                  default_audience_id: null,
                  metadata: {
                    retry_backoff_profile: 'conservative',
                    retry_backoff_multiplier: 1.5,
                  },
                  connected_by_user_id: 'user-1',
                  last_verified_at: '2026-04-02T00:00:00.000Z',
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
              ],
              error: null,
            }).then(resolve);
          },
        };
      }

      if (table === 'distribution_account_tokens') {
        return {
          select() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                {
                  distribution_account_id: 'acct-row-1',
                  expires_at: '2026-04-10T00:00:00.000Z',
                },
                {
                  distribution_account_id: 'acct-row-1',
                  expires_at: '2026-04-08T00:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      }

      if (table === 'distribution_assets') {
        return {
          select() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'asset-row-1',
                  asset_id: 'asset_1',
                  content_item_id: 'content-row-1',
                  source_type: 'content_item',
                  source_key: null,
                  asset_type: 'thread_post',
                  provider_family: 'linkedin',
                  title: 'Thread draft',
                  status: 'review',
                  cta_url: null,
                  metadata: null,
                  created_by_user_id: 'user-1',
                  approved_by_user_id: null,
                  approved_at: null,
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      }

      if (table === 'distribution_asset_media') {
        return {
          select() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                {
                  distribution_asset_id: 'asset-row-1',
                  storage_url: 'https://r2.dev/media-1.png',
                  provider_ready_status: 'ready',
                  created_at: '2026-04-02T02:00:00.000Z',
                },
                {
                  distribution_asset_id: 'asset-row-1',
                  storage_url: 'https://r2.dev/media-2.png',
                  provider_ready_status: 'pending',
                  created_at: '2026-04-02T01:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      }

      if (table === 'distribution_jobs') {
        return {
          select() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'job-row-1',
                  job_id: 'job_1',
                  distribution_asset_id: 'asset-row-1',
                  distribution_account_id: 'acct-row-1',
                  publish_mode: 'scheduled',
                  scheduled_for: '2026-04-03T00:00:00.000Z',
                  status: 'scheduled',
                  destination_url: null,
                  provider_post_id: null,
                  last_error: null,
                  created_by_user_id: 'user-1',
                  completed_at: null,
                  created_at: '2026-04-02T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      }

      if (table === 'distribution_job_attempts') {
        return {
          select() {
            return this;
          },
          order() {
            return Promise.resolve({
              data: [
                {
                  distribution_job_id: 'job-row-1',
                  error_message: 'Rate limited',
                  created_at: '2026-04-02T02:00:00.000Z',
                  response_summary: {
                    retry_scheduled_for: '2026-04-02T02:10:00.000Z',
                    retry_after_ms: 600000,
                  },
                },
                {
                  distribution_job_id: 'job-row-1',
                  error_message: null,
                  created_at: '2026-04-02T01:00:00.000Z',
                  response_summary: {},
                },
              ],
              error: null,
            });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    };

    const overview = await createDistributionEngineAdminData(supabase).getOverview();

    expect(overview.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-row-1',
        token_count: 2,
        latest_token_expiry: '2026-04-10T00:00:00.000Z',
        retry_backoff_profile: 'conservative',
        retry_backoff_multiplier: 1.5,
      }),
    ]);

    expect(overview.assets).toEqual([
      expect.objectContaining({
        id: 'asset-row-1',
        media_count: 2,
        ready_media_count: 1,
        latest_media_storage_url: 'https://r2.dev/media-1.png',
        metadata: {},
      }),
    ]);

    expect(overview.jobs).toEqual([
      expect.objectContaining({
        id: 'job-row-1',
        attempt_count: 2,
        latest_attempt_error: 'Rate limited',
        latest_retry_scheduled_for: '2026-04-02T02:10:00.000Z',
        latest_retry_after_ms: 600000,
      }),
    ]);
  });
});
