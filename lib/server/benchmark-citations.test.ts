import { describe, expect, it } from 'vitest';
import {
  assessCitationClaimEvidenceMatch,
  matchCitationToGroundingEvidence,
  parseBenchmarkCitations,
  parseCompetitorCitations,
} from './benchmark-citations';
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

  it('matches explicit citation URLs back to grounded evidence pages', () => {
    const citation = parseBenchmarkCitations(
      'Sources: https://www.geopulse.ai/pricing and https://docs.example.com/setup.',
      domain
    )[0];

    expect(
      matchCitationToGroundingEvidence(citation!, {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-pricing',
            sourceLabel: 'Pricing',
            excerpt: 'GeoPulse pricing details.',
            pageUrl: 'https://www.geopulse.ai/pricing',
            pageType: 'services',
            evidenceLabel: 'Pricing',
            pageTitle: 'Pricing',
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      })
    ).toEqual({
      groundingEvidenceId: 'ge-pricing',
      groundingPageUrl: 'https://www.geopulse.ai/pricing',
      groundingPageType: 'services',
      provenanceMatchMethod: 'exact_url',
      provenanceConfidence: 1,
    });
  });

  it('matches normalized page-equivalent urls back to grounded evidence pages', () => {
    const citation = parseBenchmarkCitations(
      'Source: https://geopulse.ai/pricing/?utm_source=newsletter#plans',
      domain
    )[0];

    expect(
      matchCitationToGroundingEvidence(citation!, {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-pricing',
            sourceLabel: 'Pricing',
            excerpt: 'GeoPulse pricing details.',
            pageUrl: 'https://www.geopulse.ai/pricing',
            pageType: 'services',
            evidenceLabel: 'Pricing',
            pageTitle: 'Pricing',
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      })
    ).toEqual({
      groundingEvidenceId: 'ge-pricing',
      groundingPageUrl: 'https://www.geopulse.ai/pricing',
      groundingPageType: 'services',
      provenanceMatchMethod: 'normalized_page',
      provenanceConfidence: 0.9,
    });
  });

  it('does not match different pages on the same domain', () => {
    const citation = parseBenchmarkCitations('Source: https://geopulse.ai/about', domain)[0];

    expect(
      matchCitationToGroundingEvidence(citation!, {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-pricing',
            sourceLabel: 'Pricing',
            excerpt: 'GeoPulse pricing details.',
            pageUrl: 'https://www.geopulse.ai/pricing',
            pageType: 'services',
            evidenceLabel: 'Pricing',
            pageTitle: 'Pricing',
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      })
    ).toBeNull();
  });

  it('leaves domain-only mentions unresolved for grounded provenance', () => {
    const citation = parseBenchmarkCitations('GeoPulse is often mentioned in AI visibility.', domain)[0];

    expect(
      matchCitationToGroundingEvidence(citation!, {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-home',
            sourceLabel: 'homepage',
            excerpt: 'GeoPulse measures AI visibility.',
            pageUrl: 'https://www.geopulse.ai/',
            pageType: 'homepage',
            evidenceLabel: 'Homepage',
            pageTitle: 'Homepage',
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      })
    ).toBeNull();
  });

  it('records supported overlap when the selected claim sentence matches evidence wording', () => {
    const citation = parseBenchmarkCitations(
      'GeoPulse pricing explains AI visibility measurement for enterprise teams. Source: https://www.geopulse.ai/pricing',
      domain
    )[0];
    const groundingContext = {
      mode: 'grounded_site' as const,
      evidence: [
        {
          evidenceId: 'ge-pricing',
          sourceLabel: 'Pricing',
          excerpt: 'GeoPulse pricing covers AI visibility measurement for enterprise teams.',
          pageUrl: 'https://www.geopulse.ai/pricing',
          pageType: 'services',
          evidenceLabel: 'Pricing',
          pageTitle: 'Pricing',
          fetchStatus: null,
          fetchOrder: null,
          selectionReason: null,
        },
      ],
    };
    const groundingMatch = matchCitationToGroundingEvidence(citation!, groundingContext);

    expect(
      assessCitationClaimEvidenceMatch({
        citation: citation!,
        responseText:
          'GeoPulse pricing explains AI visibility measurement for enterprise teams. Source: https://www.geopulse.ai/pricing',
        groundingContext,
        groundingMatch,
      })
    ).toMatchObject({
      status: 'supported_overlap',
      overlapTokenCount: 6,
      claimText: 'GeoPulse pricing explains AI visibility measurement for enterprise teams.',
    });
  });

  it('returns unavailable when no grounded provenance match exists', () => {
    const citation = parseBenchmarkCitations('GeoPulse is often mentioned in AI visibility.', domain)[0];

    expect(
      assessCitationClaimEvidenceMatch({
        citation: citation!,
        responseText: 'GeoPulse is often mentioned in AI visibility.',
        groundingContext: null,
        groundingMatch: null,
      })
    ).toEqual({
      status: 'unavailable',
      claimText: null,
      overlapTokenCount: 0,
      claimTokenCount: 0,
      evidenceTokenCount: 0,
      overlapRatio: 0,
    });
  });
});

