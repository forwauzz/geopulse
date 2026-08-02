import { describe, expect, it } from 'vitest';
import {
  buildOrganizationOnboardingProposal,
  confirmOrganizationOnboarding,
  formatOnboardingMarket,
  onboardingQuestion,
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

describe('value-first onboarding contract', () => {
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
    });
  });
});
