import { describe, expect, it } from 'vitest';
import {
  createStartupSlackDeliveryEvent,
  disconnectStartupSlackInstallation,
  listStartupSlackDeliveryEvents,
  sendStartupSlackMessage,
  getStartupSlackDestination,
  updateStartupSlackDeliveryEventStatus,
  upsertStartupSlackDestination,
  upsertStartupSlackInstallationFromCallback,
} from './startup-slack-integration';

describe('startup slack integration helpers', () => {
  it('persists callback installation as active', async () => {
    const upserts: Array<{ payload: Record<string, unknown>; onConflict?: string }> = [];
    const supabase = {
      from(table: string) {
        if (table !== 'startup_slack_installations') throw new Error(`Unexpected table ${table}`);
        return {
          upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
            upserts.push({ payload, onConflict: options.onConflict });
            return Promise.resolve({ error: null });
          },
        };
      },
    } as any;

    await upsertStartupSlackInstallationFromCallback({
      supabase,
      startupWorkspaceId: 'ws-1',
      slackTeamId: 'T123',
      slackTeamName: 'Acme',
      slackTeamDomain: 'acme',
      connectedByUserId: 'user-1',
      metadata: { source: 'oauth' },
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.onConflict).toBe('startup_workspace_id,provider,slack_team_id');
    expect(upserts[0]?.payload.status).toBe('active');
    expect(upserts[0]?.payload.slack_team_id).toBe('T123');
  });

  it('marks installation as disconnected', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const predicates: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table !== 'startup_slack_installations') throw new Error(`Unexpected table ${table}`);
        const state: Record<string, unknown> = {};
        return {
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return this;
          },
          eq(field: string, value: unknown) {
            state[field] = value;
            if (field === 'provider') {
              predicates.push({ ...state });
              return Promise.resolve({ error: null });
            }
            return this;
          },
        };
      },
    } as any;

    await disconnectStartupSlackInstallation({
      supabase,
      startupWorkspaceId: 'ws-1',
      installationId: 'install-1',
      disconnectedByUserId: 'user-2',
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('disconnected');
    expect(predicates).toEqual([
      {
        id: 'install-1',
        startup_workspace_id: 'ws-1',
        provider: 'slack',
      },
    ]);
  });

  it('saves default destination for an active installation', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const upserts: Array<{ payload: Record<string, unknown>; onConflict?: string }> = [];
    const supabase = {
      from(table: string) {
        if (table === 'startup_slack_installations') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: { id: 'install-1', status: 'active' }, error: null });
            },
          };
        }
        if (table === 'startup_slack_destinations') {
          return {
            update(payload: Record<string, unknown>) {
              updates.push(payload);
              return this;
            },
            eq() {
              return this;
            },
            upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
              upserts.push({ payload, onConflict: options.onConflict });
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    await upsertStartupSlackDestination({
      supabase,
      startupWorkspaceId: 'ws-1',
      installationId: 'install-1',
      channelId: 'C123',
      channelName: 'geo-audits',
      isDefaultDestination: true,
      createdByUserId: 'user-1',
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ is_default: false });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.onConflict).toBe('startup_workspace_id,installation_id,channel_id');
    expect(upserts[0]?.payload.channel_id).toBe('C123');
    expect(upserts[0]?.payload.is_default).toBe(true);
  });

  it('posts message to slack chat api for active destination with token', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true, ts: '1710000000.123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const response = await sendStartupSlackMessage({
        destination: {
          id: 'dest-1',
          startupWorkspaceId: 'ws-1',
          installationId: 'inst-1',
          channelId: 'C123',
          channelName: 'geo-audits',
          status: 'active',
          isDefaultDestination: true,
          metadata: {},
          createdAt: new Date().toISOString(),
          installation: {
            id: 'inst-1',
            slackTeamId: 'T123',
            slackTeamName: 'Acme',
            status: 'active',
            metadata: { bot_access_token: 'xoxb-token' },
          },
        },
        text: 'hello world',
      });

      expect(response.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toContain('https://slack.com/api/chat.postMessage');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when slack token is missing', async () => {
    await expect(
      sendStartupSlackMessage({
        destination: {
          id: 'dest-1',
          startupWorkspaceId: 'ws-1',
          installationId: 'inst-1',
          channelId: 'C123',
          channelName: 'geo-audits',
          status: 'active',
          isDefaultDestination: true,
          metadata: {},
          createdAt: new Date().toISOString(),
          installation: {
            id: 'inst-1',
            slackTeamId: 'T123',
            slackTeamName: 'Acme',
            status: 'active',
            metadata: {},
          },
        },
        text: 'hello world',
      })
    ).rejects.toThrow('Slack installation token is missing.');
  });

  it('throws when destination is not active', async () => {
    await expect(
      sendStartupSlackMessage({
        destination: {
          id: 'dest-1',
          startupWorkspaceId: 'ws-1',
          installationId: 'inst-1',
          channelId: 'C123',
          channelName: 'geo-audits',
          status: 'paused',
          isDefaultDestination: true,
          metadata: {},
          createdAt: new Date().toISOString(),
          installation: {
            id: 'inst-1',
            slackTeamId: 'T123',
            slackTeamName: 'Acme',
            status: 'active',
            metadata: { bot_access_token: 'xoxb-token' },
          },
        },
        text: 'hello world',
      })
    ).rejects.toThrow('Slack destination is not active.');
  });

  it('creates and updates delivery events', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table !== 'startup_slack_delivery_events') throw new Error(`Unexpected table ${table}`);
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: 'evt-1' }, error: null });
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return this;
          },
          eq() {
            return this;
          },
        };
      },
    } as any;

    const created = await createStartupSlackDeliveryEvent({
      supabase,
      startupWorkspaceId: 'ws-1',
      installationId: 'inst-1',
      destinationId: 'dest-1',
      eventType: 'new_audit_ready',
      sentByUserId: 'user-1',
      payload: { test: true },
    });

    await updateStartupSlackDeliveryEventStatus({
      supabase,
      startupWorkspaceId: 'ws-1',
      deliveryEventId: created.id,
      status: 'failed',
      response: { code: 'channel_not_found' },
      errorMessage: 'channel_not_found',
    });

    expect(created.id).toBe('evt-1');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.status).toBe('queued');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('failed');
    expect(updates[0]?.error_message).toBe('channel_not_found');
  });

  it('lists delivery events in normalized shape', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'startup_slack_delivery_events') throw new Error(`Unexpected table ${table}`);
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'evt-1',
                  startup_workspace_id: 'ws-1',
                  installation_id: 'inst-1',
                  destination_id: 'dest-1',
                  event_type: 'new_audit_ready',
                  status: 'sent',
                  sent_by_user_id: 'user-1',
                  payload: { score: 80 },
                  response: { slack_ts: '1710000000.1' },
                  error_message: null,
                  created_at: '2026-04-04T10:00:00.000Z',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const rows = await listStartupSlackDeliveryEvents({
      supabase,
      startupWorkspaceId: 'ws-1',
      limit: 5,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('evt-1');
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.payload).toEqual({ score: 80 });
  });

  it('returns null destination when linked installation row is missing', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'startup_slack_destinations') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'dest-1',
                  startup_workspace_id: 'ws-1',
                  installation_id: 'inst-missing',
                  channel_id: 'C123',
                  channel_name: 'geo-audits',
                  status: 'active',
                  is_default: true,
                  metadata: {},
                  created_at: '2026-04-04T10:00:00.000Z',
                },
                error: null,
              });
            },
          };
        }
        if (table === 'startup_slack_installations') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    await expect(
      getStartupSlackDestination({
        supabase,
        startupWorkspaceId: 'ws-1',
        destinationId: 'dest-1',
      })
    ).resolves.toBeNull();
  });
});
