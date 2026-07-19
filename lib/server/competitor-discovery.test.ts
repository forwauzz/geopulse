import { describe, expect, it } from 'vitest';
import {
  detectBusinessProfile,
  detectBusinessTypeFromText,
  extractSchemaAddress,
  labelFromSchemaTypes,
  mockCompetitors,
  parseDiscoveryResponse,
  resolveDiscoveryMode,
  buildDiscoveryPrompt,
} from './competitor-discovery';

describe('labelFromSchemaTypes', () => {
  it('maps a strong LocalBusiness subtype to a readable industry', () => {
    expect(labelFromSchemaTypes(['WebPage', 'Dentist'])).toBe('dental practice');
    expect(labelFromSchemaTypes(['LegalService'])).toBe('law firm');
  });

  it('prefers a specific subtype over the generic LocalBusiness label', () => {
    expect(labelFromSchemaTypes(['LocalBusiness', 'Restaurant'])).toBe('restaurant');
  });

  it('falls back to the generic label only when nothing else matches', () => {
    expect(labelFromSchemaTypes(['LocalBusiness'])).toBe('local business');
    expect(labelFromSchemaTypes(['WebSite', 'Article'])).toBeNull();
  });
});

describe('detectBusinessTypeFromText', () => {
  it('scores industry keywords and returns the best match', () => {
    expect(detectBusinessTypeFromText('We are a managed IT support and cybersecurity MSP')).toBe('IT services');
    expect(detectBusinessTypeFromText('Trusted personal injury attorney and law firm')).toBe('law firm');
  });

  it('returns null when no industry keyword is present', () => {
    expect(detectBusinessTypeFromText('lorem ipsum dolor sit amet')).toBeNull();
  });
});

describe('extractSchemaAddress', () => {
  it('pulls locality and region from JSON-LD PostalAddress', () => {
    const html = `<script type="application/ld+json">{"@type":"Dentist","address":{"@type":"PostalAddress","addressLocality":"Austin","addressRegion":"TX"}}</script>`;
    expect(extractSchemaAddress(html)).toEqual({ city: 'Austin', region: 'TX' });
  });

  it('returns nulls when no address is present', () => {
    expect(extractSchemaAddress('<html><body>no address</body></html>')).toEqual({ city: null, region: null });
  });
});

describe('detectBusinessProfile', () => {
  it('produces high confidence from a schema type + city', () => {
    const html = `<script type="application/ld+json">{"@type":"Dentist","address":{"addressLocality":"Austin","addressRegion":"TX"}}</script>`;
    const p = detectBusinessProfile({
      title: 'Bright Smiles Dental',
      metaDescription: 'Family dentistry',
      textSample: 'dental implants and teeth whitening',
      jsonLdTypes: ['Dentist'],
      html,
    });
    expect(p.businessType).toBe('dental practice');
    expect(p.city).toBe('Austin');
    expect(p.confidence).toBe('high');
    expect(p.source).toBe('schema_org');
  });

  it('falls back to keyword heuristics with medium/low confidence', () => {
    const p = detectBusinessProfile({
      title: 'Acme Managed IT',
      metaDescription: 'IT support for small business',
      textSample: 'managed it support helpdesk cybersecurity',
      jsonLdTypes: [],
      html: '<html></html>',
    });
    expect(p.businessType).toBe('IT services');
    expect(p.city).toBeNull();
    expect(p.confidence).toBe('medium'); // strong type but no city
    expect(p.source).toBe('heuristic');
  });

  it('returns low confidence and empty type when nothing is detectable', () => {
    const p = detectBusinessProfile({
      title: 'Home', metaDescription: null, textSample: 'welcome', jsonLdTypes: [], html: '<html></html>',
    });
    expect(p.businessType).toBe('');
    expect(p.confidence).toBe('low');
    expect(p.source).toBe('unknown');
  });
});

describe('resolveDiscoveryMode', () => {
  it('defaults to mock', () => {
    expect(resolveDiscoveryMode(undefined)).toBe('mock');
    expect(resolveDiscoveryMode({})).toBe('mock');
    expect(resolveDiscoveryMode({ COMPETITOR_DISCOVERY_MODE: '' })).toBe('mock');
  });

  it('is gemini only when explicitly live AND a key is present', () => {
    expect(resolveDiscoveryMode({ COMPETITOR_DISCOVERY_MODE: 'live' })).toBe('mock'); // no key
    expect(resolveDiscoveryMode({ COMPETITOR_DISCOVERY_MODE: 'live', GEMINI_API_KEY: 'k' })).toBe('gemini');
    expect(resolveDiscoveryMode({ COMPETITOR_DISCOVERY_MODE: 'gemini', GEMINI_API_KEY: 'k' })).toBe('gemini');
  });
});

describe('mockCompetitors', () => {
  const profile = { businessType: 'dental practice', city: 'Austin', region: 'TX', confidence: 'high' as const, source: 'schema_org' as const };

  it('is deterministic and returns labelled, non-resolving sample candidates', () => {
    const a = mockCompetitors(profile, 'brightsmiles.com');
    const b = mockCompetitors(profile, 'brightsmiles.com');
    expect(a).toEqual(b); // deterministic
    expect(a).toHaveLength(3);
    for (const c of a) {
      expect(c.domain.endsWith('.example')).toBe(true); // never a real business
      expect(c.sample).toBeTruthy();
      expect(c.sample!.score).toBeGreaterThanOrEqual(0);
      expect(c.sample!.score).toBeLessThanOrEqual(100);
      expect(c.sample!.categoryScores).toHaveLength(3);
      for (const cs of c.sample!.categoryScores) {
        expect(cs.score).toBeGreaterThanOrEqual(0); // never negative (would read as "not measured")
        expect(cs.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('buildDiscoveryPrompt', () => {
  it('mentions Google Search, the industry, the city, and excludes self', () => {
    const prompt = buildDiscoveryPrompt(
      { businessType: 'law firm', city: 'Denver', region: 'CO', confidence: 'high', source: 'schema_org' },
      'example-law.com'
    );
    expect(prompt).toContain('Google Search');
    expect(prompt).toContain('law firm');
    expect(prompt).toContain('Denver');
    expect(prompt).toContain('example-law.com');
  });
});

describe('parseDiscoveryResponse', () => {
  it('parses a JSON object, drops self and dedupes by host', () => {
    const raw = '```json\n{"competitors":[{"name":"A","url":"https://a-firm.com/"},{"name":"Self","url":"https://www.example-law.com/"},{"name":"A2","url":"https://a-firm.com/x"}]}\n```';
    const out = parseDiscoveryResponse(raw, 'example-law.com');
    expect(out).toHaveLength(1);
    expect(out[0]!.domain).toBe('a-firm.com');
  });

  it('returns [] on malformed input', () => {
    expect(parseDiscoveryResponse('not json', 'x.com')).toEqual([]);
    expect(parseDiscoveryResponse('{"competitors":[]}', 'x.com')).toEqual([]);
  });
});