describe('parseBenchmarkCitations — rankPosition extraction (GPM-004)', () => {
  it('assigns rank from numbered list position for url citations', () => {
    const response = [
      '1. https://acupuncture.com is the best option.',
      '2. https://physio.ca is also recommended.',
      '3. https://www.geopulse.ai ranks third.',
    ].join('\n');
    const citations = parseBenchmarkCitations(response, domain);

    const geopulse = citations.find((c) => c.citedDomain === 'geopulse.ai');
    expect(geopulse?.rankPosition).toBe(3);
    const acupuncture = citations.find((c) => c.citedDomain === 'acupuncture.com');
    expect(acupuncture?.rankPosition).toBe(1);
  });

  it('assigns sequential rank for bullet list citations', () => {
    const response = [
      '- https://acupuncture.com',
      '- https://physio.ca',
      '- GeoPulse is third.',
    ].join('\n');
    const citations = parseBenchmarkCitations(response, domain);

    const geopulse = citations.find((c) => c.citedDomain === 'geopulse.ai');
    expect(geopulse?.rankPosition).toBe(3);
    const physio = citations.find((c) => c.citedDomain === 'physio.ca');
    expect(physio?.rankPosition).toBe(2);
  });

  it('assigns null rank for plain prose responses', () => {
    const response =
      'GeoPulse is one of many platforms that helps measure AI visibility alongside example.com.';
    const citations = parseBenchmarkCitations(response, domain);

    expect(citations.length).toBeGreaterThan(0);
    expect(citations.every((c) => c.rankPosition === null)).toBe(true);
  });

  it('assigns rank from ordinal word in prose', () => {
    const response =
      'First, consider acupuncture.com for vestibular care. Second, physio.ca offers great services. Third, GeoPulse tracks AI visibility.';
    const citations = parseBenchmarkCitations(response, domain);

    const geopulse = citations.find((c) => c.citedDomain === 'geopulse.ai');
    expect(geopulse?.rankPosition).toBe(3);
    const acupuncture = citations.find((c) => c.citedDomain === 'acupuncture.com');
    expect(acupuncture?.rankPosition).toBe(1);
  });

  it('stores response_structure in citation metadata', () => {
    const numberedResponse = '1. https://www.geopulse.ai\n2. https://example.com';
    const [first] = parseBenchmarkCitations(numberedResponse, domain);
    expect(first?.metadata?.['response_structure']).toBe('numbered_list');

    const proseResponse = 'GeoPulse is a well-known platform.';
    const [proseFirst] = parseBenchmarkCitations(proseResponse, domain);
    expect(proseFirst?.metadata?.['response_structure']).toBe('prose');
  });

  it('assigns null rank when citation appears between numbered list items', () => {
    const response = [
      'Here are some options:',
      '1. https://acupuncture.com',
      '2. https://physio.ca',
      'Note: GeoPulse is not a clinic.',
    ].join('\n');
    const citations = parseBenchmarkCitations(response, domain);

    // GeoPulse is on a line NOT matching the numbered list pattern
    const geopulse = citations.find((c) => c.citedDomain === 'geopulse.ai');
    expect(geopulse?.rankPosition).toBeNull();
  });
});

