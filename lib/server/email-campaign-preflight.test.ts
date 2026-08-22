import { describe, expect, it } from 'vitest';
import { createDraftContract, versionChecksum, type EmailCampaignV1 } from './email-campaign-contract';
import {
  CAMPAIGN_FROM_ENV_KEY,
  CAMPAIGN_REPLY_TO_ENV_KEY,
  CAMPAIGN_SENDER_VERIFIED_ENV_KEY,
} from './email-campaign-sender';
import {
  DEFAULT_PROVIDER_CAPS,
  assemblePreflight,
  evaluateContentAndTracking,
  evaluateGovernance,
  evaluateInternalTest,
  evaluateRecipients,
  evaluateSchedule,
  evaluateVolume,
  runCampaignPreflight,
  type PreflightRecipient,
} from './email-campaign-preflight';
import { audienceChecksum, type AudienceEvidence } from './campaign-audience';

const AUTHENTICATED_ENV = {
  [CAMPAIGN_FROM_ENV_KEY]: 'elena@getgeopulse.com',
  [CAMPAIGN_REPLY_TO_ENV_KEY]: 'elena@getgeopulse.com',
  [CAMPAIGN_SENDER_VERIFIED_ENV_KEY]: 'true',
};

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
/** 2026-08-10 09:00 America/Toronto (EDT, UTC-4). */
const START = '2026-08-10T13:00:00.000Z';

