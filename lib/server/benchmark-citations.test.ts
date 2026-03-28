import { describe, expect, it } from 'vitest';
import { parseBenchmarkCitations } from './benchmark-citations';
import type { BenchmarkDomainRow } from './benchmark-repository';

const domain: BenchmarkDomainRow = {
  id: 'domain-1',
  domain: 'www.geopulse.ai',
  canonical_domain: 'geopulse.ai',
  site_url: 'https://www.geopulse.ai/',
  display_name: 'GeoPulse',
  vertical: 'saas',
  subvertical: null,
  geo_region: null,
  is_customer: true,
  is_competitor: false,
  metadata: { brand_aliases: ['Geo Pulse'] },
  created_at: '2026-03-26T00:00:00.000Z',
  updated_at: '2026-03-26T00:00:00.000Z',
};

describe('parseBenchmarkCitations', () => {
  it('extracts explicit urls with strongest priority', () => {
    const citations = parseBenchmarkCitations(
      'Sources: https://www.geopulse.ai/pricing and https://docs.example.com/setup.',
      domain
    );

    expect(citations).toHaveLength(2);
    expect(citations[0]?.citationType).toBe('explicit_url');
    expect(citations[0]?.citedDomain).toBe('geopulse.ai');
    expect(citations[1]?.citedDomain).toBe('docs.example.com');
  });

  it('does not duplicate a domain mention when a stronger url for the same domain exists', () => {
    const citations = parseBenchmarkCitations(
      'Visit https://www.geopulse.ai/pricing or geopulse.ai for details.',
      domain
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.citationType).toBe('explicit_url');
  });

  it('extracts explicit domain mentions when no url exists', () => {
    const citations = parseBenchmarkCitations(
      'Good references include example.com and docs.example.org for buyers.',
      domain
    );

    expect(citations.map((citation) => citation.citedDomain)).toEqual([
      'example.com',
      'docs.example.org',
    ]);
    expect(citations.every((citation) => citation.citationType === 'explicit_domain')).toBe(true);
  });

  it('falls back to brand mention for the measured domain when mapping is clear', () => {
    const citations = parseBenchmarkCitations(
      'GeoPulse is often mentioned in AI visibility conversations.',
      domain
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.citationType).toBe('brand_mention');
    expect(citations[0]?.citedDomain).toBe('geopulse.ai');
  });

  it('maps configured brand aliases back to the measured domain', () => {
    const citations = parseBenchmarkCitations(
      'Geo Pulse helps teams measure AI visibility.',
      domain
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.citationType).toBe('brand_mention');
    expect(citations[0]?.citedDomain).toBe('geopulse.ai');
    expect(citations[0]?.metadata).toMatchObject({ alias: 'Geo Pulse' });
  });
});
