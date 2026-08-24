import { describe, expect, it } from 'vitest';
import {
  EMAIL_CAMPAIGN_CONTRACT,
  applyContractEdit,
  createDraftContract,
  deriveSectionStates,
  extractMergeFields,
  isLocked,
  isReadyToSchedule,
  unsupportedMergeFields,
  validateEmailCampaignV1,
  versionChecksum,
  type EmailCampaignV1,
} from './email-campaign-contract';

function draft(overrides: Partial<EmailCampaignV1> = {}): EmailCampaignV1 {
  const base = createDraftContract({
    campaignId: 'camp-1',
    interventionId: 'int-1',
    interventionKey: 'agency-reporting-montreal-v1',
    goal: {
      objective: 'Win one qualified agency reply',
      buyer: 'Montreal marketing agency owner',
      offerKey: 'agency_client_visibility_baseline',
      ctaGoal: 'Reply with one client domain or request a walkthrough',
      owner: 'elena',
      meaningfulVariable: 'agency-reporting offer and message only',
      successCondition: 'At least one qualified reply or booked walkthrough',
      stopCondition: '25 provider-accepted first messages with zero qualified replies',
      closureCondition: 'Reply, unsubscribe, disqualification, conversion, or sequence completion',
      retryPolicy: 'Three attempts per step, then stop and record the reason',
    },
    sender: {
      displayName: 'Elena at GEO-Pulse',
      fromAddressRef: 'GEOPULSE_CAMPAIGN_FROM_EMAIL',
      replyToRef: 'GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL',
      authenticated: true,
      authenticationEvidence: 'getgeopulse.com verified',
    },
    segment: 'agency-ca-qc-montreal-published-2026-08',
    content: {
      templateId: null,
      templateVersion: 1,
      subject: 'A white-labelled AI visibility baseline for {{company}}',
      previewText: 'One client domain is enough to see it.',
      bodyFormat: 'text',
      bodyTemplate: 'Hi {{name}},\n\nWe build AI visibility baselines agencies can share with a client.\n\nReply with one client domain and I will send the baseline: {{walkthrough_url}}',
      // Three declared steps require three approved messages — see the sequence-length rule.
      followUpSteps: [
        { subject: 'Re: a baseline for one of your clients', previewText: 'Still happy to run one.', bodyTemplate: 'Hi {{name}},\n\nFollowing up once: {{walkthrough_url}}' },
        { subject: 'Closing the loop', previewText: 'Last note.', bodyTemplate: 'Hi {{name}},\n\nLast note on this.' },
      ],
    },
    tracking: {
      tags: ['vci-8', 'email'],
      utmSource: 'outreach',
      utmMedium: 'email',
      utmCampaign: 'agency-reporting-montreal-v1',
      utmContent: 'agency-reporting',
      utmTerm: null,
    },
    schedule: {
      timezone: 'America/Toronto',
      sendWindowStartHour: 9,
      sendWindowEndHour: 17,
      startAt: '2026-08-10T13:00:00.000Z',
      spacingMinutes: 60,
      dailyCap: 25,
      maxSequenceSteps: 3,
      sequenceDelaysDays: [0, 4, 10],
    },
    nowIso: '2026-08-02T00:00:00.000Z',
  });
  return {
    ...base,
    audience: { segment: base.audience.segment, audienceId: 'aud-1', checksum: 'abc123', recipientCount: 25, frozenAt: '2026-08-02T00:00:00.000Z', excludedCounts: {} },
    ...overrides,
  };
}

describe('merge fields', () => {
  it('finds every declared field and flags unknown ones', () => {
    const fields = extractMergeFields('Hi {{name}}', 'about {{company}} and {{whatever}}');
    expect(fields).toEqual(['company', 'name', 'whatever']);
    expect(unsupportedMergeFields(fields)).toEqual(['whatever']);
  });
});

