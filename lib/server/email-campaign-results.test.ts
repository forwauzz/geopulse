import { describe, expect, it } from 'vitest';
import { createDraftContract, type EmailCampaignV1 } from './email-campaign-contract';
import {
  buildCampaignFunnel,
  deriveCampaignClosure,
  isNonCommercialEmail,
  loadCampaignResults,
  type FunnelStageKey,
} from './email-campaign-results';

const NOW = Date.parse('2026-08-20T12:00:00.000Z');

function contract(overrides: Partial<EmailCampaignV1> = {}): EmailCampaignV1 {
  const base = createDraftContract({
    campaignId: 'camp-1',
    interventionId: 'int-1',
    interventionKey: 'agency-reporting-montreal-v1',
    goal: {
      objective: 'o', buyer: 'b', offerKey: 'k', ctaGoal: 'c', owner: 'elena',
      meaningfulVariable: 'agency-reporting offer only',
      successCondition: 'At least one qualified reply or booked walkthrough',
      stopCondition: '25 provider-accepted first messages with zero qualified replies',
      closureCondition: 'Reply, unsubscribe, disqualification, conversion, or completion',
      retryPolicy: 'Three attempts per step',
    },
    sender: { displayName: 'Elena', fromAddressRef: 'REF', replyToRef: 'REF2', authenticated: true, authenticationEvidence: 'ok' },
    segment: 'agency-ca-qc-montreal-published-2026-08',
    content: { templateId: null, templateVersion: 1, subject: 's', previewText: 'p', bodyFormat: 'text', bodyTemplate: 'Hi {{name}}' },
    tracking: { tags: [], utmSource: 'outreach', utmMedium: 'email', utmCampaign: 'c', utmContent: 'x', utmTerm: null },
    schedule: { timezone: 'America/Toronto', sendWindowStartHour: 9, sendWindowEndHour: 17, startAt: '2026-08-10T13:00:00.000Z', spacingMinutes: 15, dailyCap: 25, maxSequenceSteps: 3, sequenceDelaysDays: [0, 4, 10] },
    nowIso: '2026-08-02T00:00:00.000Z',
  });
  return {
    ...base,
    audience: { segment: base.audience.segment, audienceId: 'aud-1', checksum: 'sum', recipientCount: 25, frozenAt: '2026-08-02T00:00:00.000Z', excludedCounts: {} },
    ...overrides,
  };
}

describe('missing data is unavailable, never zero', () => {
  it('renders a null count as unavailable with a reason and no rate', () => {
    const funnel = buildCampaignFunnel({ nowMs: NOW, counts: { eligible: 25, enrolled: 25, sent: null } });
    const sent = funnel.find((stage) => stage.key === 'sent')!;
    expect(sent.count).toBeNull();
    expect(sent.unavailableReason).toBe('evidence unavailable');
    expect(sent.ratePercent).toBeNull();
  });

  it('a genuine zero is still reported as zero', () => {
    const funnel = buildCampaignFunnel({ nowMs: NOW, counts: { eligible: 25, enrolled: 25, replied: 0 } });
    const replied = funnel.find((stage) => stage.key === 'replied')!;
    expect(replied.count).toBe(0);
    expect(replied.unavailableReason).toBeNull();
    expect(replied.ratePercent).toBe(0);
  });

  it('never reparents a rate onto a denominator the operator was not shown', () => {
    // `sent` is unavailable, so `opened` must be a rate of `enrolled` — the nearest KNOWN stage —
    // and must say so, rather than quietly dividing by an unknown.
    const funnel = buildCampaignFunnel({ nowMs: NOW, counts: { eligible: 25, enrolled: 20, sent: null, opened: 5 } });
    const opened = funnel.find((stage) => stage.key === 'opened')!;
    expect(opened.denominator).toBe(20);
    expect(opened.ratePercent).toBe(25);
  });

  it('covers every stage the plan names, in order', () => {
    const funnel = buildCampaignFunnel({ nowMs: NOW, counts: {} });
    expect(funnel.map((stage) => stage.key)).toEqual<FunnelStageKey[]>([
      'eligible', 'enrolled', 'queued', 'sent', 'provider_accepted', 'opened', 'clicked',
      'replied', 'positive_reply', 'walkthrough', 'trial_or_baseline', 'checkout',
      'active_recurring_subscription',
    ]);
    expect(funnel.every((stage) => stage.count === null)).toBe(true);
  });
});

