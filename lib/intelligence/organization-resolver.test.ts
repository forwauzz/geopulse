import { describe, expect, it } from 'vitest';
import {
  buildOrganizationEnrichmentPrompt,
  guardConfirmedOrganizationContext,
  parseOrganizationEnrichment,
  resolveExactDomain,
  serviceLabelsFromHtml,
  supportingPageUrls,
  type ExactDomainDocument,
  type ExactDomainResolution,
} from './organization-resolver';

const observedAt = '2026-08-02T05:00:00.000Z';

function document(overrides: Partial<ExactDomainDocument> = {}): ExactDomainDocument {
  return {
    requestedUrl: 'https://sanomed.ca/',
    finalUrl: 'https://sanomedsolutions.com/',
    redirectChain: ['https://sanomed.ca/', 'https://sanomedsolutions.com/'],
    approvedAliasHosts: ['sanomed.ca'],
    title: 'SanoMed Solutions | Private Medical Clinic',
    canonicalHref: 'https://sanomedsolutions.com/',
    jsonLdTypes: ['MedicalClinic'],
    jsonLdBlocks: [{
      '@type': 'MedicalClinic', name: 'SanoMed Solutions', additionalType: 'private medical clinic',
      serviceType: ['Preventive medicine', 'Travel medicine'],
      email: 'hello@sanomedsolutions.com', telephone: '+1-514-555-0100',
      address: { '@type': 'PostalAddress', addressLocality: 'Pointe-Claire', addressRegion: 'Quebec', addressCountry: 'Canada' },
      areaServed: ["Montreal's West Island", 'Greater Montreal'], inLanguage: ['English', 'French'],
    }],
    htmlLang: 'en-CA',
    hreflangEntries: [{ lang: 'fr-CA', href: 'https://sanomedsolutions.com/fr/' }],
    textSample: 'Private preventive medicine and travel clinic serving patients in Montreal.',
    observedAt,
    ...overrides,
  };
}

