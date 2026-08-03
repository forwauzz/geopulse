import { describe, expect, it } from 'vitest';
import {
  AGENCY_CHALLENGER_CAMPAIGN_ID,
  AGENCY_REPORTING_PILOT_CONTENT,
  AGENCY_REPORTING_PILOT_GOAL,
  AGENCY_REPORTING_PILOT_KEY,
  AGENCY_REPORTING_PILOT_RECIPIENTS,
  AGENCY_REPORTING_PILOT_SCHEDULE,
  AGENCY_REPORTING_PILOT_SEGMENT,
  AGENCY_REPORTING_PILOT_STEPS,
  AGENCY_REPORTING_PILOT_TRACKING,
} from './agency-reporting-pilot';
import { MONTREAL_PUBLISHED_SEGMENT } from './agency-contact-intake';
import {
  allStepContent,
  createDraftContract,
  extractMergeFields,
  validateEmailCampaignV1,
  type EmailCampaignV1,
} from './email-campaign-contract';
import { SCAN_MERGE_FIELDS, findLiteralTokens, renderCampaignPreview, unresolvedMergeFields, type PreviewContact } from './email-campaign-preview';
import { evaluateSchedule, evaluateVolume } from './email-campaign-preflight';

const CONTACT: PreviewContact = {
  contactId: 'c1',
  email: 'ann@royco.ca',
  name: 'Ann Roy',
  company: 'Roy Co',
  companyDomain: 'royco.ca',
  personalizationReason: null,
  personalizationSourceUrl: null,
};

function pilot(overrides: Partial<EmailCampaignV1> = {}): EmailCampaignV1 {
  const base = createDraftContract({
    campaignId: AGENCY_CHALLENGER_CAMPAIGN_ID,
    interventionId: 'int-agency-reporting',
    interventionKey: AGENCY_REPORTING_PILOT_KEY,
    goal: AGENCY_REPORTING_PILOT_GOAL,
    sender: {
      displayName: 'Elena at GEO-Pulse',
      fromAddressRef: 'GEOPULSE_CAMPAIGN_FROM_EMAIL',
      replyToRef: 'GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL',
      authenticated: true,
      authenticationEvidence: 'getgeopulse.com verified',
    },
    segment: AGENCY_REPORTING_PILOT_SEGMENT,
    content: AGENCY_REPORTING_PILOT_CONTENT,
    tracking: AGENCY_REPORTING_PILOT_TRACKING,
    schedule: { ...AGENCY_REPORTING_PILOT_SCHEDULE, startAt: '2026-08-10T13:00:00.000Z' },
    nowIso: '2026-08-02T00:00:00.000Z',
  });
  return {
    ...base,
    audience: {
      segment: AGENCY_REPORTING_PILOT_SEGMENT,
      audienceId: 'aud-1',
      checksum: 'sum-1',
      recipientCount: AGENCY_REPORTING_PILOT_RECIPIENTS,
      frozenAt: '2026-08-02T00:00:00.000Z',
      excludedCounts: {},
    },
    ...overrides,
  };
}