describe('parseCompetitorCitations (GPM-006)', () => {
  it('returns empty array when competitor list is empty', () => {
    const citations = parseCompetitorCitations(
      'GeoPulse is great alongside physio.ca.',
      [],
      'geopulse.ai'
    );
    expect(citations).toHaveLength(0);
  });

  it('matches a domain-like competitor via explicit URL citation', () => {
    const response = '1. https://physio.ca/services is recommended.\n2. https://www.geopulse.ai is second.';
    const citations = parseCompetitorCitations(response, ['physio.ca'], 'geopulse.ai');

    expect(citations).toHaveLength(1);
    expect(citations[0]?.citedDomain).toBe('physio.ca');
    expect(citations[0]?.citationType).toBe('explicit_url');
    expect(citations[0]?.rankPosition).toBe(1);
    expect(citations[0]?.metadata?.['is_competitor']).toBe(true);
    expect(citations[0]?.metadata?.['competitor_name']).toBe('physio.ca');
  });

  it('matches a domain-like competitor via domain mention when no URL present', () => {
    const response = '1. physio.ca\n2. geopulse.ai';
    const citations = parseCompetitorCitations(response, ['physio.ca'], 'geopulse.ai');

    expect(citations).toHaveLength(1);
    expect(citations[0]?.citationType).toBe('explicit_domain');
    expect(citations[0]?.rankPosition).toBe(1);
  });

  it('matches a brand-name competitor via brand mention', () => {
    const response = 'First, Vestibular Rehab Center is the top choice. Second, GeoPulse tracks visibility.';
    const citations = parseCompetitorCitations(
      response,
      ['Vestibular Rehab Center'],
      'geopulse.ai'
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.citationType).toBe('brand_mention');
    expect(citations[0]?.citedDomain).toBeNull();
    expect(citations[0]?.rankPosition).toBe(1);
    expect(citations[0]?.metadata?.['competitor_name']).toBe('Vestibular Rehab Center');
  });

  it('excludes the measured domain even if listed as a competitor', () => {
    const citations = parseCompetitorCitations(
      'Visit geopulse.ai for visibility data.',
      ['geopulse.ai'],
      'geopulse.ai'
    );
    expect(citations).toHaveLength(0);
  });

  it('returns nothing for a competitor not mentioned in the response', () => {
    const citations = parseCompetitorCitations(
      'GeoPulse measures AI visibility.',
      ['notmentioned.com', 'UnknownBrand'],
      'geopulse.ai'
    );
    expect(citations).toHaveLength(0);
  });

  it('extracts multiple competitors from a numbered list with correct ranks', () => {
    const response = [
      '1. https://physio.ca — top pick',
      '2. Vestibular Rehab Center is second',
      '3. acupuncture.com also recommended',
    ].join('\n');
    const citations = parseCompetitorCitations(
      response,
      ['physio.ca', 'Vestibular Rehab Center', 'acupuncture.com'],
      'geopulse.ai'
    );

    expect(citations).toHaveLength(3);
    const physio = citations.find((c) => c.citedDomain === 'physio.ca');
    const vrc = citations.find((c) => c.metadata?.['competitor_name'] === 'Vestibular Rehab Center');
    const acupuncture = citations.find((c) => c.citedDomain === 'acupuncture.com');
    expect(physio?.rankPosition).toBe(1);
    expect(vrc?.rankPosition).toBe(2);
    expect(acupuncture?.rankPosition).toBe(3);
  });

  it('deduplicates the same competitor domain across multiple entries', () => {
    const citations = parseCompetitorCitations(
      'physio.ca is great.',
      ['physio.ca', 'www.physio.ca'],
      'geopulse.ai'
    );
    expect(citations).toHaveLength(1);
  });
});
