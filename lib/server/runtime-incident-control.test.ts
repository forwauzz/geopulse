import { describe, expect, it } from 'vitest';
import { classifyRuntimeIncidents, planRuntimeIncidentLoop } from './runtime-incident-control';

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
        data: { status: 'noop', inventory_healthy: true },
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

  it('surfaces two consecutive zero-candidate noops', () => {
    const [social] = classifyRuntimeIncidents([
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-08-12T02:00:00.000Z',
        data: { status: 'noop', candidates: 0 },
      },
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-08-12T01:00:00.000Z',
        data: { status: 'noop', candidates: 0 },
      },
    ]);
    expect(social).toMatchObject({ active: true, consecutiveFailures: 2 });
  });

  it('surfaces an inventory or required-format gap immediately', () => {
    const [social] = classifyRuntimeIncidents([{
      event: 'autonomous_campaign_execution',
      level: 'info',
      created_at: '2026-08-12T02:00:00.000Z',
      data: {
        inventoryHealthy: false,
        inventoryReason: 'missing_required_formats:instagram:short_video_post',
      },
    }]);
    expect(social).toMatchObject({
      active: true,
      reason: 'missing_required_formats:instagram:short_video_post',
    });
  });

  it('does not let zero-output noops reset repeated missing-inventory failures', () => {
    const [social] = classifyRuntimeIncidents([
      {
        event: 'autonomous_campaign_execution',
        level: 'info',
        created_at: '2026-08-12T03:00:00.000Z',
        data: { inventoryHealthy: false, inventoryReason: 'missing_required_formats:instagram:carousel_post' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-08-12T02:59:00.000Z',
        data: { status: 'noop', candidates: 48, assets_created: 0, jobs_created: 0 },
      },
      {
        event: 'autonomous_campaign_execution',
        level: 'info',
        created_at: '2026-08-12T02:00:00.000Z',
        data: { inventoryHealthy: false, inventoryReason: 'missing_required_formats:instagram:carousel_post' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-08-12T01:59:00.000Z',
        data: { status: 'created', assets_created: 1, jobs_created: 1 },
      },
    ]);

    expect(social).toMatchObject({ active: true, consecutiveFailures: 2 });
  });

  it('keeps a known daily-cap deferral owned without fabricating exhausted retries', () => {
    const [social] = classifyRuntimeIncidents([{
      event: 'autonomous_campaign_execution',
      level: 'info',
      created_at: '2026-08-26T00:05:42.000Z',
      data: {
        inventoryHealthy: false,
        inventoryReason: 'missing_required_formats:instagram:short_video_post',
        socialRetryReason: 'daily_asset_cap_reached',
        socialRetryAfter: '2026-08-26T04:00:00.000Z',
      },
    }]);

    expect(social).toMatchObject({
      active: true,
      reason: 'daily_asset_cap_reached',
      retryAfter: '2026-08-26T04:00:00.000Z',
    });
    expect(planRuntimeIncidentLoop(social!, {
      attempt_count: 3,
      max_attempts: 3,
      last_attempted_at: '2026-08-25T23:03:48.000Z',
    }, new Date('2026-08-26T00:06:00.000Z'))).toMatchObject({
      state: 'executing',
      severity: 'today',
      attemptCount: 2,
      founderRequired: false,
      blocker: null,
      dueAt: '2026-08-26T04:00:00.000Z',
    });
  });

  it('keeps a bounded Reel review backoff owned without consuming an engineering retry', () => {
    const [social] = classifyRuntimeIncidents([{
      event: 'autonomous_campaign_execution',
      level: 'info',
      created_at: '2026-08-26T20:05:42.000Z',
      data: {
        inventoryHealthy: false,
        inventoryReason: 'missing_required_formats:instagram:short_video_post',
        socialRetryReason: 'reel_review_retry_pending',
        socialRetryAfter: '2026-08-27T01:25:49.476Z',
      },
    }]);

    expect(planRuntimeIncidentLoop(social!, {
      attempt_count: 2,
      max_attempts: 3,
      last_attempted_at: '2026-08-26T19:25:49.000Z',
    }, new Date('2026-08-26T20:06:00.000Z'))).toMatchObject({
      state: 'executing',
      attemptCount: 2,
      founderRequired: false,
      dueAt: '2026-08-27T01:25:49.476Z',
    });
  });

  it('exhausts only after a newer non-deferred repair failure', () => {
    const [social] = classifyRuntimeIncidents([{
      event: 'autonomous_campaign_execution_error',
      level: 'error',
      created_at: '2026-08-26T05:05:42.000Z',
      data: { error: 'renderer_failed' },
    }]);

    expect(planRuntimeIncidentLoop(social!, {
      attempt_count: 2,
      max_attempts: 3,
      last_attempted_at: '2026-08-26T04:05:42.000Z',
    }, new Date('2026-08-26T05:06:00.000Z'))).toMatchObject({
      state: 'blocked',
      attemptCount: 3,
      founderRequired: true,
    });
  });

  it('does not downgrade a genuinely exhausted v2 lineage during a later deferral', () => {
    const [social] = classifyRuntimeIncidents([{
      event: 'autonomous_campaign_execution',
      level: 'info',
      created_at: '2026-08-26T20:05:42.000Z',
      data: {
        inventoryHealthy: false,
        socialRetryReason: 'daily_asset_cap_reached',
        socialRetryAfter: '2026-08-27T04:00:00.000Z',
      },
    }]);

    expect(planRuntimeIncidentLoop(social!, {
      attempt_count: 3,
      max_attempts: 3,
      last_attempted_at: '2026-08-26T19:05:42.000Z',
      metadata: { attempt_semantics_version: 'runtime-repair-v2' },
    }, new Date('2026-08-26T20:06:00.000Z'))).toMatchObject({
      attemptCount: 3,
      founderRequired: false,
      state: 'executing',
    });
  });

  it('surfaces repeated editorial rejection without treating one rejection as an outage', () => {
    const once = classifyRuntimeIncidents([{
      event: 'seo_editorial_cron_run',
      level: 'warning',
      created_at: '2026-08-12T01:00:00.000Z',
      data: { status: 'rejected', reason: 'missing_clean_hero' },
    }]).find((signal) => signal.definition.key === 'seo-editorial');
    expect(once?.active).toBe(false);

    const twice = classifyRuntimeIncidents([
      {
        event: 'seo_editorial_cron_run',
        level: 'warning',
        created_at: '2026-08-12T02:00:00.000Z',
        data: { status: 'rejected', reason: 'missing_clean_hero' },
      },
      {
        event: 'seo_agent_completed',
        level: 'info',
        created_at: '2026-08-12T01:30:00.000Z',
        data: { status: 'completed' },
      },
      {
        event: 'seo_editorial_cron_run',
        level: 'warning',
        created_at: '2026-08-12T01:00:00.000Z',
        data: { status: 'rejected', reason: 'missing_clean_hero' },
      },
    ]).find((signal) => signal.definition.key === 'seo-editorial');
    expect(twice).toMatchObject({ active: true, consecutiveFailures: 2 });
  });

  it('closes an editorial incident only after a newer published editorial signal', () => {
    const editorial = classifyRuntimeIncidents([
      {
        event: 'seo_editorial_cron_run',
        level: 'info',
        created_at: '2026-08-12T03:00:00.000Z',
        data: { status: 'created', contentId: 'article-1' },
      },
      {
        event: 'seo_editorial_cron_run',
        level: 'warning',
        created_at: '2026-08-12T02:00:00.000Z',
        data: { status: 'rejected', reason: 'incomplete_draft:workers_ai_empty_response' },
      },
    ]).find((signal) => signal.definition.key === 'seo-editorial');

    expect(editorial).toMatchObject({
      active: false,
      latestSuccessAt: '2026-08-12T03:00:00.000Z',
    });
  });
});
