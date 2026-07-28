import { describe, expect, it } from 'vitest';
import {
  canManageVisibilityScorecard,
  listVisibilityReports,
  loadVisibilityScorecard,
  readVisibilityScorecardShareToken,
  updateVisibilityScorecardSharing,
} from './visibility-scorecard-service';

type Row = Record<string, unknown>;

function makeSupabase(seed: Record<string, Row[]>) {
  const updates: Array<{ table: string; values: Row; column: string; value: string }> = [];
  return {
    updates,
    db: {
      from(table: string) {
        let filters: Array<(row: Row) => boolean> = [];
        let limitCount: number | null = null;
        let orderColumn: string | null = null;
        let ascending = true;
        const rows = () => {
          let result = [...(seed[table] ?? [])].filter((row) => filters.every((filter) => filter(row)));
          if (orderColumn) {
            result.sort((a, b) => String(a[orderColumn!] ?? '').localeCompare(String(b[orderColumn!] ?? '')));
            if (!ascending) result.reverse();
          }
          return limitCount === null ? result : result.slice(0, limitCount);
        };
        const chain: any = {
          select() {
            return chain;
          },
          eq(column: string, value: unknown) {
            filters.push((row) => row[column] === value);
            return chain;
          },
          in(column: string, values: unknown[]) {
            filters.push((row) => values.includes(row[column]));
            return chain;
          },
          order(column: string, options?: { ascending?: boolean }) {
            orderColumn = column;
            ascending = options?.ascending !== false;
            return chain;
          },
          limit(value: number) {
            limitCount = value;
            return chain;
          },
          async maybeSingle() {
            return { data: rows()[0] ?? null, error: null };
          },
          update(values: Row) {
            return {
              async eq(column: string, value: string) {
                updates.push({ table, values, column, value });
                return { error: null };
              },
            };
          },
          then(resolve: (value: { data: Row[]; error: null }) => unknown) {
            return Promise.resolve({ data: rows(), error: null }).then(resolve);
          },
        };
        return chain;
      },
    },
  };
}

