import { describe, expect, it } from 'vitest';
import {
  describeGeminiFailure,
  parseAgencyDiscovery,
  resolveAgencyProspectingModel,
  selectPublicBusinessEmail,
} from './agency-prospecting-agent';

describe('agency prospecting qualification', () => {
  it('deduplicates grounded agency domains', () => {
    expect(parseAgencyDiscovery(JSON.stringify({ agencies: [
      { name: 'A', url: 'https://agency.example/' },
      { name: 'A duplicate', url: 'https://www.agency.example/contact' },
      { name: 'B', url: 'https://other.example/' },
    ] }))).toHaveLength(2);
  });

  it('accepts a relevant email published on the official domain', () => {
    expect(selectPublicBusinessEmail(
      '<a href="mailto:info@agency.example">Email</a><span>owner@agency.example</span>',
      'https://agency.example'
    )).toBe('info@agency.example');
  });

  it('rejects third-party, no-reply, and explicit no-solicitation contacts', () => {
    expect(selectPublicBusinessEmail('hello@gmail.com noreply@agency.example', 'https://agency.example')).toBeNull();
    expect(selectPublicBusinessEmail('No unsolicited marketing. hello@agency.example', 'https://agency.example')).toBeNull();
  });

  it('does not reuse a platform scan model that lacks grounding support', () => {
    expect(resolveAgencyProspectingModel({
      GEMINI_MODEL: 'gemini-2.5-flash-lite-preview-06-17',
    })).toBe('gemini-3.5-flash');
    expect(resolveAgencyProspectingModel({
      AGENCY_PROSPECTING_GEMINI_MODEL: 'gemini-2.5-pro',
    })).toBe('gemini-2.5-pro');
  });

  it('turns provider quota failures into an actionable operator reason', async () => {
    const response = new Response(JSON.stringify({
      error: {
        status: 'RESOURCE_EXHAUSTED',
        message: 'Please check your plan and billing details.',
      },
    }), { status: 429 });
    await expect(describeGeminiFailure(response)).resolves.toBe('gemini_quota_or_billing_exhausted');
  });
});
