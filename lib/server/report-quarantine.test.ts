import { describe, expect, it } from 'vitest';
import {
  isClientReportSharingHeld,
  isReportDeliveryHeld,
  isReportQuarantined,
  releaseClientReportHold,
} from './report-quarantine';

describe('releasing a client review hold', () => {
  const actor = { userId: '20000000-0000-4000-8000-000000000009', at: '2026-08-05T00:00:00.000Z' };
  const held = {
    report_quarantine_hold: {
      status: 'held_onboarding_review',
      reason: 'First client artifact stays private until the agency explicitly releases it.',
      held_at: '2026-08-01T00:00:00.000Z',
      held_by_user_id: '20000000-0000-4000-8000-000000000001',
    },
    client_summary_share_token: 'existing-token',
  };

  it('opens sharing and records who decided it', () => {
    const released = releaseClientReportHold(held, actor);
    expect(released && isClientReportSharingHeld(released)).toBe(false);
    expect(released?.['report_quarantine_hold']).toMatchObject({
      status: 'released',
      released_by_user_id: actor.userId,
      released_at: actor.at,
    });
  });

  it('keeps why the client was held, so anything published later stays auditable', () => {
    const released = releaseClientReportHold(held, actor);
    expect(released?.['report_quarantine_hold']).toMatchObject({
      previous_status: 'held_onboarding_review',
      reason: 'First client artifact stays private until the agency explicitly releases it.',
      held_at: '2026-08-01T00:00:00.000Z',
      held_by_user_id: '20000000-0000-4000-8000-000000000001',
    });
  });

  it('leaves unrelated client metadata untouched', () => {
    expect(releaseClientReportHold(held, actor)?.['client_summary_share_token']).toBe('existing-token');
  });

  it('refuses to manufacture a release for a client that was never held', () => {
    expect(releaseClientReportHold({}, actor)).toBeNull();
    expect(releaseClientReportHold({ report_quarantine_hold: { status: 'released' } }, actor)).toBeNull();
    expect(releaseClientReportHold(null, actor)).toBeNull();
  });

  it('does not re-release an already released client, so the first actor is preserved', () => {
    const once = releaseClientReportHold(held, actor)!;
    const twice = releaseClientReportHold(once, { userId: 'someone-else', at: '2026-09-01T00:00:00.000Z' });
    expect(twice).toBeNull();
  });
});

describe('report quarantine', () => {
  it('projects a released client-review report as ready without rewriting its history', () => {
    const historicalReport = {
      email_status: 'held_client_review',
      delivery_blocked: true,
      delivery_block_reason: 'client_report_sharing_held',
    };
    expect(isReportDeliveryHeld(historicalReport, {
      report_quarantine_hold: { status: 'released' },
    })).toBe(false);
    expect(isReportDeliveryHeld(historicalReport, {
      report_quarantine_hold: { status: 'held_onboarding_review' },
    })).toBe(true);
  });

  it('keeps unrelated delivery holds fail closed after client release', () => {
    const releasedClient = { report_quarantine_hold: { status: 'released' } };
    expect(isReportDeliveryHeld({
      email_status: 'held_delivery_disabled',
      delivery_blocked: true,
      delivery_block_reason: 'provider_disabled',
    }, releasedClient)).toBe(true);
    expect(isReportDeliveryHeld({
      email_status: 'generated',
      delivery_blocked: true,
      delivery_block_reason: 'integrity_review',
    }, releasedClient)).toBe(true);
  });

  it('fails closed only for the explicit audited quarantine marker', () => {
    expect(isReportQuarantined({ quarantine_status: 'quarantined' })).toBe(true);
    expect(isReportQuarantined({ quarantine_status: 'released' })).toBe(false);
    expect(isReportQuarantined({})).toBe(false);
    expect(isReportQuarantined(null)).toBe(false);
  });

  it('keeps public sharing off while an explicit client review hold is active', () => {
    expect(isClientReportSharingHeld({
      report_quarantine_hold: { status: 'held_pending_independent_review' },
    })).toBe(true);
    expect(isClientReportSharingHeld({ report_quarantine_hold: { status: 'held' } })).toBe(true);
    expect(isClientReportSharingHeld({ report_quarantine_hold: { status: 'released' } })).toBe(false);
    expect(isClientReportSharingHeld({})).toBe(false);
    expect(isClientReportSharingHeld(null)).toBe(false);
  });
});
