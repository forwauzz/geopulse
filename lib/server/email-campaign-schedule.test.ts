import { describe, expect, it, vi } from 'vitest';
import { createDraftContract, versionChecksum, type EmailCampaignV1 } from './email-campaign-contract';
import { audienceChecksum } from './campaign-audience';
import {
  CAMPAIGN_FROM_ENV_KEY,
  CAMPAIGN_REPLY_TO_ENV_KEY,
  CAMPAIGN_SENDER_VERIFIED_ENV_KEY,
} from './email-campaign-sender';
import {
  buildScheduleRows,
  canSendNextStep,
  nextSequenceStop,
  plannedSendTimes,
  scheduleCampaign,
  sendIdempotencyKey,
  sendInternalTest,
  stopCampaign,
  type SequenceState,
} from './email-campaign-schedule';
import { isOutreachStopped, normalizeOutreachLifecycleStatus } from './outreach-sequence';
import type { PreflightRecipient } from './email-campaign-preflight';
import type { PreviewContact } from './email-campaign-preview';

vi.mock('./outreach', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./outreach')>();
  return {
    ...actual,
    sendOutreachEmail: vi.fn(async () => ({ ok: true as const, providerMessageId: 'prov-1' })),
  };
});

const { sendOutreachEmail } = await import('./outreach');

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const START = '2026-08-10T13:00:00.000Z';

const MEMBERS = Array.from({ length: 3 }, (_, index) => ({
  contact_id: `c${String(index)}`, email: `owner${String(index)}@royco.ca`, position: index + 1,
}));
const REAL_CHECKSUM = audienceChecksum(
  MEMBERS.map((member) => ({ contactId: member.contact_id, email: member.email, position: member.position })),
);

const AUTH_ENV = {
  [CAMPAIGN_FROM_ENV_KEY]: 'elena@getgeopulse.com',
  [CAMPAIGN_REPLY_TO_ENV_KEY]: 'elena@getgeopulse.com',
  [CAMPAIGN_SENDER_VERIFIED_ENV_KEY]: 'true',
  GEOPULSE_CAMPAIGN_TEST_RECIPIENTS: 'qa@getgeopulse.com',
  RESEND_API_KEY: 'test-key',
  RESEND_FROM_EMAIL: 'elena@getgeopulse.com',
  NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
};

function contract(overrides: Partial<EmailCampaignV1> = {}): EmailCampaignV1 {
  const base = createDraftContract({
    campaignId: 'camp-1',
    interventionId: 'int-1',
    interventionKey: 'agency-reporting-montreal-v1',
    goal: {
      objective: 'o', buyer: 'b', offerKey: 'k', ctaGoal: 'c', owner: 'elena',
      meaningfulVariable: 'm', successCondition: 's', stopCondition: 'x',
      closureCondition: 'reply, unsubscribe, disqualification, conversion, or completion', retryPolicy: 'r',
    },
    sender: {
      displayName: 'Elena at GEO-Pulse',
      fromAddressRef: CAMPAIGN_FROM_ENV_KEY,
      replyToRef: CAMPAIGN_REPLY_TO_ENV_KEY,
      authenticated: true,
      authenticationEvidence: 'verified',
    },
    segment: 'agency-ca-qc-montreal-published-2026-08',
    content: {
      templateId: null, templateVersion: 1,
      subject: 'AI visibility baseline for {{company}}',
      previewText: 'One client domain is enough.',
      bodyFormat: 'text',
      bodyTemplate: 'Hi {{name}},\n\nReply with one client domain: {{walkthrough_url}}',
      followUpSteps: [
        { subject: 'Re: follow-up', previewText: 'Still happy to run one.', bodyTemplate: 'Hi {{name}}, following up once.' },
        { subject: 'Closing the loop', previewText: 'Last note.', bodyTemplate: 'Hi {{name}}, last note on this.' },
      ],
    },
    tracking: { tags: [], utmSource: 'outreach', utmMedium: 'email', utmCampaign: 'agency-reporting-montreal-v1', utmContent: 'agency-reporting', utmTerm: null },
    schedule: { timezone: 'America/Toronto', sendWindowStartHour: 9, sendWindowEndHour: 17, startAt: START, spacingMinutes: 15, dailyCap: 25, maxSequenceSteps: 3, sequenceDelaysDays: [0, 4, 10] },
    nowIso: '2026-08-02T00:00:00.000Z',
  });
  const withAudience: EmailCampaignV1 = {
    ...base,
    audience: { segment: base.audience.segment, audienceId: 'aud-1', checksum: REAL_CHECKSUM, recipientCount: 3, frozenAt: '2026-08-02T00:00:00.000Z', excludedCounts: {} },
  };
  return {
    ...withAudience,
    governance: { ...withAudience.governance, testAcceptedAt: '2026-08-02T10:00:00.000Z', testVersionChecksum: versionChecksum(withAudience) },
    ...overrides,
  };
}

