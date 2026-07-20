import { describe, expect, it } from 'vitest';
import {
  GEO_PULSE_BRAND,
  contrastRatio,
  hexToRgb01,
  meetsAa,
  mutedInkOn,
  parseBrandConfig,
  pickInk,
} from './report-branding';

/**
 * The readability tests are the point of this file.
 *
 * White-label breaks in a specific, silent way: one customer picks a pale brand colour, fixed white
 * cover text drops below threshold, and only that customer's reports are unreadable. Deriving ink
 * from the background is what prevents it, so it gets pinned across the full brightness range.
 */

describe('colour parsing', () => {
  it('reads 6- and 3-digit hex, with or without the hash', () => {
    expect(hexToRgb01('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb01('ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb01('#fff')).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('rejects junk rather than rendering a wrong colour', () => {
    expect(hexToRgb01('not-a-colour')).toBeNull();
    expect(hexToRgb01('#12345')).toBeNull();
    expect(hexToRgb01('')).toBeNull();
  });
});

describe('ink is derived so the report stays readable for ANY brand colour', () => {
  const cases: Array<[string, string]> = [
    ['#000000', 'black'],
    ['#0B3D2E', 'dark green'],
    ['#575F73', 'our slate'],
    ['#FF5A5F', 'mid coral'],
    ['#FFD400', 'bright yellow'],
    ['#FFFFFF', 'white'],
    ['#F5F5F5', 'near-white'],
  ];

  it.each(cases)('%s (%s) gets ink that clears WCAG AA', (hex) => {
    const bg = hexToRgb01(hex)!;
    const ink = pickInk(bg);
    expect(meetsAa(ink, bg)).toBe(true);
  });

  it('flips to dark ink on light brands, and light ink on dark brands', () => {
    expect(pickInk(hexToRgb01('#FFD400')!)).toEqual({ r: 0.11, g: 0.12, b: 0.13 });
    expect(pickInk(hexToRgb01('#0B3D2E')!)).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('would have caught the pale-brand failure that fixed white ink causes', () => {
    const paleBrand = hexToRgb01('#F5F5F5')!;
    const white = { r: 1, g: 1, b: 1 };
    // The naive approach: always white text on the brand colour.
    expect(meetsAa(white, paleBrand)).toBe(false);
    // The derived one.
    expect(meetsAa(pickInk(paleBrand), paleBrand)).toBe(true);
  });
});

describe('contrast maths', () => {
  it('matches the WCAG reference extremes', () => {
    expect(contrastRatio({ r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 1);
    expect(contrastRatio({ r: 1, g: 1, b: 1 }, { r: 1, g: 1, b: 1 })).toBeCloseTo(1, 5);
  });
});

describe('brand config from workspace metadata', () => {
  it('falls back to GEO-Pulse when there is no brand set', () => {
    expect(parseBrandConfig(null)).toEqual(GEO_PULSE_BRAND);
    expect(parseBrandConfig({})).toEqual(GEO_PULSE_BRAND);
    expect(parseBrandConfig({ brand: 'nonsense' })).toEqual(GEO_PULSE_BRAND);
  });

  it('applies a customer brand and derives its ink', () => {
    const brand = parseBrandConfig({
      brand: { companyName: 'Acme MSP', primary: '#0B3D2E', logoKey: 'brands/acme.png' },
    });
    expect(brand.companyName).toBe('Acme MSP');
    expect(brand.logo).toEqual({ key: 'brands/acme.png', mime: 'image/png' });
    expect(meetsAa(brand.onPrimary, brand.primary)).toBe(true);
  });

  it('keeps rendering when the colour is malformed', () => {
    const brand = parseBrandConfig({ brand: { companyName: 'Acme', primary: 'octarine' } });
    expect(brand.primary).toEqual(GEO_PULSE_BRAND.primary);
    expect(brand.companyName).toBe('Acme');
  });

  it('drops a logo pdf-lib cannot embed instead of failing the render', () => {
    expect(parseBrandConfig({ brand: { logoKey: 'brands/acme.svg' } }).logo).toBeNull();
    expect(parseBrandConfig({ brand: { logoKey: 'brands/acme', logoMime: 'image/webp' } }).logo).toBeNull();
  });

  it('infers the mime from the extension when it is absent', () => {
    expect(parseBrandConfig({ brand: { logoKey: 'a/b.JPG' } }).logo?.mime).toBe('image/jpeg');
  });

  it('keeps our mark unless explicitly removed, since that is a paid capability', () => {
    expect(parseBrandConfig({ brand: { companyName: 'Acme' } }).showPoweredBy).toBe(true);
    expect(parseBrandConfig({ brand: { showPoweredBy: 'no' } }).showPoweredBy).toBe(true);
    expect(parseBrandConfig({ brand: { showPoweredBy: false } }).showPoweredBy).toBe(false);
  });

  it('caps customer-supplied strings that land in a generated PDF', () => {
    const brand = parseBrandConfig({ brand: { companyName: 'x'.repeat(500) } });
    expect(brand.companyName.length).toBe(80);
  });
});

describe('secondary ink stays legible on every brand', () => {
  const brands = ['#000000', '#0B3D2E', '#575F73', '#FF5A5F', '#FFD400', '#FFFFFF', '#F5F5F5'];

  it.each(brands)('%s muted ink still clears AA', (hex) => {
    const bg = hexToRgb01(hex)!;
    expect(meetsAa(mutedInkOn(bg), bg)).toBe(true);
  });

  it('softens where it safely can, and gives up softness rather than legibility', () => {
    const dark = hexToRgb01('#0B3D2E')!;
    // Plenty of headroom on a dark brand: the muted tone differs from full-strength ink.
    expect(mutedInkOn(dark)).not.toEqual(pickInk(dark));

    // The cover's old fixed grey against a pale brand — unreadable.
    const pale = hexToRgb01('#F5F5F5')!;
    expect(meetsAa({ r: 0.85, g: 0.87, b: 0.9 }, pale)).toBe(false);
    // The derived one holds.
    expect(meetsAa(mutedInkOn(pale), pale)).toBe(true);
  });
});