describe('leading indicators keep their limitations', () => {
  it('labels opens, clicks, and provider acceptance', () => {
    const funnel = buildCampaignFunnel({ nowMs: NOW, counts: { opened: 3, clicked: 1, provider_accepted: 25 } });
    for (const key of ['opened', 'clicked', 'provider_accepted'] as const) {
      expect(funnel.find((stage) => stage.key === key)?.limitation).toBeTruthy();
    }
    expect(funnel.find((stage) => stage.key === 'opened')?.limitation).toContain('undercount');
  });

  it('marks only an active recurring subscription as revenue', () => {
    const funnel = buildCampaignFunnel({ nowMs: NOW, counts: {} });
    expect(funnel.filter((stage) => stage.isRevenue).map((stage) => stage.key)).toEqual(['active_recurring_subscription']);
  });
});

describe('stage age', () => {
  it('reports hours since the oldest record still at that stage', () => {
    const funnel = buildCampaignFunnel({
      nowMs: NOW,
      counts: { sent: 25 },
      oldestAt: { sent: '2026-08-18T12:00:00.000Z' },
    });
    expect(funnel.find((stage) => stage.key === 'sent')?.stageAgeHours).toBe(48);
  });
});

describe('non-commercial exclusion', () => {
  it('excludes internal, test, and the existing Jack/Lifter relationship', () => {
    expect(isNonCommercialEmail('elena@getgeopulse.com')).toBe(true);
    expect(isNonCommercialEmail('jack@lifter.ca')).toBe(true);
    expect(isNonCommercialEmail('pilot@mail.lifter.ca')).toBe(true);
    expect(isNonCommercialEmail('qa@example.com', ['qa@example.com'])).toBe(true);
    expect(isNonCommercialEmail('ann@royco.ca')).toBe(false);
  });
});

describe('the scale / revise / stop decision', () => {
  const funnelWith = (counts: Partial<Record<FunnelStageKey, number | null>>) =>
    buildCampaignFunnel({ nowMs: NOW, counts: { eligible: 25, enrolled: 25, ...counts } });

  it('refuses to recommend before the declared stop threshold is reached', () => {
    const closure = deriveCampaignClosure({
      contract: contract(),
      funnel: funnelWith({ provider_accepted: 9, positive_reply: 0 }),
      stopThresholdSends: 25,
    });
    expect(closure.decision).toBe('not_enough_evidence');
    expect(closure.rationale).toContain('9 of 25');
    expect(closure.nextAction).toContain('16 more accepted');
  });

  it('recommends revise once the declared threshold is reached with no qualified reply', () => {
    const closure = deriveCampaignClosure({
      contract: contract(),
      funnel: funnelWith({ provider_accepted: 25, positive_reply: 0, walkthrough: 0 }),
      stopThresholdSends: 25,
    });
    expect(closure.decision).toBe('revise');
    expect(closure.nextAction).toContain('exactly one variable');
  });

  it('recommends continue on qualified intent that has not yet produced revenue', () => {
    const closure = deriveCampaignClosure({
      contract: contract(),
      funnel: funnelWith({ provider_accepted: 25, positive_reply: 1, active_recurring_subscription: 0 }),
      stopThresholdSends: 25,
    });
    expect(closure.decision).toBe('continue');
  });

  it('recommends scale only on a real active recurring subscription', () => {
    const closure = deriveCampaignClosure({
      contract: contract(),
      funnel: funnelWith({ provider_accepted: 25, positive_reply: 1, active_recurring_subscription: 1 }),
      stopThresholdSends: 25,
    });
    expect(closure.decision).toBe('scale');
    expect(closure.nextAction).toContain('reproduces');
  });

  it('will not draw a conclusion when the denominator itself is unknown', () => {
    const closure = deriveCampaignClosure({
      contract: contract(),
      funnel: funnelWith({ provider_accepted: null }),
      stopThresholdSends: 25,
    });
    expect(closure.decision).toBe('not_enough_evidence');
    expect(closure.rationale).toContain('denominator');
  });

  it('reports a stopped campaign as stopped with its reason', () => {
    const stopped = contract({ state: 'stopped' });
    const closure = deriveCampaignClosure({
      contract: { ...stopped, governance: { ...stopped.governance, stopReason: 'deliverability incident' } },
      funnel: funnelWith({ provider_accepted: 25 }),
      stopThresholdSends: 25,
    });
    expect(closure.decision).toBe('stop');
    expect(closure.rationale).toBe('deliverability incident');
  });

  it('always carries the owner, next action, due time, and closure condition', () => {
    const closure = deriveCampaignClosure({ contract: contract(), funnel: funnelWith({}), stopThresholdSends: 25 });
    expect(closure.owner).toBe('elena');
    expect(closure.dueAt).toBe('2026-08-10T13:00:00.000Z');
    expect(closure.closureCondition).toContain('unsubscribe');
    expect(closure.retryPolicy).toContain('Three attempts');
  });
});

