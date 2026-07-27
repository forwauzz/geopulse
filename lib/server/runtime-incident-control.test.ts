import { describe, expect, it } from 'vitest';
import { classifyRuntimeIncidents } from './runtime-incident-control';

describe('runtime incident control', () => {
  it('opens a production incident when the latest runtime signals are failures', () => {
    const [social] = classifyRuntimeIncidents([
      {
        event: 'social_proof_agent_run',
        level: 'error',
        created_at: '2026-07-27T10:00:00.000Z',
        data: { status: 'failed', reason: 'timeout' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'error',
        created_at: '2026-07-27T09:00:00.000Z',
        data: { status: 'failed', reason: 'timeout' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-07-27T08:00:00.000Z',
        data: { status: 'created' },
      },
    ]);
    expect(social).toMatchObject({
      active: true,
      consecutiveFailures: 2,
      latestFailureAt: '2026-07-27T10:00:00.000Z',
      reason: 'timeout',
    });
  });

  it('closes only after a newer success signal', () => {
    const [social] = classifyRuntimeIncidents([
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-07-27T11:00:00.000Z',
        data: { status: 'noop' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'error',
        created_at: '2026-07-27T10:00:00.000Z',
        data: { status: 'failed', reason: 'timeout' },
      },
    ]);
    expect(social).toMatchObject({
      active: false,
      consecutiveFailures: 0,
      latestSuccessAt: '2026-07-27T11:00:00.000Z',
    });
  });

  it('does not treat entitlement blocks as engineering failures', () => {
    const signals = classifyRuntimeIncidents([
      {
        event: 'gpm_client_run_blocked',
        level: 'warning',
        created_at: '2026-07-27T10:00:00.000Z',
        data: { violations: 'plan limit' },
      },
    ]);
    expect(signals.every((signal) => !signal.active)).toBe(true);
  });

  it('groups render failures with the social production recovery signal', () => {
    const [social] = classifyRuntimeIncidents([
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-07-27T11:00:00.000Z',
        data: { status: 'created' },
      },
      {
        event: 'jordan_media_render_failed',
        level: 'error',
        created_at: '2026-07-27T10:00:00.000Z',
        data: { reason: 'browser_render_http_422' },
      },
    ]);
    expect(social?.active).toBe(false);
  });
});