describe('the pilot matches the plan it was specified from', () => {
  it('targets the bounded Montreal agency cohort under the challenger campaign', () => {
    expect(AGENCY_REPORTING_PILOT_KEY).toBe('agency-reporting-montreal-v1');
    expect(AGENCY_REPORTING_PILOT_SEGMENT).toBe(MONTREAL_PUBLISHED_SEGMENT);
    expect(AGENCY_REPORTING_PILOT_RECIPIENTS).toBe(25);
    // The challenger seeded by migration 078 — not a new campaign, and not the MSP primary.
    expect(AGENCY_CHALLENGER_CAMPAIGN_ID).toBe('00000000-0000-4000-8000-000000000802');
  });

  it('declares one meaningful variable and both governing conditions', () => {
    expect(AGENCY_REPORTING_PILOT_GOAL.meaningfulVariable).toContain('offer and message only');
    expect(AGENCY_REPORTING_PILOT_GOAL.successCondition).toContain('qualified reply');
    expect(AGENCY_REPORTING_PILOT_GOAL.stopCondition).toContain('25 provider-accepted');
    expect(AGENCY_REPORTING_PILOT_GOAL.closureCondition).toContain('unsubscribe');
  });

  it('keeps the bounded three-step cadence at days 0, 4, and 10', () => {
    expect(AGENCY_REPORTING_PILOT_SCHEDULE.maxSequenceSteps).toBe(3);
    expect(AGENCY_REPORTING_PILOT_SCHEDULE.sequenceDelaysDays).toEqual([0, 4, 10]);
    expect(AGENCY_REPORTING_PILOT_STEPS).toHaveLength(3);
    expect(allStepContent(pilot().content)).toHaveLength(3);
  });

  it('paces the whole cohort inside one business-hours window', () => {
    expect(evaluateSchedule(pilot(), Date.parse('2026-08-03T12:00:00.000Z')).ok).toBe(true);
    expect(evaluateVolume(pilot()).ok).toBe(true);
  });
});

describe('the approved copy', () => {
  it('satisfies the full contract', () => {
    expect(validateEmailCampaignV1(pilot())).toEqual([]);
  });

  it('uses no scan-derived merge field, because these agencies have not been scanned', () => {
    const fields = extractMergeFields(
      ...allStepContent(pilot().content).flatMap((step) => [step.subject, step.previewText, step.bodyTemplate]),
    );
    for (const scanField of SCAN_MERGE_FIELDS) {
      expect(fields).not.toContain(scanField);
    }
  });

  it('resolves completely for a representative contact at every step', () => {
    for (let step = 1; step <= 3; step += 1) {
      expect(unresolvedMergeFields({ contract: pilot(), contact: CONTACT, sequenceStep: step })).toEqual([]);
    }
  });

  it('renders every step through the production renderer with no literal tokens left', () => {
    for (let step = 1; step <= 3; step += 1) {
      const preview = renderCampaignPreview({
        contract: pilot(),
        contact: CONTACT,
        appUrl: 'https://getgeopulse.com',
        sequenceStep: step,
      });
      expect(findLiteralTokens(preview.html)).toEqual([]);
      expect(preview.subject.length).toBeGreaterThan(0);
      // CASL: the brand shell puts identification and a working unsubscribe on every message.
      expect(preview.html).toContain(preview.unsubscribeUrl);
    }
  });

  it('carries the campaign UTM values and a per-step content value', () => {
    const step2 = renderCampaignPreview({ contract: pilot(), contact: CONTACT, appUrl: 'https://getgeopulse.com', sequenceStep: 2 });
    expect(step2.html).toContain('utm_campaign=agency-reporting-montreal-v1');
    expect(step2.html).toContain('utm_content=agency-reporting-baseline-step-2');
    expect(step2.subject).toBe('Re: a white-labelled baseline for one of your clients');
  });

  it('makes no ranking, citation, or guaranteed-result claim', () => {
    const copy = allStepContent(pilot().content)
      .flatMap((step) => [step.subject, step.previewText, step.bodyTemplate])
      .join('\n')
      .toLowerCase();
    for (const forbidden of ['guarantee', 'rank #1', 'first page', 'we will get you', 'increase your traffic by']) {
      expect(copy).not.toContain(forbidden);
    }
    // And it says plainly what the report is not.
    expect(copy).toContain('not a ranking promise');
  });

  it('gives the recipient an explicit way to end the sequence in the final message', () => {
    const last = AGENCY_REPORTING_PILOT_STEPS[2]!;
    expect(last.bodyTemplate.toLowerCase()).toContain('close it out');
  });
});

describe('tracking', () => {
  it('attributes to the pilot rather than to generic outreach', () => {
    expect(AGENCY_REPORTING_PILOT_TRACKING.utmCampaign).toBe(AGENCY_REPORTING_PILOT_KEY);
    expect(AGENCY_REPORTING_PILOT_TRACKING.tags).toContain('agency-challenger');
  });
});