function contract(overrides: Partial<EmailCampaignV1> = {}): EmailCampaignV1 {
  const base = createDraftContract({
    campaignId: 'camp-1',
    interventionId: 'int-1',
    interventionKey: 'agency-reporting-montreal-v1',
    goal: {
      objective: 'Win one qualified agency reply',
      buyer: 'Montreal marketing agency owner',
      offerKey: 'agency_client_visibility_baseline',
      ctaGoal: 'Reply with one client domain',
      owner: 'elena',
      meaningfulVariable: 'agency-reporting offer and message only',
      successCondition: 'At least one qualified reply or booked walkthrough',
      stopCondition: '25 provider-accepted first messages with zero qualified replies',
      closureCondition: 'Reply, unsubscribe, disqualification, conversion, or sequence completion',
      retryPolicy: 'Three attempts per step',
    },
    sender: {
      displayName: 'Elena at GEO-Pulse',
      fromAddressRef: CAMPAIGN_FROM_ENV_KEY,
      replyToRef: CAMPAIGN_REPLY_TO_ENV_KEY,
      authenticated: true,
      authenticationEvidence: 'getgeopulse.com verified',
    },
    segment: 'agency-ca-qc-montreal-published-2026-08',
    content: {
      templateId: null,
      templateVersion: 1,
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
    audience: { segment: base.audience.segment, audienceId: 'aud-1', checksum: 'sum-1', recipientCount: 25, frozenAt: '2026-08-02T00:00:00.000Z', excludedCounts: {} },
  };
  const tested: EmailCampaignV1 = {
    ...withAudience,
    governance: { ...withAudience.governance, testAcceptedAt: '2026-08-02T10:00:00.000Z', testVersionChecksum: versionChecksum(withAudience) },
  };
  return { ...tested, ...overrides };
}

function recipient(index: number, overrides: Partial<PreflightRecipient> = {}): PreflightRecipient {
  return {
    contactId: `c${String(index)}`,
    email: `owner${String(index)}@royco.ca`,
    name: `Owner ${String(index)}`,
    company: 'Roy Co',
    companyDomain: 'royco.ca',
    personalizationReason: null,
    personalizationSourceUrl: null,
    eligibilityStatus: 'eligible',
    ...overrides,
  };
}

const CLEAN_EVIDENCE: AudienceEvidence = {
  unsubscribedEmails: new Set(),
  convertedEmails: new Set(),
  suppressedEmails: new Set(),
  activeSequenceEmails: new Set(),
  enrolledContactIds: new Set(),
};

describe('the internal test binds to one exact version', () => {
  it('passes for the version it validated', () => {
    expect(evaluateInternalTest(contract()).ok).toBe(true);
  });

  it('fails when no test has been accepted', () => {
    const gate = evaluateInternalTest(contract({ governance: { ...contract().governance, testAcceptedAt: null, testVersionChecksum: null } }));
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('No internal test');
  });

  it('is invalidated by a content change', () => {
    const edited = contract();
    const gate = evaluateInternalTest({ ...edited, content: { ...edited.content, subject: 'Different subject' } });
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('Re-test this exact version');
  });

  it('is invalidated by an audience change', () => {
    const edited = contract();
    expect(evaluateInternalTest({ ...edited, audience: { ...edited.audience, checksum: 'sum-2' } }).ok).toBe(false);
  });

  it('is invalidated by a sender change', () => {
    const edited = contract();
    expect(evaluateInternalTest({ ...edited, sender: { ...edited.sender, displayName: 'Someone else' } }).ok).toBe(false);
  });
});

describe('schedule window', () => {
  it('accepts a future time inside business hours in the campaign timezone', () => {
    expect(evaluateSchedule(contract(), NOW).ok).toBe(true);
  });

  it('refuses a time in the past', () => {
    const gate = evaluateSchedule(contract(), Date.parse('2026-08-11T00:00:00.000Z'));
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('in the past');
  });

  it('refuses a time outside the approved window', () => {
    // 2026-08-10 22:00 Toronto.
    const gate = evaluateSchedule(contract({ schedule: { ...contract().schedule, startAt: '2026-08-11T02:00:00.000Z' } }), NOW);
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('outside the approved');
  });

  it('refuses spacing that pushes part of the cohort past the window', () => {
    const gate = evaluateSchedule(contract({ schedule: { ...contract().schedule, spacingMinutes: 30 } }), NOW);
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('outside the approved window');
  });

  it('catches a cohort spread across a full day, not just a late final send', () => {
    // 25 recipients an hour apart from 09:00 ends at 09:00 the NEXT morning — the same hour, so a
    // last-send-only check would pass it after mailing most of the cohort overnight.
    const gate = evaluateSchedule(contract({ schedule: { ...contract().schedule, spacingMinutes: 60 } }), NOW);
    expect(gate.ok).toBe(false);
  });
});

describe('volume and spend caps', () => {
  it('passes a bounded 25-contact pilot', () => {
    expect(evaluateVolume(contract()).ok).toBe(true);
  });

  it('refuses a cohort over the per-campaign cap', () => {
    const gate = evaluateVolume(contract({ audience: { ...contract().audience, recipientCount: 327 } }));
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('exceeds the 50 per-campaign cap');
  });

  it('refuses a campaign over the spend cap', () => {
    const gate = evaluateVolume(contract(), { ...DEFAULT_PROVIDER_CAPS, maxCampaignSpendUsd: 0.01 });
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('spend cap');
  });
});

describe('recipient gates', () => {
  it('passes a clean cohort', () => {
    const gates = evaluateRecipients({ contract: contract(), recipients: [recipient(1), recipient(2)], evidence: CLEAN_EVIDENCE });
    expect(gates.every((gate) => gate.ok)).toBe(true);
  });

  it('fails on any unsubscribed, converted, suppressed, or conflicting recipient', () => {
    const evidence: AudienceEvidence = {
      ...CLEAN_EVIDENCE,
      unsubscribedEmails: new Set(['owner1@royco.ca']),
      convertedEmails: new Set(['owner2@royco.ca']),
      suppressedEmails: new Set(['owner3@royco.ca']),
      activeSequenceEmails: new Set(['owner4@royco.ca']),
    };
    const gate = evaluateRecipients({
      contract: contract(),
      recipients: [recipient(1), recipient(2), recipient(3), recipient(4)],
      evidence,
    }).find((item) => item.key === 'recipients_eligible');
    expect(gate?.ok).toBe(false);
    for (const fragment of ['unsubscribed', 'existing customer', 'is suppressed', 'conflicting active sequence']) {
      expect(gate?.detail).toContain(fragment);
    }
  });

  it('fails on a contact whose eligibility is anything but eligible', () => {
    const gate = evaluateRecipients({
      contract: contract(),
      recipients: [recipient(1, { eligibilityStatus: 'needs_verification' })],
      evidence: CLEAN_EVIDENCE,
    }).find((item) => item.key === 'recipients_eligible');
    expect(gate?.ok).toBe(false);
  });

  it('fails when one recipient in the cohort cannot resolve a merge field', () => {
    const gate = evaluateRecipients({
      contract: contract(),
      recipients: [recipient(1), recipient(2, { name: null })],
      evidence: CLEAN_EVIDENCE,
    }).find((item) => item.key === 'merge_fields_resolve');
    expect(gate?.ok).toBe(false);
    expect(gate?.detail).toContain('owner2@royco.ca');
    expect(gate?.detail).toContain('{{name}}');
  });

  it('requires a completed scan for proof-led copy and passes only with that scan bound', () => {
    const base = contract();
    const proofLed = {
      ...base,
      content: {
        ...base.content,
        bodyTemplate: 'Hi {{name}},\n\n{{scan_preview}}\n\n{{walkthrough_cta}}',
        requiredMergeFields: ['name', 'scan_preview', 'walkthrough_cta'],
      },
    };
    const contact = recipient(1);
    const withoutScan = evaluateRecipients({
      contract: proofLed,
      recipients: [contact],
      evidence: CLEAN_EVIDENCE,
    }).find((item) => item.key === 'merge_fields_resolve');
    expect(withoutScan?.ok).toBe(false);
    expect(withoutScan?.detail).toContain('{{scan_preview}}');

    const withScan = evaluateRecipients({
      contract: proofLed,
      recipients: [contact],
      evidence: CLEAN_EVIDENCE,
      scansByContactId: new Map([['c1', {
        scanId: 'scan-1',
        siteUrl: 'https://example.com/',
        score: 76,
        grade: 'C',
        topIssues: [
          { check: 'Answer-first content', fix: 'Lead with buyer questions.' },
          { check: 'Business schema', fix: 'Add a specific business type.' },
        ],
        completedAt: '2026-08-09T01:05:00.000Z',
        passedChecks: 20,
        totalChecks: 24,
        eligibleDestinations: 5,
        testedDestinations: 5,
        retrievalScore: 100,
        understandingTrustScore: 62,
        reportUrl: 'https://getgeopulse.com/results/scan-1',
      }]]),
    }).find((item) => item.key === 'merge_fields_resolve');
    expect(withScan?.ok).toBe(true);
  });

  it('fails on an empty cohort rather than reporting nothing to check', () => {
    const gates = evaluateRecipients({ contract: contract(), recipients: [], evidence: CLEAN_EVIDENCE });
    expect(gates.every((gate) => !gate.ok)).toBe(true);
  });
});

describe('governance and content gates', () => {
  it('requires the declared conditions', () => {
    const base = contract();
    const gate = evaluateGovernance({ ...base, goal: { ...base.goal, stopCondition: '' } });
    expect(gate.ok).toBe(false);
    expect(gate.detail).toContain('stopCondition');
  });

  it('requires valid content and tracking', () => {
    const base = contract();
    expect(evaluateContentAndTracking({ ...base, content: { ...base.content, bodyTemplate: 'Hi {{oops}}' } }).ok).toBe(false);
    expect(evaluateContentAndTracking(base).ok).toBe(true);
  });
});

describe('assembly', () => {
  it('is only ok when every gate is ok', () => {
    const passing = assemblePreflight([{ key: 'sender_authenticated', ok: true, detail: 'y' }], contract(), '2026-08-03T12:00:00.000Z');
    expect(passing.ok).toBe(true);
    const failing = assemblePreflight(
      [{ key: 'sender_authenticated', ok: true, detail: 'y' }, { key: 'audience_frozen', ok: false, detail: 'nope' }],
      contract(),
      '2026-08-03T12:00:00.000Z',
    );
    expect(failing.ok).toBe(false);
    expect(failing.failures).toEqual(['audience_frozen: nope']);
  });
});

// ── Full preflight against a stubbed database ───────────────────────────────────

type StubOptions = {
  readonly members?: { contact_id: string; email: string; position: number }[];
  readonly contacts?: Record<string, unknown>[];
  readonly storedChecksum?: string;
  readonly prospectsError?: boolean;
};

/**
 * A minimal PostgREST-shaped stub: every builder step is chainable AND awaitable, and `in()`
 * remembers its column so a filter the real client would apply is not silently ignored. A stub
 * that returned every row for `in('eligibility_status', ['suppressed','converted'])` would make
 * the whole cohort look suppressed and the tests would assert the wrong behaviour.
 */
function stubSupabase(options: StubOptions = {}) {
  const members = options.members ?? Array.from({ length: 25 }, (_, index) => ({
    contact_id: `c${String(index)}`, email: `owner${String(index)}@royco.ca`, position: index + 1,
  }));
  const contacts = options.contacts ?? members.map((member) => ({
    id: member.contact_id,
    email: member.email,
    name: `Owner ${member.contact_id}`,
    company: 'Roy Co',
    company_domain: 'royco.ca',
    eligibility_status: 'eligible',
    personalization_reason: null,
    personalization_source_url: null,
  }));

  function query(rows: unknown[], single?: unknown): any {
    const builder: any = Promise.resolve({ data: rows, error: null });
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.limit = () => builder;
    // Evidence reads are paginated; the stub answers a range with the whole (small) fixture.
    builder.range = () => builder;
    builder.order = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: single ?? null });
    builder.single = () => Promise.resolve({ data: single ?? null, error: null });
    return builder;
  }

  return {
    from(table: string) {
      if (table === 'outreach_campaign_audiences') {
        return { select: () => query([], { checksum: options.storedChecksum ?? 'sum-1', recipient_count: members.length }) };
      }
      if (table === 'outreach_campaign_audience_members') {
        return { select: () => query(members) };
      }
      if (table === 'outreach_contacts') {
        return {
          select: () => ({
            // Preflight fetches the frozen members by id; audience evidence filters by
            // eligibility_status and must not see the eligible cohort.
            in: (column: string) => query(column === 'id' ? contacts : []),
            eq: () => query([]),
            limit: () => query([]),
          }),
        };
      }
      if (table === 'outreach_prospects') {
        if (options.prospectsError) {
          return { select: () => ({ limit: () => { throw new Error('ledger unavailable'); } }) };
        }
        return { select: () => query([]) };
      }
      return { select: () => query([]) };
    },
  } as never;
}

