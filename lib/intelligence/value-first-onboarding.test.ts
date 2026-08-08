import { describe, expect, it } from 'vitest';
import {
  buildOrganizationOnboardingProposal,
  confirmOrganizationOnboarding,
  formatOnboardingMarket,
  onboardingCorrectionMessage,
  onboardingQuestion,
  proposalWithLegacyHints,
  proposalWithCorrections,
  timeZoneForMarket,
} from './value-first-onboarding';
import type { ExactDomainResolution } from './organization-resolver';

function resolution(overrides: Partial<ExactDomainResolution> = {}): ExactDomainResolution {
  return {
    resolverVersion: 'organization-resolver-v1',
    geographicPolicyVersion: 'organization-geography-v1',
    resolvedAt: '2026-08-02T00:00:00.000Z',
    status: 'proposed',
    reasonCodes: [],
    identity: {
      requestedDomain: 'example.ca',
      canonicalDomain: 'example.ca',
      approvedAliases: [],
      redirectChain: ['https://example.ca/'],
    },
    organization: {
      displayName: 'Example Clinic',
      category: 'preventive medicine clinic',
      services: ['preventive medicine', 'travel health'],
      buyer: 'patients',
      publicEmail: null,
      publicTelephone: null,
    },
    markets: [{
      scope: 'local',
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      locality: 'Pointe-Claire',
      serviceAreas: ["Montreal's West Island"],
      languages: ['en-CA', 'fr-CA'],
      timezone: 'America/Toronto',
    }],
    evidence: [],
    confidence: 0.95,
    limitations: [],
    ...overrides,
  };
}

describe('time zone from market context', () => {
  it('resolves Canadian and US subdivisions without asking', () => {
    expect(timeZoneForMarket('CA', 'CA-QC')).toBe('America/Toronto');
    expect(timeZoneForMarket('CA', 'CA-BC')).toBe('America/Vancouver');
    expect(timeZoneForMarket('CA', 'CA-NL')).toBe('America/St_Johns');
    expect(timeZoneForMarket('US', 'US-CA')).toBe('America/Los_Angeles');
    expect(timeZoneForMarket('US', 'US-NY')).toBe('America/New_York');
    expect(timeZoneForMarket('US', 'US-AZ')).toBe('America/Phoenix');
  });

  it('still asks when the market spans zones', () => {
    // A country alone does not settle Canada or the US, so guessing would report a
    // client's schedule in a time they never chose.
    expect(timeZoneForMarket('CA', null)).toBeNull();
    expect(timeZoneForMarket('US', null)).toBeNull();
    expect(timeZoneForMarket('BR', null)).toBeNull();
    expect(timeZoneForMarket(null, null)).toBeNull();
  });

  it('accepts a single-zone country', () => {
    expect(timeZoneForMarket('GB', null)).toBe('Europe/London');
  });
});

