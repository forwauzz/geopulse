import { describe, expect, it } from 'vitest';
import { buildAuditCampaignContracts, buildAuditDryRun, classifyApolloLead, evaluateAuditCampaignGate } from './audit-campaign-readiness';

describe('audit campaign readiness', () => {
  it('keeps business and agency offers distinct and produces a zero-send dry run', () => {
    const contracts = buildAuditCampaignContracts('2026-08-09T12:00:00.000Z');
    expect(contracts.directBusiness.goal.buyer).not.toBe(contracts.agencyPartner.goal.buyer);
    expect(contracts.directBusiness.content.bodyTemplate).toContain('10-page');
    expect(contracts.agencyPartner.content.bodyTemplate).toContain('client');
    expect(contracts.directBusiness.schedule.sequenceDelaysDays).toEqual([0, 4]);

    const manifest = buildAuditDryRun({
      contract: contracts.directBusiness,
      recipients: [{ contactId: 'c1', email: 'owner@techehealthservices.com', name: 'Tamon', company: 'Teché Health Services', companyDomain: 'techehealthservices.com', personalizationReason: null, personalizationSourceUrl: null }],
      scansByContactId: new Map([['c1', { siteUrl: 'https://techehealthservices.com/', score: 74, grade: 'C', topIssues: [{ check: 'Canonical URL', fix: 'Add a canonical.' }, { check: 'Buyer questions', fix: 'Add direct answers.' }], completedAt: '2026-08-09T12:00:00.000Z', passedChecks: 2, totalChecks: 5, eligibleDestinations: 3, testedDestinations: 4, retrievalScore: 80, understandingTrustScore: 69, reportUrl: 'https://getgeopulse.com/preview/token', reportThumbnailUrl: 'https://getgeopulse.com/thumbnail/token' }]]),
      appUrl: 'https://getgeopulse.com',
      campaignFrozen: true,
      reportQaPassed: true,
      linksValid: true,
      suppressionLoaded: true,
    });
    expect(manifest.mode).toBe('dry_run');
    expect(manifest.providerCalls).toBe(0);
    expect(manifest.recipients).toHaveLength(1);
    expect(manifest.ready).toBe(true);
  });

  it('fails closed while frozen evidence is missing and classifies Apollo records without sending', () => {
    expect(evaluateAuditCampaignGate({ campaignFrozen: false, reportQaPassed: true, linksValid: true, suppressionLoaded: true, unresolvedRecipients: 0 }).ready).toBe(false);
    expect(classifyApolloLead({ email: 'ceo@clinic.ca', companyDomain: 'clinic.ca', companyType: 'health clinic', title: 'Owner' })).toBe('direct_business');
    expect(classifyApolloLead({ email: 'owner@northstar.ca', companyDomain: 'northstar.ca', companyType: 'managed service provider', title: 'Founder' })).toBe('agency_partner');
  });
});
