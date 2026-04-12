import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  handleStartupSlackEvent,
  verifyStartupSlackSignature,
} from './startup-slack-bot';

const mocks = vi.hoisted(() => ({
  uploadStartupSlackFile: vi.fn(),
  sendStartupSlackMessage: vi.fn(),
  listStartupSlackDestinations: vi.fn(),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const rowsByTable: Record<string, unknown[]> = {
        startup_slack_installations: [
          {
            id: 'install-1',
            startup_workspace_id: 'ws-1',
            provider: 'slack',
            slack_team_id: 'T123',
            slack_team_name: 'Acme',
            slack_team_domain: 'acme',
            status: 'active',
            metadata: { bot_access_token: 'xoxb-token' },
          },
        ],
        reports: [
          {
            id: 'report-1',
            created_at: '2026-04-01T00:00:00.000Z',
            markdown_url: 'https://files.example.com/report.md',
            pdf_url: 'https://files.example.com/report.pdf',
            scan_id: 'scan-1',
          },
        ],
      };

      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: rowsByTable[table]?.[0] ?? null,
          error: null,
        })),
        then(onfulfilled?: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(
            onfulfilled as never
          );
        },
      };

      return chain;
    }),
  })),
}));

vi.mock('./startup-slack-integration', () => ({
  listStartupSlackDestinations: mocks.listStartupSlackDestinations,
  sendStartupSlackMessage: mocks.sendStartupSlackMessage,
  uploadStartupSlackFile: mocks.uploadStartupSlackFile,
}));

describe('startup slack bot', () => {
  it('verifies Slack request signatures', () => {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
    const timestamp = '1711929600';
    const secret = 'test-secret';
    const signature = `v0=${createHmac('sha256', secret)
      .update(`v0:${timestamp}:${body}`)
      .digest('hex')}`;

    expect(
      verifyStartupSlackSignature({
        body,
        signingSecret: secret,
        slackSignature: signature,
        slackTimestamp: timestamp,
        now: () => new Date('2024-04-01T00:00:00.000Z'),
      })
    ).toBe(true);
  });

  it('uploads the latest markdown when a channel mentions the bot', async () => {
    mocks.listStartupSlackDestinations.mockResolvedValue([
      {
        id: 'dest-1',
        startupWorkspaceId: 'ws-1',
        installationId: 'install-1',
        channelId: 'C123',
        channelName: 'audits',
        status: 'active',
        isDefaultDestination: true,
        metadata: {},
        createdAt: '2026-04-01T00:00:00.000Z',
        installation: {
          id: 'install-1',
          slackTeamId: 'T123',
          slackTeamName: 'Acme',
          status: 'active',
          metadata: { bot_access_token: 'xoxb-token' },
        },
      },
    ]);
    mocks.uploadStartupSlackFile.mockResolvedValue({ ok: true, fileId: 'F123' });
    mocks.sendStartupSlackMessage.mockResolvedValue({ ok: true, timestamp: '1711929600.1' });

    const body = JSON.stringify({
      type: 'event_callback',
      team_id: 'T123',
      event: {
        type: 'app_mention',
        channel: 'C123',
        text: '<@U123> latest audit',
      },
    });
    const timestamp = '1711929600';
    const secret = 'test-secret';
    const signature = `v0=${createHmac('sha256', secret)
      .update(`v0:${timestamp}:${body}`)
      .digest('hex')}`;

    const response = await handleStartupSlackEvent({
      body,
      env: {
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        STARTUP_SLACK_SIGNING_SECRET: secret,
      },
      headers: new Headers({
        'x-slack-signature': signature,
        'x-slack-request-timestamp': timestamp,
      }),
      deps: {
        fetchImpl: vi.fn(async () => new Response('---\nmarkdown\n---', { status: 200 })) as any,
        now: () => new Date('2024-04-01T00:00:00.000Z'),
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.uploadStartupSlackFile).toHaveBeenCalledTimes(1);
    expect(mocks.sendStartupSlackMessage).not.toHaveBeenCalled();
  });
});