function resolved(overrides: Partial<ExactDomainDocument> = {}): ExactDomainResolution {
  const result = resolveExactDomain(document(overrides));
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('exact-domain organization resolution', () => {
  it('bounds supporting-page discovery to same-domain contact/about/services URLs', () => {
    const html = [
      '<a href="/services/travel-medicine/">Travel</a>',
      '<a href="/about-us/">About</a>',
      '<a href="/contact/">Contact</a>',
      '<a href="https://other.example.com/contact/">Lookalike contact</a>',
      '<a href="http://169.254.169.254/contact/">Metadata</a>',
    ].join('');
    expect(supportingPageUrls(html, 'https://clinic.example.com/')).toEqual([
      'https://clinic.example.com/contact/',
      'https://clinic.example.com/about-us/',
    ]);
    expect(serviceLabelsFromHtml(html, 'https://clinic.example.com/')).toEqual(['travel medicine']);
  });

  it('accepts a verified .ca redirect to the canonical .com and extracts bilingual Quebec context', () => {
    const result = resolved();
    expect(result).toMatchObject({
      status: 'proposed',
      identity: { requestedDomain: 'sanomed.ca', canonicalDomain: 'sanomedsolutions.com', approvedAliases: ['sanomed.ca'] },
      organization: { displayName: 'SanoMed Solutions', category: 'private medical clinic' },
      markets: [{ scope: 'regional', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Pointe-Claire' }],
    });
    expect(result.markets[0]?.languages).toEqual(['en-CA', 'fr-CA']);
    expect(result.organization).toMatchObject({ publicEmail: 'hello@sanomedsolutions.com', publicTelephone: '+1-514-555-0100' });
    expect(result.evidence.length).toBeGreaterThan(2);
    expect(result.evidence.every((item) => item.evidenceId && item.confidence > 0)).toBe(true);
  });

  it('fails closed on an unverified cross-domain redirect and unrelated canonical host', () => {
    const result = resolved({
      finalUrl: 'https://sanomed.co.uk/', redirectChain: ['https://sanomed.ca/', 'https://sanomed.co.uk/'],
      approvedAliasHosts: [], canonicalHref: 'https://sanomed.co.uk/',
    });
    expect(result.status).toBe('conflicted');
    expect(result.reasonCodes).toContain('redirect_unverified');
  });

  it('does not let an exact same-name US site override a confirmed Canadian identity', () => {
    const candidate = resolved({
      requestedUrl: 'https://same-name.example.us/', finalUrl: 'https://same-name.example.us/',
      redirectChain: ['https://same-name.example.us/'], approvedAliasHosts: [], canonicalHref: 'https://same-name.example.us/',
      jsonLdBlocks: [{
        '@type': 'MedicalClinic', name: 'SanoMed Solutions', additionalType: 'private medical clinic', serviceType: ['Preventive medicine'],
        address: { addressLocality: 'Buffalo', addressRegion: 'NY', addressCountry: 'US' }, inLanguage: ['en'],
      }],
    });
    const confirmed = {
      status: 'confirmed' as const,
      organization: {
        identityId: '10000000-0000-4000-8000-000000000001', displayName: 'SanoMed Solutions',
        canonicalDomain: 'sanomedsolutions.com', aliases: [{ host: 'sanomed.ca', relationship: 'redirect' as const, reviewState: 'verified' as const }],
        category: 'private medical clinic', services: ['Preventive medicine'],
      },
      market: {
        scope: 'local' as const, countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Pointe-Claire',
        serviceAreas: ["Montreal's West Island"], languages: ['en-CA'], timezone: 'America/Toronto', buyer: null,
        approvedCompetitorDomains: [],
      },
    };
    const guarded = guardConfirmedOrganizationContext(candidate, confirmed);
    expect(guarded.status).toBe('conflicted');
    expect(guarded.reasonCodes).toEqual(expect.arrayContaining(['canonical_domain_conflict', 'country_conflict', 'name_collision']));
    expect(confirmed.market.countryCode).toBe('CA');
  });

  it('routes a missing structured address to review instead of guessing a country', () => {
    const result = resolved({ jsonLdBlocks: [{ '@type': 'MedicalClinic', name: 'Clinic', inLanguage: ['en'] }] });
    expect(result.status).toBe('needs_review');
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['country_missing', 'location_missing', 'market_scope_missing']));
    expect(result.markets[0]?.countryCode).toBeNull();
  });

  it('creates separate markets for multiple locations', () => {
    const result = resolved({ jsonLdBlocks: [{
      '@type': 'MedicalClinic', name: 'Multi Clinic', serviceType: ['Primary care'], inLanguage: ['en'],
      address: [
        { addressLocality: 'Montreal', addressRegion: 'QC', addressCountry: 'CA' },
        { addressLocality: 'Toronto', addressRegion: 'ON', addressCountry: 'CA' },
      ],
    }] });
    expect(result.markets).toHaveLength(2);
    expect(result.markets.map((market) => market.subdivisionCode)).toEqual(['CA-QC', 'CA-ON']);
    expect(result.limitations).toContain('Multiple locations require separate confirmed Market Contexts before measurement.');
  });

  it.each([
    ['national', ['Canada'], 'CA'],
    ['global', ['Worldwide'], 'CA'],
    ['online', ['Online'], 'CA'],
  ] as const)('recognizes explicit %s scope without treating online availability as implicit', (scope, areaServed, country) => {
    const result = resolved({ jsonLdBlocks: [{
      '@type': 'Organization', name: 'Service Company', additionalType: 'software company', serviceType: ['Platform'],
      address: { addressLocality: 'Montreal', addressRegion: 'QC', addressCountry: country }, areaServed, inLanguage: ['en'],
    }] });
    expect(result.markets[0]?.scope).toBe(scope);
  });

  it('keeps distinct European languages and regional service areas', () => {
    const result = resolved({ jsonLdBlocks: [{
      '@type': 'Organization', name: 'EU Services', additionalType: 'consultancy', serviceType: ['Advisory'],
      address: { addressLocality: 'Paris', addressCountry: 'France' }, areaServed: ['Île-de-France'], inLanguage: ['fr', 'de'],
    }], htmlLang: 'fr-FR', hreflangEntries: [{ lang: 'de-DE', href: '/de/' }] });
    expect(result.markets[0]).toMatchObject({ scope: 'regional', countryCode: 'FR', languages: ['de-FR', 'fr-FR'] });
    expect(result.limitations).toContain('Language metadata used a different regional locale and was normalized to the detected market country for confirmation.');
  });
});

describe('post-enrichment validation', () => {
  it('embeds recoverable exact-site evidence in the enrichment request', () => {
    const exact = resolved();
    const prompt = buildOrganizationEnrichmentPrompt(exact);
    expect(prompt).toContain(exact.identity.canonicalDomain);
    expect(prompt).toContain(exact.evidence[0]!.evidenceId);
    expect(prompt).toContain('must never replace it silently');
  });

  it('accepts same-market, evidence-backed suggestions and rejects cross-country lookalikes', () => {
    const exact = resolved();
    const evidenceId = exact.evidence[0]!.evidenceId;
    const valid = JSON.stringify({
      context: {
        canonicalDomain: 'sanomedsolutions.com', displayName: 'SanoMed Solutions', category: 'private medical clinic',
        services: ['Preventive medicine'], buyer: 'Patients', countryCode: 'CA', evidenceIds: [evidenceId], confidence: 0.9,
      },
      competitors: [{ name: 'Montreal Clinic', url: 'https://montrealclinic.example.com/', countryCodes: ['CA'], evidenceIds: [evidenceId], confidence: 0.8, reason: 'Same market' }],
    });
    expect(parseOrganizationEnrichment(valid, exact)).toMatchObject({ status: 'accepted', reasonCodes: [] });

    const lookalike = valid.replace('sanomedsolutions.com', 'sanomed.co.uk').replace('"CA"', '"GB"');
    const rejected = parseOrganizationEnrichment(lookalike, exact);
    expect(rejected.status).toBe('needs_review');
    expect(rejected.reasonCodes).toEqual(expect.arrayContaining(['canonical_domain_conflict', 'country_conflict']));
  });

  it('rejects unsupported evidence and out-of-market local competitors', () => {
    const exact = resolved();
    const payload = JSON.stringify({
      context: {
        canonicalDomain: 'sanomedsolutions.com', displayName: 'SanoMed Solutions', category: 'private medical clinic',
        services: [], buyer: null, countryCode: 'CA', evidenceIds: ['invented'], confidence: 0.7,
      },
      competitors: [{ name: 'London Clinic', url: 'https://london-clinic.example.com/', countryCodes: ['GB'], evidenceIds: ['invented'], confidence: 0.7, reason: 'Search result' }],
    });
    const result = parseOrganizationEnrichment(payload, exact);
    expect(result.status).toBe('needs_review');
    expect(result.context).toBeNull();
    expect(result.competitors).toEqual([]);
    expect(result.reasonCodes).toContain('enrichment_evidence_missing');
  });

  it('rejects an evidence-backed competitor outside a local market', () => {
    const exact = resolved({ jsonLdBlocks: [{
      '@type': 'MedicalClinic', name: 'SanoMed Solutions', additionalType: 'private medical clinic', serviceType: ['Preventive medicine'],
      address: { addressLocality: 'Pointe-Claire', addressRegion: 'QC', addressCountry: 'CA' }, inLanguage: ['en'],
    }] });
    const evidenceId = exact.evidence[0]!.evidenceId;
    const payload = JSON.stringify({
      context: {
        canonicalDomain: 'sanomedsolutions.com', displayName: 'SanoMed Solutions', category: 'private medical clinic',
        services: [], buyer: null, countryCode: 'CA', evidenceIds: [evidenceId], confidence: 0.8,
      },
      competitors: [{ name: 'London Clinic', url: 'https://london-clinic.example.com/', countryCodes: ['GB'], evidenceIds: [evidenceId], confidence: 0.8, reason: 'Same service' }],
    });
    const result = parseOrganizationEnrichment(payload, exact);
    expect(result.reasonCodes).toContain('competitor_market_conflict');
    expect(result.competitors).toEqual([]);
  });
});