function recipients(): PreflightRecipient[] {
  return MEMBERS.map((member, index) => ({
    contactId: member.contact_id,
    email: member.email,
    name: `Owner ${String(index)}`,
    company: 'Roy Co',
    companyDomain: 'royco.ca',
    personalizationReason: null,
    personalizationSourceUrl: null,
    eligibilityStatus: 'eligible',
  }));
}

const SAMPLE_CONTACT: PreviewContact = {
  contactId: 'c0', email: 'owner0@royco.ca', name: 'Owner 0', company: 'Roy Co',
  companyDomain: 'royco.ca', personalizationReason: null, personalizationSourceUrl: null,
};

describe('idempotency keys', () => {
  it('are unique per version, contact, and step', () => {
    const key = sendIdempotencyKey({ interventionKey: 'k', campaignVersion: 1, contactId: 'c1', sequenceStep: 1 });
    expect(key).toBe('k@v1:c1:step-1');
    expect(sendIdempotencyKey({ interventionKey: 'k', campaignVersion: 1, contactId: 'c1', sequenceStep: 2 })).not.toBe(key);
    expect(sendIdempotencyKey({ interventionKey: 'k', campaignVersion: 2, contactId: 'c1', sequenceStep: 1 })).not.toBe(key);
  });
});

describe('staggering', () => {
  it('spaces first sends evenly from the chosen start', () => {
    expect(plannedSendTimes('2026-08-10T13:00:00.000Z', 3, 15)).toEqual([
      '2026-08-10T13:00:00.000Z',
      '2026-08-10T13:15:00.000Z',
      '2026-08-10T13:30:00.000Z',
    ]);
  });

  it('produces the exact expected rows in a deterministic order', () => {
    const rows = buildScheduleRows({ contract: contract(), recipients: recipients() });
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.idempotencyKey)).toEqual([
      'agency-reporting-montreal-v1@v1:c0',
      'agency-reporting-montreal-v1@v1:c1',
      'agency-reporting-montreal-v1@v1:c2',
    ]);
    expect(rows[2]?.nextRunAt).toBe('2026-08-10T13:30:00.000Z');
    expect(rows[0]?.url).toBe('https://royco.ca');
  });
});

