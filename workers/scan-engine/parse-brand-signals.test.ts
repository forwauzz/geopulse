import { describe, expect, it } from 'vitest';
import {
  bestLogoToApply,
  detectImageType,
  extractBrandSignals,
} from './parse-brand-signals';

const BASE = 'https://example.com/';

const page = (head: string) => `<html><head>${head}</head><body></body></html>`;

describe('brand signals from the audited page', () => {
  it('prefers Organization JSON-LD for name and logo', () => {
    const s = extractBrandSignals(
      page(`<script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Organization","name":"Acme MSP","logo":"/img/logo.png"}
      </script><meta property="og:site_name" content="Acme Website">`),
      BASE
    );

    expect(s.companyName).toBe('Acme MSP');
    expect(s.logoCandidates[0]).toEqual({
      url: 'https://example.com/img/logo.png',
      source: 'jsonld_organization',
      confidence: 'high',
    });
  });

  it('reads the ImageObject form of logo', () => {
    const s = extractBrandSignals(
      page(`<script type="application/ld+json">
        {"@type":"Organization","name":"Acme","logo":{"@type":"ImageObject","url":"https://cdn.example.com/l.png"}}
      </script>`),
      BASE
    );
    expect(s.logoCandidates[0]?.url).toBe('https://cdn.example.com/l.png');
  });

  it('finds an Organization nested in an @graph', () => {
    const s = extractBrandSignals(
      page(`<script type="application/ld+json">
        {"@graph":[{"@type":"WebSite"},{"@type":"Organization","name":"Nested Co","logo":"/n.png"}]}
      </script>`),
      BASE
    );
    expect(s.companyName).toBe('Nested Co');
  });

  it('treats LocalBusiness as an organization, since that is most local service sites', () => {
    const s = extractBrandSignals(
      page(`<script type="application/ld+json">{"@type":"LocalBusiness","name":"Corner Clinic"}</script>`),
      BASE
    );
    expect(s.companyName).toBe('Corner Clinic');
  });

  it('falls back to og:site_name when there is no Organization', () => {
    const s = extractBrandSignals(page(`<meta property="og:site_name" content="Fallback Co">`), BASE);
    expect(s.companyName).toBe('Fallback Co');
  });

  it('reads theme-color, and ignores colours it cannot parse exactly', () => {
    expect(extractBrandSignals(page(`<meta name="theme-color" content="#0B3D2E">`), BASE).themeColor).toBe('#0b3d2e');
    expect(extractBrandSignals(page(`<meta name="theme-color" content="rebeccapurple">`), BASE).themeColor).toBeNull();
    expect(extractBrandSignals(page(`<meta name="theme-color" content="rgb(1,2,3)">`), BASE).themeColor).toBeNull();
  });

  it('resolves relative logo URLs against the page', () => {
    const s = extractBrandSignals(page(`<link rel="apple-touch-icon" href="../icons/touch.png">`), 'https://example.com/a/b/');
    expect(s.logoCandidates[0]?.url).toBe('https://example.com/a/icons/touch.png');
  });

  it('refuses non-http logo references', () => {
    const s = extractBrandSignals(
      page(`<link rel="icon" href="data:image/png;base64,AAAA"><link rel="apple-touch-icon" href="javascript:alert(1)">`),
      BASE
    );
    expect(s.logoCandidates).toEqual([]);
  });

  it('survives malformed JSON-LD instead of throwing', () => {
    const s = extractBrandSignals(page(`<script type="application/ld+json">{ not json </script>`), BASE);
    expect(s.companyName).toBeNull();
  });

  it('returns nothing for a page with no branding at all', () => {
    const s = extractBrandSignals(page(''), BASE);
    expect(s).toEqual({ companyName: null, themeColor: null, logoCandidates: [] });
  });
});

describe('what we will actually apply without asking', () => {
  it('applies an Organization logo', () => {
    const s = extractBrandSignals(
      page(`<script type="application/ld+json">{"@type":"Organization","logo":"/l.png"}</script>`),
      BASE
    );
    expect(bestLogoToApply(s)?.source).toBe('jsonld_organization');
  });

  it('REFUSES to apply a favicon — it is worse than the wordmark at masthead size', () => {
    const s = extractBrandSignals(page(`<link rel="icon" href="/favicon.ico">`), BASE);
    expect(s.logoCandidates[0]?.confidence).toBe('low');
    expect(bestLogoToApply(s)).toBeNull();
  });

  it('REFUSES to apply og:image — it is a 1200x630 banner, not a logo', () => {
    const s = extractBrandSignals(page(`<meta property="og:image" content="/social.png">`), BASE);
    expect(bestLogoToApply(s)).toBeNull();
  });

  it('still offers weak candidates so the UI can show them as options', () => {
    const s = extractBrandSignals(page(`<link rel="icon" href="/favicon.png">`), BASE);
    expect(s.logoCandidates).toHaveLength(1);
  });
});

describe('image validation trusts bytes, not headers', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

  it('identifies real PNG and JPEG', () => {
    expect(detectImageType(png)).toBe('image/png');
    expect(detectImageType(jpeg)).toBe('image/jpeg');
  });

  it('rejects a file merely CLAIMING to be an image', () => {
    // The logo URL comes out of customer HTML, so Content-Type is attacker-controlled.
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectImageType(new Uint8Array([1, 2]))).toBeNull();
  });
});