describe('validation', () => {
  it('accepts a complete contract', () => {
    expect(validateEmailCampaignV1(draft())).toEqual([]);
  });

  it('requires the governing conditions before a campaign can be described', () => {
    const contract = draft();
    const issues = validateEmailCampaignV1({
      ...contract,
      goal: { ...contract.goal, successCondition: '', stopCondition: '', meaningfulVariable: '', owner: '' },
    });
    expect(issues.map((issue) => issue.field).sort()).toEqual(['meaningfulVariable', 'owner', 'stopCondition', 'successCondition']);
  });

  it('refuses a literal sender address so an unauthenticated identity cannot be typed in', () => {
    const contract = draft();
    const issues = validateEmailCampaignV1({
      ...contract,
      sender: { ...contract.sender, fromAddressRef: 'elena@getgeopulse.com' },
    });
    expect(issues.some((issue) => issue.message.includes('never DNS-authenticated'))).toBe(true);
  });

  it('fails closed on an unauthenticated sender', () => {
    const contract = draft();
    const issues = validateEmailCampaignV1({ ...contract, sender: { ...contract.sender, authenticated: false } });
    expect(issues).toContainEqual({
      section: 'sender',
      field: 'authenticated',
      message: 'no authenticated GEO-Pulse sending identity is configured',
    });
  });

  it('requires a frozen, non-empty audience', () => {
    const contract = draft();
    expect(validateEmailCampaignV1({ ...contract, audience: { ...contract.audience, audienceId: null, checksum: null } })
      .some((issue) => issue.message === 'freeze the audience before scheduling')).toBe(true);
    expect(validateEmailCampaignV1({ ...contract, audience: { ...contract.audience, recipientCount: 0 } })
      .some((issue) => issue.message === 'the frozen audience is empty')).toBe(true);
  });

  it('rejects an unknown merge field that would ship literally', () => {
    const contract = draft();
    const issues = validateEmailCampaignV1({
      ...contract,
      content: { ...contract.content, bodyTemplate: 'Hi {{first_name}},' },
    });
    expect(issues).toContainEqual({
      section: 'content',
      field: 'step 1 {{first_name}}',
      message: 'unknown merge field — it would ship literally to the recipient',
    });
  });

  it('flags an unknown merge field in a follow-up step too, naming the step', () => {
    const contract = draft();
    const issues = validateEmailCampaignV1({
      ...contract,
      content: {
        ...contract.content,
        followUpSteps: [
          { subject: 'Re:', previewText: 'p', bodyTemplate: 'Hi {{first_name}}' },
          contract.content.followUpSteps[1]!,
        ],
      },
    });
    expect(issues.some((issue) => issue.field === 'step 2 {{first_name}}')).toBe(true);
  });

  it('requires the bounded sequence to have every step written', () => {
    const contract = draft();
    const issues = validateEmailCampaignV1({ ...contract, content: { ...contract.content, followUpSteps: [] } });
    expect(issues.some((issue) => issue.message.includes('3 steps are declared but 1 message(s) are approved'))).toBe(true);
  });

  it('rejects insecure links and missing UTM values', () => {
    const contract = draft();
    expect(validateEmailCampaignV1({ ...contract, content: { ...contract.content, bodyTemplate: 'See http://example.com' } })
      .some((issue) => issue.field === 'step 1 links')).toBe(true);
    expect(validateEmailCampaignV1({ ...contract, tracking: { ...contract.tracking, utmCampaign: '' } })
      .some((issue) => issue.field === 'utmCampaign')).toBe(true);
  });

  it('keeps the bounded three-step sequence and its caps honest', () => {
    const contract = draft();
    expect(validateEmailCampaignV1({ ...contract, schedule: { ...contract.schedule, maxSequenceSteps: 5, sequenceDelaysDays: [0, 2, 4, 6, 8] } })
      .some((issue) => issue.message.includes('at most three messages'))).toBe(true);
    expect(validateEmailCampaignV1({ ...contract, schedule: { ...contract.schedule, sequenceDelaysDays: [0, 4] } })
      .some((issue) => issue.field === 'sequenceDelaysDays')).toBe(true);
    expect(validateEmailCampaignV1({ ...contract, audience: { ...contract.audience, recipientCount: 500 } })
      .some((issue) => issue.message === 'the frozen audience exceeds the declared cap')).toBe(true);
  });

  it('requires a valid business-hours send window', () => {
    const contract = draft();
    expect(validateEmailCampaignV1({ ...contract, schedule: { ...contract.schedule, sendWindowStartHour: 18, sendWindowEndHour: 9 } })
      .some((issue) => issue.field === 'sendWindow')).toBe(true);
  });
});

describe('section states', () => {
  it('reports every section complete for a ready campaign', () => {
    const states = deriveSectionStates({
      ...draft(),
      governance: { ...draft().governance, testAcceptedAt: '2026-08-02T00:00:00.000Z', testVersionChecksum: versionChecksum(draft()) },
    });
    for (const key of ['goal', 'sender', 'audience', 'subject', 'content', 'preview_test']) {
      expect(states.find((state) => state.key === key)?.state).toBe('complete');
    }
  });

  it('shows the sender and results as unavailable, not as something the operator can fix', () => {
    const contract = { ...draft(), sender: { ...draft().sender, authenticated: false } };
    const states = deriveSectionStates(contract);
    expect(states.find((state) => state.key === 'sender')?.state).toBe('unavailable');
    expect(states.find((state) => state.key === 'preview_test')?.state).toBe('unavailable');
    expect(states.find((state) => state.key === 'results')?.state).toBe('unavailable');
    expect(isReadyToSchedule(contract)).toBe(false);
  });

  it('invalidates a passed test when the campaign changes afterwards', () => {
    const original = draft();
    const tested: EmailCampaignV1 = {
      ...original,
      governance: { ...original.governance, testAcceptedAt: '2026-08-02T00:00:00.000Z', testVersionChecksum: versionChecksum(original) },
    };
    expect(deriveSectionStates(tested).find((state) => state.key === 'preview_test')?.state).toBe('complete');

    const edited: EmailCampaignV1 = { ...tested, content: { ...tested.content, subject: 'A different subject' } };
    const state = deriveSectionStates(edited).find((item) => item.key === 'preview_test');
    expect(state?.state).toBe('needs_attention');
    expect(state?.detail).toContain('Re-test this exact version');
  });
});

