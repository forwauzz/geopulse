/**
 * Per-customer branding for generated reports.
 *
 * A report carrying the customer's own logo and colour is the artifact an agency or MSP can put in
 * front of their client and bill for — the same engine, their masthead. Stored in the workspace or
 * agency `metadata` jsonb, so this needs no schema change.
 *
 * The hard requirement here is READABILITY, not fidelity. The moment a customer picks a pale brand
 * colour, fixed white cover text becomes unreadable — so ink is DERIVED from the background rather
 * than assumed. A white-label feature that renders an illegible report for some brands is worse
 * than not shipping one, because it fails silently and only for those customers.
 *
 * Markdown output is deliberately untouched: it stays plain so agents can consume it.
 */

export type Rgb01 = { readonly r: number; readonly g: number; readonly b: number };

export type BrandLogo = {
  /** R2 object key. PNG/JPEG only — pdf-lib cannot embed SVG and a Worker cannot cheaply raster it. */
  readonly key: string;
  readonly mime: 'image/png' | 'image/jpeg';
};

export type BrandConfig = {
  readonly companyName: string;
  readonly logo: BrandLogo | null;
  /** Cover and accent colour. */
  readonly primary: Rgb01;
  /** Readable ink for text placed ON `primary`. Derived, never supplied. */
  readonly onPrimary: Rgb01;
  readonly footerNote: string | null;
  /** False only for partner tiers that have paid to remove our mark. */
  readonly showPoweredBy: boolean;
};

const NEAR_BLACK: Rgb01 = { r: 0.11, g: 0.12, b: 0.13 };
const WHITE: Rgb01 = { r: 1, g: 1, b: 1 };

/** The default masthead when a customer has not set one. */
export const GEO_PULSE_BRAND: BrandConfig = {
  companyName: 'GEO-Pulse',
  logo: null,
  primary: { r: 0.34, g: 0.37, b: 0.45 },
  onPrimary: WHITE,
  footerNote: null,
  showPoweredBy: true,
};

export function hexToRgb01(hex: string): Rgb01 | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = Number.parseInt(h, 16);
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255 };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb01): number {
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: Rgb01, b: Rgb01): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for text on `background`: whichever of white or near-black reads better.
 *
 * Deliberately a choice between two known-good values rather than a tint of the brand colour —
 * a tinted ink can land just under the threshold and nobody notices until a customer complains
 * their report is unreadable.
 */
export function pickInk(background: Rgb01): Rgb01 {
  return contrastRatio(WHITE, background) >= contrastRatio(NEAR_BLACK, background) ? WHITE : NEAR_BLACK;
}

/** True when this pairing clears WCAG AA for body text. */
export function meetsAa(foreground: Rgb01, background: Rgb01, largeText = false): boolean {
  return contrastRatio(foreground, background) >= (largeText ? 3 : 4.5);
}

function mix(a: Rgb01, b: Rgb01, amount: number): Rgb01 {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

/**
 * Secondary ink — the softer tone for subtitles and captions.
 *
 * Blends the derived ink toward the background for hierarchy, then checks the result and falls
 * back to full-strength ink if the blend drops below AA. The cover's fixed light greys
 * (rgb(0.85,0.87,0.9)) worked only because the background happened to be dark; on a pale brand
 * they would disappear entirely. Softness is a nice-to-have, legibility is not.
 */
export function mutedInkOn(background: Rgb01, amount = 0.28): Rgb01 {
  const ink = pickInk(background);
  const blended = mix(ink, background, amount);
  return meetsAa(blended, background) ? blended : ink;
}

function readString(source: Record<string, unknown>, key: string, max: number): string | null {
  const raw = source[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Read a brand from workspace/agency `metadata`, falling back to ours on anything unusable.
 *
 * Fail-soft on purpose: a malformed colour or a half-written config should render a GEO-Pulse
 * report, never a broken one. Customer-supplied strings are length-capped because they land in a
 * PDF we generate on their behalf.
 */
export function parseBrandConfig(metadata: unknown): BrandConfig {
  if (!metadata || typeof metadata !== 'object') return GEO_PULSE_BRAND;
  const brand = (metadata as Record<string, unknown>)['brand'];
  if (!brand || typeof brand !== 'object') return GEO_PULSE_BRAND;
  const source = brand as Record<string, unknown>;

  const primary = (() => {
    const raw = source['primary'];
    return typeof raw === 'string' ? hexToRgb01(raw) ?? GEO_PULSE_BRAND.primary : GEO_PULSE_BRAND.primary;
  })();

  const logo = (() => {
    const key = readString(source, 'logoKey', 512);
    if (!key) return null;
    const mime = source['logoMime'];
    // Only formats pdf-lib can embed. An unsupported type is dropped rather than failing the render.
    if (mime === 'image/png') return { key, mime: 'image/png' as const };
    if (mime === 'image/jpeg') return { key, mime: 'image/jpeg' as const };
    if (/\.png$/i.test(key)) return { key, mime: 'image/png' as const };
    if (/\.jpe?g$/i.test(key)) return { key, mime: 'image/jpeg' as const };
    return null;
  })();

  return {
    companyName: readString(source, 'companyName', 80) ?? GEO_PULSE_BRAND.companyName,
    logo,
    primary,
    onPrimary: pickInk(primary),
    footerNote: readString(source, 'footerNote', 160),
    // Removing our mark is a paid capability, so it is opt-IN and defaults to showing.
    showPoweredBy: source['showPoweredBy'] === false ? false : true,
  };
}
