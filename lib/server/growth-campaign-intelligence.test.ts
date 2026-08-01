import { describe, expect, it } from 'vitest';
import {
  campaignBriefSections,
  classifyCampaignVertical,
  selectCampaignScopedOpportunities,
  type GrowthCampaign,
} from './growth-campaign-intelligence';

const campaigns: GrowthCampaign[] = [
  {
    id: 'msp',
    campaign_key: 'msp-primary',
    role: 'primary',
    status: 'active',
    vertical: 'msp_it_services',
    subvertical: 'managed_service_providers',
    geo_region: 'Quebec, Canada',
    buyer_role: 'msp_owner_operator',
    primary_problem: 'AI systems do not understand the offer.',
    offer_key: 'visibility_baseline',
    cta_goal: 'free_scan_then_walkthrough',
    allocation_percent: 80,
    success_condition: 'One qualified reply.',
    stop_condition: 'Revise after the bounded sample.',
  },
  {
    id: 'agency',
    campaign_key: 'agency-challenger',
    role: 'challenger',
    status: 'active',
    vertical: 'marketing_agencies',
    subvertical: 'small_marketing_agencies',
    geo_region: 'Canada',
    buyer_role: 'agency_owner',
    primary_problem: 'Client reporting is manual.',
    offer_key: 'agency_baseline',
    cta_goal: 'free_scan_then_walkthrough',
    allocation_percent: 20,
    success_condition: 'One qualified reply.',
    stop_condition: 'Pause after the bounded sample.',
  },
];

describe('vertical campaign intelligence', () => {
  it('keeps broad category evidence indexed but outside campaign execution', () => {
    expect(classifyCampaignVertical({
      id: 'broad',
      title: 'AI visibility platform',
      evidence: 'A competitor ranks for a category term.',
    })).toEqual({ vertical: 'background', reason: 'background' });
  });

  it('uses explicit metadata before language classification', () => {
    expect(classifyCampaignVertical({
      id: 'agency',
      title: 'Generic reporting workflow',
      metadata: { campaign_vertical: 'marketing_agencies' },
    })).toEqual({
      vertical: 'marketing_agencies',
      reason: 'explicit_vertical_metadata',
    });
  });

  it('recognizes explicit MSP and agency buyer language', () => {
    expect(classifyCampaignVertical({
      id: 'msp',
      title: 'ChatGPT recommendations for MSPs',
    }).vertical).toBe('msp_it_services');
    expect(classifyCampaignVertical({
      id: 'agency',
      recommendation: 'Create a white-label client reporting guide.',
    }).vertical).toBe('marketing_agencies');
  });

  it('allocates campaign-facing work 80/20 and excludes background evidence', () => {
    const opportunities = [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `msp-${index}`,
        growth_campaign_id: 'msp',
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `agency-${index}`,
        growth_campaign_id: 'agency',
      })),
      { id: 'background', title: 'AI visibility platform' },
    ];
    const selected = selectCampaignScopedOpportunities(opportunities, campaigns, 10);
    expect(selected.filter((item) => item.campaign.role === 'primary')).toHaveLength(8);
    expect(selected.filter((item) => item.campaign.role === 'challenger')).toHaveLength(2);
    expect(selected.some((item) => item.opportunity.id === 'background')).toBe(false);
  });

  it('does not let the challenger consume unused primary capacity', () => {
    const selected = selectCampaignScopedOpportunities(
      Array.from({ length: 10 }, (_, index) => ({
        id: `agency-${index}`,
        growth_campaign_id: 'agency',
      })),
      campaigns,
      10,
    );
    expect(selected).toHaveLength(2);
  });

  it('keeps one primary and one challenger when the active-family cap is two', () => {
    const selected = selectCampaignScopedOpportunities(
      [
        { id: 'msp-1', growth_campaign_id: 'msp' },
        { id: 'msp-2', growth_campaign_id: 'msp' },
        { id: 'agency-1', growth_campaign_id: 'agency' },
      ],
      campaigns,
      2,
    );
    expect(selected.filter((item) => item.campaign.role === 'primary')).toHaveLength(1);
    expect(selected.filter((item) => item.campaign.role === 'challenger')).toHaveLength(1);
  });

  it('injects buyer, offer, success, and stop context into the brief', () => {
    const selected = selectCampaignScopedOpportunities(
      [{ id: 'msp-opportunity', growth_campaign_id: 'msp' }],
      campaigns,
      1,
    )[0]!;
    expect(campaignBriefSections(selected).join('\n')).toContain('msp_owner_operator');
    expect(campaignBriefSections(selected).join('\n')).toContain('visibility_baseline');
    expect(campaignBriefSections(selected).join('\n')).toContain('One qualified reply.');
    expect(campaignBriefSections(selected).join('\n')).toContain('Revise after the bounded sample.');
  });
});
