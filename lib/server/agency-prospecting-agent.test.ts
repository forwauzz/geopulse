import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeGeminiFailure,
  discoverAgencies,
  parseAgencyDiscovery,
  resolveAgencyProspectingModel,
  selectPublicBusinessEmail,
} from './agency-prospecting-agent';

describe('agency prospecting qualification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('falls back to OpenAI grounded web search when Gemini quota is exhausted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { status: 'RESOURCE_EXHAUSTED', message: 'Billing required.' },
      }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              agencies: [{ name: 'Grounded Agency', url: 'https://grounded.example/' }],
            }),
          }],
        }],
      }), { status: 200 }));

    await expect(discoverAgencies({
      GEMINI_API_KEY: 'gemini-test',
      OPENAI_API_KEY: 'openai-test',
    }, 'Toronto, Canada', 1)).resolves.toEqual({
      ok: true,
      provider: 'openai',
      agencies: [{ name: 'Grounded Agency', url: 'https://grounded.example/' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      model: 'gpt-5.6-luna',
      tools: [{ type: 'web_search' }],
    });
  });
});