describe('visibility scorecard service', () => {
  it('supports the current token and the legacy agency token without accepting legacy startup metadata', () => {
    expect(readVisibilityScorecardShareToken(
      { visibility_scorecard_share_token: 'a'.repeat(32) },
      'startup_workspace'
    )).toBe('a'.repeat(32));
    expect(readVisibilityScorecardShareToken(
      { client_summary_share_token: 'b'.repeat(32) },
      'agency_client'
    )).toBe('b'.repeat(32));
    expect(readVisibilityScorecardShareToken(
      { client_summary_share_token: 'b'.repeat(32) },
      'startup_workspace'
    )).toBeNull();
  });

  it('allows paid Business founders and paid agency operators while rejecting viewers', async () => {
    const startup = makeSupabase({
      startup_workspaces: [{ id: 'ws-1', metadata: {} }],
      startup_workspace_users: [{ startup_workspace_id: 'ws-1', user_id: 'u-1', status: 'active', role: 'founder' }],
      user_subscriptions: [{ startup_workspace_id: 'ws-1', status: 'active', bundle_key: 'startup_dev', created_at: '2026-07-01' }],
    });
    await expect(canManageVisibilityScorecard({
      supabase: startup.db,
      userId: 'u-1',
      subject: { kind: 'startup_workspace', id: 'ws-1' },
    })).resolves.toBe(true);

    const agency = makeSupabase({
      agency_clients: [{ id: 'client-1', agency_account_id: 'agency-1', metadata: {} }],
      agency_users: [
        { agency_account_id: 'agency-1', user_id: 'owner', status: 'active', role: 'owner' },
        { agency_account_id: 'agency-1', user_id: 'viewer', status: 'active', role: 'viewer' },
      ],
      user_subscriptions: [{ agency_account_id: 'agency-1', status: 'trialing', bundle_key: 'agency_core', created_at: '2026-07-01' }],
    });
    await expect(canManageVisibilityScorecard({
      supabase: agency.db,
      userId: 'owner',
      subject: { kind: 'agency_client', id: 'client-1' },
    })).resolves.toBe(true);
    await expect(canManageVisibilityScorecard({
      supabase: agency.db,
      userId: 'viewer',
      subject: { kind: 'agency_client', id: 'client-1' },
    })).resolves.toBe(false);
  });

  it('rotates and disables Business links without replacing unrelated metadata', async () => {
    const seeded = makeSupabase({
      startup_workspaces: [{
        id: 'ws-1',
        metadata: { keep: 'value', visibility_scorecard_share_token: 'a'.repeat(32) },
      }],
      startup_workspace_users: [{ startup_workspace_id: 'ws-1', user_id: 'u-1', status: 'active', role: 'admin' }],
      user_subscriptions: [{ startup_workspace_id: 'ws-1', status: 'active', bundle_key: 'startup_dev', created_at: '2026-07-01' }],
    });
    const rotated = await updateVisibilityScorecardSharing({
      supabase: seeded.db,
      userId: 'u-1',
      subject: { kind: 'startup_workspace', id: 'ws-1' },
      mode: 'rotate',
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.token).toHaveLength(32);
    expect(rotated.token).not.toBe('a'.repeat(32));
    expect(seeded.updates[0]?.values.metadata).toMatchObject({ keep: 'value' });

    const disabledDb = makeSupabase({
      startup_workspaces: [{
        id: 'ws-1',
        metadata: { keep: 'value', visibility_scorecard_share_token: 'a'.repeat(32) },
      }],
      startup_workspace_users: [{ startup_workspace_id: 'ws-1', user_id: 'u-1', status: 'active', role: 'founder' }],
      user_subscriptions: [{ startup_workspace_id: 'ws-1', status: 'active', bundle_key: 'startup_dev', created_at: '2026-07-01' }],
    });
    const disabled = await updateVisibilityScorecardSharing({
      supabase: disabledDb.db,
      userId: 'u-1',
      subject: { kind: 'startup_workspace', id: 'ws-1' },
      mode: 'disable',
    });
    expect(disabled).toMatchObject({ ok: true, token: null });
    expect(disabledDb.updates[0]?.values.metadata).toMatchObject({ keep: 'value' });
    expect(disabledDb.updates[0]?.values.metadata).not.toHaveProperty('visibility_scorecard_share_token');
  });

  it('scopes report history to the owner and returns only share-safe fields', async () => {
    const seeded = makeSupabase({
      gpm_reports: [
        {
          id: 'r-new',
          config_id: 'config-1',
          startup_workspace_id: 'ws-1',
          platform: 'perplexity',
          window_date: '2026-07',
          pdf_url: 'https://files.example/new.pdf',
          generated_at: '2026-07-20T00:00:00.000Z',
          metadata: { report_recipients: ['private@example.com'] },
        },
        {
          id: 'r-other',
          config_id: 'config-1',
          startup_workspace_id: 'ws-2',
          platform: 'chatgpt',
          window_date: '2026-07',
          pdf_url: 'https://files.example/other.pdf',
          generated_at: '2026-07-21T00:00:00.000Z',
        },
      ],
    });
    const reports = await listVisibilityReports({
      supabase: seeded.db,
      subject: { kind: 'startup_workspace', id: 'ws-1' },
      configId: 'config-1',
    });
    expect(reports).toEqual([{
      id: 'r-new',
      platform: 'perplexity',
      windowDate: '2026-07',
      pdfUrl: 'https://files.example/new.pdf',
      generatedAt: '2026-07-20T00:00:00.000Z',
    }]);
    expect(reports[0]).not.toHaveProperty('metadata');
  });
  it('fails closed for invalid and revoked public tokens', async () => {
    const active = makeSupabase({
      startup_workspaces: [{
        id: 'ws-1',
        name: 'Business',
        canonical_domain: 'example.com',
        metadata: { visibility_scorecard_share_token: 'a'.repeat(32) },
      }],
    });
    await expect(loadVisibilityScorecard({
      supabase: active.db,
      subject: { kind: 'startup_workspace', id: 'ws-1' },
      shareToken: 'wrong-token',
      reportFilesPublicBase: null,
    })).resolves.toBeNull();

    const revoked = makeSupabase({
      startup_workspaces: [{
        id: 'ws-1',
        name: 'Business',
        canonical_domain: 'example.com',
        metadata: {},
      }],
    });
    await expect(loadVisibilityScorecard({
      supabase: revoked.db,
      subject: { kind: 'startup_workspace', id: 'ws-1' },
      shareToken: 'a'.repeat(32),
      reportFilesPublicBase: null,
    })).resolves.toBeNull();
  });
});
