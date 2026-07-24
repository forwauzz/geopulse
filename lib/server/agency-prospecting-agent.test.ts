import { describe, expect, it } from 'vitest';
import { parseAgencyDiscovery, selectPublicBusinessEmail } from './agency-prospecting-agent';

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
});