describe('full preflight', () => {
  it('passes every gate for a ready campaign with an authenticated sender', async () => {
    // The checksum is REBUILT from the stored members, so a green run requires the contract, the
    // audience header, and the actual member list to agree — not just a matching string.
    const members = Array.from({ length: 25 }, (_, index) => ({
      contact_id: `c${String(index)}`, email: `owner${String(index)}@royco.ca`, position: index + 1,
    }));
    const realChecksum = audienceChecksum(
      members.map((member) => ({ contactId: member.contact_id, email: member.email, position: member.position })),
    );
    const base = contract();
    const withRealChecksum: EmailCampaignV1 = { ...base, audience: { ...base.audience, checksum: realChecksum } };
    const ready: EmailCampaignV1 = {
      ...withRealChecksum,
      governance: {
        ...withRealChecksum.governance,
        testAcceptedAt: '2026-08-02T10:00:00.000Z',
        testVersionChecksum: versionChecksum(withRealChecksum),
      },
    };

    const { result } = await runCampaignPreflight({
      supabase: stubSupabase({ members, storedChecksum: realChecksum }),
      env: AUTHENTICATED_ENV,
      contract: ready,
      nowMs: NOW,
    });

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.gates).toHaveLength(11);
  });

  it('fails closed with no authenticated sender — the current production state', async () => {
    const { result } = await runCampaignPreflight({
      supabase: stubSupabase(),
      env: {},
      contract: contract(),
      nowMs: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.startsWith('sender_authenticated'))).toBe(true);
  });

  it('fails every audience gate when nothing is frozen', async () => {
    const unfrozen = contract({ audience: { ...contract().audience, audienceId: null, checksum: null, recipientCount: null } });
    const { result, recipients } = await runCampaignPreflight({
      supabase: stubSupabase(),
      env: AUTHENTICATED_ENV,
      contract: unfrozen,
      nowMs: NOW,
    });
    expect(recipients).toEqual([]);
    for (const key of ['audience_frozen', 'audience_not_drifted', 'recipients_within_cap', 'recipients_eligible', 'merge_fields_resolve']) {
      expect(result.gates.find((gate) => gate.key === key)?.ok).toBe(false);
    }
  });

  it('detects an audience edited underneath the reviewed campaign', async () => {
    const { result } = await runCampaignPreflight({
      supabase: stubSupabase({ storedChecksum: 'a-different-checksum' }),
      env: AUTHENTICATED_ENV,
      contract: contract(),
      nowMs: NOW,
    });
    expect(result.gates.find((gate) => gate.key === 'audience_not_drifted')?.ok).toBe(false);
  });

  it('fails when the resolved recipient count disagrees with the reviewed count', async () => {
    const { result } = await runCampaignPreflight({
      supabase: stubSupabase({
        members: [{ contact_id: 'c1', email: 'owner1@royco.ca', position: 1 }],
      }),
      env: AUTHENTICATED_ENV,
      contract: contract(),
      nowMs: NOW,
    });
    const gate = result.gates.find((item) => item.key === 'recipients_within_cap');
    expect(gate?.ok).toBe(false);
    expect(gate?.detail).toContain('but the campaign reviewed 25');
  });

  it('refuses to schedule when suppression evidence cannot be read', async () => {
    const { result } = await runCampaignPreflight({
      supabase: stubSupabase({ prospectsError: true }),
      env: AUTHENTICATED_ENV,
      contract: contract(),
      nowMs: NOW,
    });
    const gate = result.gates.find((item) => item.key === 'recipients_eligible');
    expect(gate?.ok).toBe(false);
    expect(gate?.detail).toContain('could not be loaded');
    expect(result.ok).toBe(false);
  });
});