describe('onboarding correction loop', () => {
  const incomplete = () => buildOrganizationOnboardingProposal({
    intent: 'agency',
    submittedName: 'Westside Clinic',
    submittedWebsite: 'westside.example',
    resolution: resolution({
      status: 'needs_review',
      reasonCodes: ['location_missing'],
      markets: [{
        scope: null, countryCode: null, subdivisionCode: null, locality: null,
        serviceAreas: [], languages: ['en'], timezone: null,
      }],
    }),
  });

  it('completes without a time-zone question once the market settles it', () => {
    expect(confirmOrganizationOnboarding(incomplete(), {
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      marketScope: 'local',
      locality: 'Pointe-Claire',
    })).toMatchObject({ ok: true, value: { timezone: 'America/Toronto' } });
  });

  it('keeps every other correction when one field is unusable', () => {
    const result = confirmOrganizationOnboarding(incomplete(), {
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      marketScope: 'local',
      locality: 'Pointe-Claire',
      timezone: 'Montreal time',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missingFields).toContain('timezone');
    expect(result.invalidFields).toEqual(['timezone']);
    // The whole point: a retry must not cost the answers that were already right.
    expect(result.submitted).toMatchObject({
      country_code: 'CA',
      subdivision_code: 'CA-QC',
      market_scope: 'local',
      locality: 'Pointe-Claire',
      timezone: 'Montreal time',
    });
  });

  it('re-renders the confirmation from the corrections, not the original detection', () => {
    const proposal = incomplete();
    const result = confirmOrganizationOnboarding(proposal, {
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      marketScope: 'local',
      locality: 'Pointe-Claire',
      timezone: 'Montreal time',
    });
    if (result.ok) throw new Error('expected a correction round');
    const next = proposalWithCorrections(proposal, result);
    expect(next).toMatchObject({
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      marketScope: 'local',
      locality: 'Pointe-Claire',
      timezone: 'Montreal time',
    });
    expect(onboardingCorrectionMessage(result.invalidFields)).toMatch(/IANA/);
  });

  it('does not blame the person for a time zone they never typed', () => {
    const result = confirmOrganizationOnboarding(incomplete(), { countryCode: 'BR', marketScope: 'national' });
    if (result.ok) throw new Error('expected a correction round');
    expect(result.missingFields).toContain('timezone');
    expect(result.invalidFields).toEqual([]);
  });
});

describe('value-first onboarding contract', () => {
  it('fills only exact-site gaps from a legacy client profile', () => {
    const incomplete = buildOrganizationOnboardingProposal({
      intent: 'agency',
      submittedName: 'Stability Labs',
      submittedWebsite: 'https://stabilitylab.com',
      resolution: resolution({
        organization: {
          ...resolution().organization,
          displayName: 'Stability Labs',
          category: null,
        },
        markets: [{
          scope: null,
          countryCode: null,
          subdivisionCode: null,
          locality: null,
          serviceAreas: [],
          languages: [],
          timezone: null,
        }],
      }),
    });

    const proposal = proposalWithLegacyHints(incomplete, {
      category: 'Vestibular rehabilitation clinic',
      location: 'Vancouver',
    });

    expect(proposal).toMatchObject({
      category: 'Vestibular rehabilitation clinic',
      serviceAreas: ['Vancouver'],
    });
    expect(proposal.missingFields).not.toContain('category');
    expect(confirmOrganizationOnboarding(proposal, {
      countryCode: 'CA',
      marketScope: 'local',
      languages: 'en-CA',
      timezone: 'America/Vancouver',
    })).toMatchObject({
      ok: true,
      value: { serviceAreas: ['Vancouver'] },
    });
  });

  it('never overwrites exact-site category or service areas with legacy hints', () => {
    const exact = buildOrganizationOnboardingProposal({
      intent: 'agency',
      submittedName: 'Example Clinic',
      submittedWebsite: 'https://example.ca',
      resolution: resolution(),
    });

    expect(proposalWithLegacyHints(exact, {
      category: 'legacy category',
      location: 'legacy location',
    })).toMatchObject({
      category: 'preventive medicine clinic',
      serviceAreas: ["Montreal's West Island"],
    });
  });

  it('turns a complete exact-site resolution into an understandable confirmation', () => {
    const proposal = buildOrganizationOnboardingProposal({
      intent: 'agency',
      submittedName: 'Example Clinic',
      submittedWebsite: 'https://example.ca',
      resolution: resolution(),
    });

    expect(proposal.missingFields).toEqual([]);
    expect(formatOnboardingMarket(proposal)).toBe('Pointe-Claire, CA-QC, CA · local');
    expect(confirmOrganizationOnboarding(proposal, {})).toMatchObject({
      ok: true,
      value: {
        displayName: 'Example Clinic',
        countryCode: 'CA',
        languages: ['en-CA', 'fr-CA'],
        timezone: 'America/Toronto',
      },
    });
  });

  it('asks only for missing fields and accepts focused corrections', () => {
    const proposal = buildOrganizationOnboardingProposal({
      intent: 'business',
      submittedName: 'Northstar IT',
      submittedWebsite: 'northstar.example',
      resolution: resolution({
        status: 'needs_review',
        reasonCodes: ['location_missing', 'country_missing', 'market_scope_missing'],
        organization: {
          ...resolution().organization,
          displayName: 'Northstar IT',
          category: 'managed IT services',
        },
        markets: [{
          scope: null,
          countryCode: null,
          subdivisionCode: null,
          locality: null,
          serviceAreas: [],
          languages: ['en'],
          timezone: null,
        }],
      }),
    });

    expect(proposal.missingFields).toEqual(['country_code', 'market_scope', 'timezone']);
    expect(onboardingQuestion(proposal.missingFields[0]!)).toMatch(/country/i);
    expect(confirmOrganizationOnboarding(proposal, {
      countryCode: 'US',
      marketScope: 'national',
      timezone: 'America/New_York',
    })).toMatchObject({
      ok: true,
      value: { countryCode: 'US', marketScope: 'national', languages: ['en-US'] },
    });
  });

  it('keeps a local baseline blocked until its missing locality is answered', () => {
    const proposal = buildOrganizationOnboardingProposal({
      intent: 'agency',
      submittedName: 'Local Practice',
      submittedWebsite: 'practice.example',
      resolution: resolution({
        markets: [{
          ...resolution().markets[0]!,
          locality: null,
          serviceAreas: [],
        }],
      }),
    });

    expect(proposal.missingFields).toEqual(['locality']);
    expect(confirmOrganizationOnboarding(proposal, {})).toEqual({
      ok: false,
      missingFields: ['locality'],
      // Nothing was typed, so there is nothing to hand back and nothing to blame.
      submitted: {},
      invalidFields: [],
    });
  });

  it('accepts a familiar country name and a corrected province code', () => {
    const proposal = buildOrganizationOnboardingProposal({
      intent: 'agency',
      submittedName: 'Example Clinic',
      submittedWebsite: 'example.ca',
      resolution: resolution(),
    });

    expect(confirmOrganizationOnboarding(proposal, {
      countryCode: 'Canada',
      subdivisionCode: 'ca-on',
    })).toMatchObject({
      ok: true,
      value: { countryCode: 'CA', subdivisionCode: 'CA-ON' },
    });
  });

  it('fails closed on a malformed province code or time zone', () => {
    const proposal = buildOrganizationOnboardingProposal({
      intent: 'business',
      submittedName: 'Example Clinic',
      submittedWebsite: 'example.ca',
      resolution: resolution(),
    });

    expect(confirmOrganizationOnboarding(proposal, {
      subdivisionCode: 'Ontario',
      timezone: 'Toronto time',
    })).toEqual({
      ok: false,
      missingFields: ['subdivision_code', 'timezone'],
      // Both bad answers come back rather than reverting to the detected values,
      // so the person can see and fix what they actually typed.
      submitted: { subdivision_code: 'Ontario', timezone: 'Toronto time' },
      invalidFields: ['timezone'],
    });
  });
});