// ── Reconciliation against the ledgers ──────────────────────────────────────────

function stubSupabase(options: {
  enrollments?: unknown[] | 'error';
  prospects?: Record<string, unknown>[];
  sends?: Record<string, unknown>[];
  subscriptions?: Record<string, unknown>[];
  leads?: Record<string, unknown>[];
} = {}) {
  function query(rows: unknown[] | 'error'): any {
    const builder: any = rows === 'error'
      ? Promise.resolve({ data: null, error: { message: 'unavailable' } })
      : Promise.resolve({ data: rows, error: null });
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.limit = () => builder;
    // Evidence reads are paginated; the stub answers a range with the whole (small) fixture.
    builder.range = () => builder;
    builder.order = () => builder;
    return builder;
  }

  return {
    from(table: string) {
      return {
        select: () => {
          if (table === 'outreach_campaign_enrollments') return query(options.enrollments ?? []);
          if (table === 'outreach_prospects') return query(options.prospects ?? []);
          if (table === 'outreach_sends') return query(options.sends ?? []);
          if (table === 'monitoring_subscriptions') return query(options.subscriptions ?? []);
          if (table === 'leads') return query(options.leads ?? []);
          return query([]);
        },
      };
    },
  } as never;
}

describe('reconciliation against the existing ledgers', () => {
  const enrollments = [
    { id: 'e1', contact_id: 'c1', prospect_id: 'p1', status: 'enrolled', enrolled_at: '2026-08-10T13:00:00.000Z' },
    { id: 'e2', contact_id: 'c2', prospect_id: 'p2', status: 'enrolled', enrolled_at: '2026-08-10T13:15:00.000Z' },
    { id: 'e3', contact_id: 'c3', prospect_id: 'p3', status: 'enrolled', enrolled_at: '2026-08-10T13:30:00.000Z' },
  ];

  it('excludes internal and Jack/Lifter activity from every commercial and revenue stage', async () => {
    const results = await loadCampaignResults({
      supabase: stubSupabase({
        enrollments,
        prospects: [
          { id: 'p1', email: 'ann@royco.ca', lifecycle_status: 'active', last_run_at: '2026-08-10T13:00:00.000Z', replied_at: null },
          { id: 'p2', email: 'qa@getgeopulse.com', lifecycle_status: 'positive_reply', last_run_at: '2026-08-10T13:15:00.000Z', replied_at: '2026-08-11T09:00:00.000Z' },
          { id: 'p3', email: 'jack@lifter.ca', lifecycle_status: 'converted', last_run_at: '2026-08-10T13:30:00.000Z', replied_at: '2026-08-11T10:00:00.000Z' },
        ],
        sends: [
          { id: 's1', prospect_id: 'p1', sequence_step: 1, sent_at: '2026-08-10T13:00:00.000Z', delivery_status: 'sent', opened_at: null },
          { id: 's2', prospect_id: 'p2', sequence_step: 1, sent_at: '2026-08-10T13:15:00.000Z', delivery_status: 'sent', opened_at: '2026-08-10T14:00:00.000Z' },
          { id: 's3', prospect_id: 'p3', sequence_step: 1, sent_at: '2026-08-10T13:30:00.000Z', delivery_status: 'sent', opened_at: '2026-08-10T15:00:00.000Z' },
        ],
      }),
      contract: contract(),
      testRecipients: ['qa@getgeopulse.com'],
      nowMs: NOW,
    });

    const stage = (key: FunnelStageKey) => results.funnel.find((item) => item.key === key)!;
    expect(results.excludedNonCommercial).toBe(2);
    expect(stage('sent').count).toBe(1);
    expect(stage('opened').count).toBe(0);
    expect(stage('replied').count).toBe(0);
    expect(stage('positive_reply').count).toBe(0);
    expect(stage('active_recurring_subscription').count).toBe(0);
  });

  it('counts all sends operationally but only unique provider-accepted step-one recipients toward the stop threshold', async () => {
    const results = await loadCampaignResults({
      supabase: stubSupabase({
        enrollments: [enrollments[0]!],
        prospects: [{ id: 'p1', email: 'ann@royco.ca', lifecycle_status: 'completed', last_run_at: '2026-08-20T13:00:00.000Z', replied_at: null }],
        sends: [1, 2, 3].map((sequenceStep) => ({
          id: `s${String(sequenceStep)}`,
          prospect_id: 'p1',
          sequence_step: sequenceStep,
          sent_at: `2026-08-${String(9 + sequenceStep).padStart(2, '0')}T13:00:00.000Z`,
          delivery_status: 'sent',
          opened_at: null,
        })),
      }),
      contract: contract(),
      nowMs: NOW,
    });
    const stage = (key: FunnelStageKey) => results.funnel.find((item) => item.key === key)!;
    expect(stage('sent').count).toBe(3);
    expect(stage('provider_accepted').count).toBe(1);
  });

  it('reports every stage as unavailable — not zero — when a ledger cannot be read', async () => {
    const results = await loadCampaignResults({
      supabase: stubSupabase({ enrollments: 'error' }),
      contract: contract(),
      nowMs: NOW,
    });
    expect(results.warnings).toContain('Enrollments could not be loaded');
    expect(results.funnel.find((stage) => stage.key === 'enrolled')?.count).toBeNull();
    expect(results.closure.decision).toBe('not_enough_evidence');
  });

  it('reports clicked as unavailable rather than zero, because it is not measured here', async () => {
    const results = await loadCampaignResults({
      supabase: stubSupabase({ enrollments }),
      contract: contract(),
      nowMs: NOW,
    });
    expect(results.funnel.find((stage) => stage.key === 'clicked')?.count).toBeNull();
  });

  it('counts a real subscription from a commercial contact as revenue', async () => {
    const results = await loadCampaignResults({
      supabase: stubSupabase({
        enrollments,
        prospects: [{ id: 'p1', email: 'ann@royco.ca', lifecycle_status: 'converted', last_run_at: '2026-08-10T13:00:00.000Z', replied_at: '2026-08-12T09:00:00.000Z' }],
        subscriptions: [{ email: 'ann@royco.ca', status: 'active', created_at: '2026-08-15T09:00:00.000Z' }],
      }),
      contract: contract(),
      nowMs: NOW,
    });
    expect(results.funnel.find((stage) => stage.key === 'active_recurring_subscription')?.count).toBe(1);
    expect(results.closure.decision).toBe('scale');
  });

  it('a stopped campaign produces no further sends and reads as stopped', async () => {
    const stopped = contract({ state: 'stopped' });
    const results = await loadCampaignResults({
      supabase: stubSupabase({ enrollments: [] }),
      contract: { ...stopped, governance: { ...stopped.governance, stopReason: 'operator stopped' } },
      nowMs: NOW,
    });
    expect(results.closure.decision).toBe('stop');
    expect(results.funnel.find((stage) => stage.key === 'enrolled')?.count).toBe(0);
  });
});