describe('version checksum', () => {
  it('changes when anything a recipient would experience changes', () => {
    const base = draft();
    const original = versionChecksum(base);
    expect(versionChecksum({ ...base, content: { ...base.content, subject: 'Other' } })).not.toBe(original);
    expect(versionChecksum({ ...base, audience: { ...base.audience, checksum: 'different' } })).not.toBe(original);
    expect(versionChecksum({ ...base, schedule: { ...base.schedule, startAt: '2026-09-01T13:00:00.000Z' } })).not.toBe(original);
    expect(versionChecksum({ ...base, sender: { ...base.sender, displayName: 'Someone else' } })).not.toBe(original);
  });

  it('ignores bookkeeping that a recipient never sees', () => {
    const base = draft();
    expect(versionChecksum({ ...base, updatedAt: '2027-01-01T00:00:00.000Z' })).toBe(versionChecksum(base));
    expect(versionChecksum({ ...base, goal: { ...base.goal, retryPolicy: 'reworded' } })).toBe(versionChecksum(base));
  });
});

describe('immutability after scheduling', () => {
  const scheduled: EmailCampaignV1 = {
    ...draft(),
    state: 'scheduled',
    governance: {
      ...draft().governance,
      testAcceptedAt: '2026-08-02T00:00:00.000Z',
      testVersionChecksum: 'checksum-of-v1',
      preflightPassedAt: '2026-08-02T00:00:00.000Z',
      scheduledAt: '2026-08-02T00:00:00.000Z',
      lockedAt: '2026-08-02T00:00:00.000Z',
    },
  };

  it('a draft edits in place', () => {
    const { contract, newVersion } = applyContractEdit(draft(), { content: { subject: 'New subject' } });
    expect(newVersion).toBe(false);
    expect(contract.version).toBe(1);
    expect(contract.content.subject).toBe('New subject');
  });

  it('a meaningful edit to a scheduled version creates version 2 in draft', () => {
    expect(isLocked(scheduled)).toBe(true);
    const { contract, newVersion } = applyContractEdit(scheduled, { content: { subject: 'New subject' } });
    expect(newVersion).toBe(true);
    expect(contract.version).toBe(2);
    expect(contract.state).toBe('draft');
    expect(scheduled.content.subject).toBe('A white-labelled AI visibility baseline for {{company}}');
  });

  it('the new version inherits no approval from the version it replaced', () => {
    const stopped: EmailCampaignV1 = {
      ...scheduled,
      state: 'stopped',
      governance: { ...scheduled.governance, stopReason: 'zero replies at the bounded stop' },
    };
    const { contract } = applyContractEdit(stopped, { content: { subject: 'New subject' } });
    expect(contract.audience).toEqual({
      segment: stopped.audience.segment,
      audienceId: null,
      checksum: null,
      recipientCount: null,
      frozenAt: null,
      excludedCounts: {},
    });
    expect(contract.governance).toMatchObject({
      preflightPassedAt: null,
      testAcceptedAt: null,
      testVersionChecksum: null,
      scheduledAt: null,
      lockedAt: null,
      stopReason: null,
    });
  });

  it('bookkeeping on a locked version does not fork a new one', () => {
    const { contract, newVersion } = applyContractEdit(scheduled, { governance: { stopReason: 'operator stopped the campaign' } });
    expect(newVersion).toBe(false);
    expect(contract.version).toBe(1);
    expect(contract.state).toBe('scheduled');
    expect(contract.governance.stopReason).toBe('operator stopped the campaign');
  });
});

describe('contract identity', () => {
  it('rejects an unknown contract name', () => {
    const issues = validateEmailCampaignV1({ ...draft(), contract: 'email_campaign_v2' as typeof EMAIL_CAMPAIGN_CONTRACT });
    expect(issues.some((issue) => issue.field === 'contract')).toBe(true);
  });
});