describe('internal test', () => {
  const save = vi.fn(async () => ({ ok: true }));
  const supabase = {} as never;

  it('refuses a recipient that is not on the configured allowlist', async () => {
    const result = await sendInternalTest({
      supabase, env: AUTH_ENV, contract: contract(), recipient: 'someone@aprospect.ca',
      sampleContact: SAMPLE_CONTACT, nowMs: NOW, save,
    });
    expect(result).toEqual({ ok: false, reason: 'someone@aprospect.ca is not on the configured internal test allowlist' });
  });

  it('refuses when no allowlist is configured at all', async () => {
    const result = await sendInternalTest({
      supabase, env: { ...AUTH_ENV, GEOPULSE_CAMPAIGN_TEST_RECIPIENTS: '' },
      contract: contract(), recipient: 'qa@getgeopulse.com', sampleContact: SAMPLE_CONTACT, nowMs: NOW, save,
    });
    expect(result).toEqual({ ok: false, reason: 'no internal test recipients are configured' });
  });

  it('refuses without an authenticated sender', async () => {
    const result = await sendInternalTest({
      supabase, env: { GEOPULSE_CAMPAIGN_TEST_RECIPIENTS: 'qa@getgeopulse.com' },
      contract: contract(), recipient: 'qa@getgeopulse.com', sampleContact: SAMPLE_CONTACT, nowMs: NOW, save,
    });
    expect(result.ok).toBe(false);
  });

  it('refuses when personalization does not resolve', async () => {
    const result = await sendInternalTest({
      supabase, env: AUTH_ENV, contract: contract(), recipient: 'qa@getgeopulse.com',
      sampleContact: { ...SAMPLE_CONTACT, name: null }, nowMs: NOW, save,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('personalization does not resolve');
  });

  it('attaches an accepted test to the exact version checksum and records nothing else', async () => {
    const saved: EmailCampaignV1[] = [];
    const result = await sendInternalTest({
      supabase, env: AUTH_ENV, contract: contract(), recipient: 'qa@getgeopulse.com',
      sampleContact: SAMPLE_CONTACT, nowMs: NOW,
      save: async (updated) => { saved.push(updated); return { ok: true }; },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.checksum).toBe(versionChecksum(contract()));

    const stored = saved[0]!;
    expect(stored.governance.testVersionChecksum).toBe(versionChecksum(contract()));
    expect(stored.governance.testRecipients).toEqual(['qa@getgeopulse.com']);
    // No send row, no enrollment, no sequence advance: a test cannot appear in campaign metrics.
    expect(stored.audience.recipientCount).toBe(3);
    expect(stored.governance.scheduledAt).toBeNull();

    const call = vi.mocked(sendOutreachEmail).mock.calls.at(-1)!;
    expect(call[1]).toBe('qa@getgeopulse.com');
    expect(call[2]).toContain('[TEST]');
    expect(call[4]).toContain(versionChecksum(contract()));
    expect(call[5]).toEqual({
      from: 'elena@getgeopulse.com',
      replyTo: 'elena@getgeopulse.com',
    });
  });

  it('does not accept a test when its version evidence cannot be saved', async () => {
    const result = await sendInternalTest({
      supabase, env: AUTH_ENV, contract: contract(), recipient: 'qa@getgeopulse.com',
      sampleContact: SAMPLE_CONTACT, nowMs: NOW, save: async () => ({ ok: false }),
    });
    expect(result).toEqual({ ok: false, reason: 'internal_test_evidence_save_failed' });
  });
});

// ── Scheduling against a stubbed database ───────────────────────────────────────

function stubSupabase(options: {
  existingKeys?: string[];
  prospectId?: string;
  prospectFailureAt?: number;
  enrollmentFailureAt?: number;
} = {}) {
  const writes: { table: string; op: string; payload: any }[] = [];
  let prospectWrites = 0;
  let enrollmentWrites = 0;

  function query(rows: unknown[], single?: unknown, error: { message: string; code?: string } | null = null): any {
    const builder: any = Promise.resolve({ data: rows, error });
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.limit = () => builder;
    // Evidence reads are paginated; the stub answers a range with the whole (small) fixture.
    builder.range = () => builder;
    builder.order = () => builder;
    builder.select = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: single ?? null, error });
    builder.single = () => Promise.resolve({ data: single ?? null, error });
    return builder;
  }

  const supabase = {
    from(table: string) {
      return {
        select: () => {
          if (table === 'outreach_campaign_audiences') {
            return query([], { checksum: REAL_CHECKSUM, recipient_count: MEMBERS.length });
          }
          if (table === 'outreach_campaign_audience_members') return query(MEMBERS);
          if (table === 'outreach_contacts') {
            return {
              in: (column: string) => query(column === 'id'
                ? recipients().map((r) => ({
                    id: r.contactId, email: r.email, name: r.name, company: r.company,
                    company_domain: r.companyDomain, eligibility_status: 'eligible',
                    personalization_reason: null, personalization_source_url: null,
                  }))
                : []),
              eq: () => query([]),
              limit: () => query([]),
            };
          }
          if (table === 'outreach_campaign_enrollments') {
            return query((options.existingKeys ?? []).map((key) => ({ idempotency_key: key })));
          }
          return query([]);
        },
        insert(payload: any) {
          writes.push({ table, op: 'insert', payload });
          if (table === 'outreach_campaign_enrollments') {
            enrollmentWrites += 1;
            if (options.enrollmentFailureAt === enrollmentWrites) {
              return query([], null, { message: 'enrollment write failed', code: 'XX000' });
            }
          }
          return query([], { id: 'row-1' });
        },
        upsert(payload: any) {
          writes.push({ table, op: 'upsert', payload });
          if (table === 'outreach_prospects') {
            prospectWrites += 1;
            if (options.prospectFailureAt === prospectWrites) {
              return query([], null, { message: 'prospect write failed', code: 'XX000' });
            }
          }
          return query([], { id: options.prospectId ?? 'prospect-1' });
        },
        update(payload: any) {
          writes.push({ table, op: 'update', payload });
          return query([]);
        },
      };
    },
  } as never;

  return { supabase, writes };
}

describe('scheduling', () => {
  it('refuses on any failed gate, writes no rows, and records the failures', async () => {
    const { supabase, writes } = stubSupabase();
    const saved: EmailCampaignV1[] = [];
    const outcome = await scheduleCampaign({
      supabase,
      env: {}, // no authenticated sender
      contract: contract(),
      nowMs: NOW,
      save: async (updated) => { saved.push(updated); return { ok: true }; },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('preflight_failed');
    expect(writes.filter((write) => write.op !== 'update')).toEqual([]);
    expect(saved[0]?.governance.preflightPassedAt).toBeNull();
    expect(saved[0]?.governance.preflightFailures.some((failure) => failure.startsWith('sender_authenticated'))).toBe(true);
    expect(saved[0]?.state).toBe('draft');
  });

  it('refuses when the campaign was edited after its last accepted test', async () => {
    const { supabase } = stubSupabase();
    const edited = contract();
    const outcome = await scheduleCampaign({
      supabase,
      env: AUTH_ENV,
      contract: { ...edited, content: { ...edited.content, subject: 'A different subject' } },
      nowMs: NOW,
      save: async () => ({ ok: true }),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.preflight.failures.some((failure) => failure.startsWith('internal_test_accepted'))).toBe(true);
  });

  it('writes the exact expected rows and calendar-visible schedule without sending', async () => {
    const { supabase, writes } = stubSupabase();
    const saved: EmailCampaignV1[] = [];
    vi.mocked(sendOutreachEmail).mockClear();

    const outcome = await scheduleCampaign({
      supabase, env: AUTH_ENV, contract: contract(), nowMs: NOW,
      save: async (updated) => { saved.push(updated); return { ok: true }; },
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.enrolled).toBe(3);

    const prospects = writes.filter((write) => write.table === 'outreach_prospects');
    const enrollments = writes.filter((write) => write.table === 'outreach_campaign_enrollments');
    expect(prospects).toHaveLength(3);
    expect(enrollments).toHaveLength(3);

    expect(prospects[0]?.payload).toMatchObject({
      email: 'owner0@royco.ca',
      enabled: true,
      lifecycle_status: 'active',
      sequence_step: 1,
      max_sequence_steps: 3,
      sequence_delays_days: [0, 4, 10],
      growth_campaign_id: 'camp-1',
      growth_intervention_id: 'int-1',
      next_run_at: '2026-08-10T13:00:00.000Z',
    });
    expect(prospects[2]?.payload.next_run_at).toBe('2026-08-10T13:30:00.000Z');

    // Scheduling never sends: the existing hourly sweep delivers at next_run_at.
    expect(vi.mocked(sendOutreachEmail)).not.toHaveBeenCalled();

    const scheduled = saved.at(-1)!;
    expect(scheduled.state).toBe('scheduled');
    expect(scheduled.governance.preflightPassedAt).not.toBeNull();
    expect(scheduled.governance.lockedAt).not.toBeNull();
  });

  it('a retried schedule enrolls nobody twice', async () => {
    const existingKeys = [
      'agency-reporting-montreal-v1@v1:c0',
      'agency-reporting-montreal-v1@v1:c1',
      'agency-reporting-montreal-v1@v1:c2',
    ];
    const { supabase, writes } = stubSupabase({ existingKeys });
    const outcome = await scheduleCampaign({
      supabase, env: AUTH_ENV, contract: contract(), nowMs: NOW, save: async () => ({ ok: true }),
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.enrolled).toBe(0);
      expect(outcome.alreadyEnrolled).toBe(3);
    }
    expect(writes.filter((write) => write.table === 'outreach_campaign_enrollments')).toEqual([]);
    expect(writes.filter((write) => write.table === 'outreach_prospects')).toEqual([]);
  });

  it('keeps the version unlocked when a prospect write fails', async () => {
    const { supabase } = stubSupabase({ prospectFailureAt: 1 });
    const saved: EmailCampaignV1[] = [];
    const outcome = await scheduleCampaign({
      supabase, env: AUTH_ENV, contract: contract(), nowMs: NOW,
      save: async (updated) => { saved.push(updated); return { ok: true }; },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('prospect_upsert_failed');
    expect(saved).toEqual([]);
  });

  it('keeps the version unlocked when an enrollment write fails after partial progress', async () => {
    const { supabase, writes } = stubSupabase({ enrollmentFailureAt: 2 });
    const saved: EmailCampaignV1[] = [];
    const outcome = await scheduleCampaign({
      supabase, env: AUTH_ENV, contract: contract(), nowMs: NOW,
      save: async (updated) => { saved.push(updated); return { ok: true }; },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('enrollment_insert_failed');
    expect(writes.filter((write) => write.table === 'outreach_campaign_enrollments')).toHaveLength(2);
    expect(saved).toEqual([]);
  });

  it('retries only the missing rows after a partial enrollment failure', async () => {
    const retry = stubSupabase({ existingKeys: ['agency-reporting-montreal-v1@v1:c0'] });
    const outcome = await scheduleCampaign({
      supabase: retry.supabase, env: AUTH_ENV, contract: contract(), nowMs: NOW,
      save: async () => ({ ok: true }),
    });
    expect(outcome).toMatchObject({ ok: true, enrolled: 2, alreadyEnrolled: 1 });
  });

  it('reports failure instead of success when the locked contract cannot be saved', async () => {
    const { supabase } = stubSupabase();
    const outcome = await scheduleCampaign({
      supabase, env: AUTH_ENV, contract: contract(), nowMs: NOW,
      save: async () => ({ ok: false }),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('scheduled_contract_save_failed');
  });
});

describe('lifecycle stops', () => {
  function state(overrides: Partial<SequenceState> = {}): SequenceState {
    return {
      lifecycleStatus: 'active',
      unsubscribed: false,
      hasActiveSubscription: false,
      consecutiveFailures: 0,
      maxAttempts: 3,
      sequenceStep: 1,
      maxSequenceSteps: 3,
      campaignState: 'running',
      ...overrides,
    };
  }

  it('allows the next step for an active, healthy enrollment', () => {
    expect(nextSequenceStop(state())).toBeNull();
    expect(canSendNextStep(state())).toBe(true);
  });

  it.each([
    ['unsubscribed', { unsubscribed: true }, 'unsubscribed'],
    ['an existing customer', { hasActiveSubscription: true }, 'existing_customer'],
    ['a conversion', { lifecycleStatus: 'converted' }, 'converted'],
    ['a positive reply', { lifecycleStatus: 'positive_reply' }, 'positive_reply'],
    ['any reply', { lifecycleStatus: 'replied' }, 'replied'],
    ['a disqualification', { lifecycleStatus: 'disqualified' }, 'disqualified'],
    ['a provider safety incident', { providerSafetyIncident: true }, 'provider_safety_incident'],
    ['a stopped campaign', { campaignState: 'stopped' as const }, 'campaign_stopped'],
    ['exhausted retries', { consecutiveFailures: 3 }, 'retries_exhausted'],
    ['a completed sequence', { sequenceStep: 3 }, 'sequence_complete'],
  ])('stops future sends after %s', (_label, overrides, expected) => {
    expect(nextSequenceStop(state(overrides as Partial<SequenceState>))).toBe(expected);
    expect(canSendNextStep(state(overrides as Partial<SequenceState>))).toBe(false);
  });

  it('an unsubscribe outranks every other signal', () => {
    expect(nextSequenceStop(state({ unsubscribed: true, lifecycleStatus: 'positive_reply', hasActiveSubscription: true })))
      .toBe('unsubscribed');
  });

  it('agrees with the existing outreach sweep guard, so the two cannot drift apart', () => {
    // `runOutreachForProspect` gates on `isOutreachStopped`. This contract must never permit a
    // send that the existing sweep would refuse, or a campaign step could bypass it.
    for (const status of ['active', 'paused', 'replied', 'positive_reply', 'converted', 'unsubscribed', 'disqualified', 'completed'] as const) {
      const campaignAllows = canSendNextStep(state({ lifecycleStatus: status }));
      expect(campaignAllows).toBe(!isOutreachStopped(normalizeOutreachLifecycleStatus(status)));
    }
  });
});

describe('stopping a campaign', () => {
  it('disables every enrolled prospect, closes the enrollments, and records the reason', async () => {
    const writes: { table: string; op: string; payload: any }[] = [];
    function query(rows: unknown[]): any {
      const builder: any = Promise.resolve({ data: rows, error: null });
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.limit = () => builder;
      // Evidence reads are paginated; the stub answers a range with the whole (small) fixture.
      builder.range = () => builder;
      return builder;
    }
    const supabase = {
      from(table: string) {
        return {
          select: () => query(table === 'outreach_campaign_enrollments'
            ? [{ id: 'e1', prospect_id: 'p1' }, { id: 'e2', prospect_id: 'p2' }]
            : []),
          update(payload: any) { writes.push({ table, op: 'update', payload }); return query([]); },
        };
      },
    } as never;

    const saved: EmailCampaignV1[] = [];
    const scheduled: EmailCampaignV1 = {
      ...contract(),
      state: 'scheduled',
      governance: { ...contract().governance, scheduledAt: '2026-08-03T00:00:00.000Z', lockedAt: '2026-08-03T00:00:00.000Z' },
    };

    const result = await stopCampaign({
      supabase, contract: scheduled, reason: 'deliverability incident', nowMs: NOW,
      save: async (updated) => { saved.push(updated); return { ok: true }; },
    });

    expect(result).toEqual({ ok: true, stoppedProspects: 2 });
    expect(writes.find((write) => write.table === 'outreach_prospects')?.payload).toMatchObject({
      enabled: false,
      lifecycle_status: 'paused',
      next_action: null,
    });
    expect(writes.find((write) => write.table === 'outreach_campaign_enrollments')?.payload).toMatchObject({
      status: 'stopped',
      exit_reason: 'deliverability incident',
    });

    const stopped = saved.at(-1)!;
    expect(stopped.state).toBe('stopped');
    expect(stopped.governance.stopReason).toBe('deliverability incident');
    // Stopping is a lifecycle move on the SAME version, not a fork that would lose the history.
    expect(stopped.version).toBe(1);
  });
});
