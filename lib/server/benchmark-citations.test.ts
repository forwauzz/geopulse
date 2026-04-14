import { describe, expect, it } from 'vitest';
import {
  assessCitationClaimEvidenceMatch,
  matchCitationToGroundingEvidence,
  parseBenchmarkCitations,
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
