/**
 * Branding signals lifted from the page we already fetched during the audit.
 *
 * The point is to pre-fill report branding rather than hand someone an empty form: "we found this
 * on your site — use it?". No extra crawl, this reads HTML the scan already has.
 *
 * The design constraint is that these signals PROPOSE, never decide. A 16px favicon stretched
 * across a masthead looks worse than a plain wordmark, so a weak candidate must be reported as
 * weak and left unapplied rather than quietly used.
 *
 * Worth knowing when reading this: `Organization.logo` is the best source AND is exactly what our
 * audit flags as missing. Sites that have it are already doing well, so the upload path is the
 * common case, not the fallback.
 */

export type LogoSource = 'jsonld_organization' | 'apple_touch_icon' | 'icon' | 'og_image';

/** How much we trust a candidate enough to apply it without asking. */
export type BrandConfidence = 'high' | 'low';

export type LogoCandidate = {
  readonly url: string;
  readonly source: LogoSource;
  readonly confidence: BrandConfidence;
};

export type BrandSignals = {
  readonly companyName: string | null;
  /** Hex, only when the site states one. We do not infer colour from pixels. */
  readonly themeColor: string | null;
  /** Best first. */
  readonly logoCandidates: readonly LogoCandidate[];
};

/**
 * Only sources that are actually a logo get 'high'.
 *
 * `og:image` is a 1200x630 social banner and an icon is 16-48px: both are the wrong artwork for a
 * masthead, so they are offered but never auto-applied.
 */
const SOURCE_CONFIDENCE: Record<LogoSource, BrandConfidence> = {
  jsonld_organization: 'high',
  apple_touch_icon: 'high',
  icon: 'low',
  og_image: 'low',
};

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1]?.trim() ?? null;
}

function absolute(url: string, base: string): string | null {
  try {
    const resolved = new URL(url, base);
    // Only http(s) — a data: or javascript: URL here is never a legitimate logo reference.
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/** #rgb / #rrggbb only. Named and functional colours are ignored rather than half-parsed. */
function normalizeHex(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  return m ? `#${(m[1] as string).toLowerCase()}` : null;
}

function collectJsonLdOrganization(html: string): { name: string | null; logo: string | null } {
  let name: string | null = null;
  let logo: string | null = null;

  const blockRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1] ?? '');
      const visit = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        const obj = node as Record<string, unknown>;
        const type = obj['@type'];
        const types = Array.isArray(type) ? type : [type];
        const isOrg = types.some(
          (t) => typeof t === 'string' && (t === 'Organization' || t === 'LocalBusiness' || t.endsWith('Business'))
        );
        if (isOrg) {
          if (!name && typeof obj['name'] === 'string') name = obj['name'].trim() || null;
          if (!logo) {
            const rawLogo = obj['logo'];
            if (typeof rawLogo === 'string') logo = rawLogo;
            // ImageObject form: { "@type": "ImageObject", "url": "..." }
            else if (rawLogo && typeof rawLogo === 'object') {
              const u = (rawLogo as Record<string, unknown>)['url'];
              if (typeof u === 'string') logo = u;
            }
          }
        }
        // Nested graphs (@graph) and sub-objects.
        Object.values(obj).forEach(visit);
      };
      visit(parsed);
    } catch {
      /* malformed JSON-LD — skip, same as the rest of the parser */
    }
  }
  return { name, logo };
}

export function extractBrandSignals(html: string, baseUrl: string): BrandSignals {
  const h = html.slice(0, 200_000);
  const org = collectJsonLdOrganization(h);

  const companyName =
    org.name ??
    firstMatch(h, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);

  const themeColor = normalizeHex(
    firstMatch(h, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
      firstMatch(h, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)
  );

  const raw: Array<{ url: string | null; source: LogoSource }> = [
    { url: org.logo, source: 'jsonld_organization' },
    {
      url:
        firstMatch(h, /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ??
        firstMatch(h, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon[^"']*["']/i),
      source: 'apple_touch_icon',
    },
    {
      url:
        firstMatch(h, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ??
        firstMatch(h, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i),
      source: 'icon',
    },
    {
      url:
        firstMatch(h, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
        firstMatch(h, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i),
      source: 'og_image',
    },
  ];

  const seen = new Set<string>();
  const logoCandidates: LogoCandidate[] = [];
  for (const entry of raw) {
    if (!entry.url) continue;
    const url = absolute(entry.url, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    logoCandidates.push({ url, source: entry.source, confidence: SOURCE_CONFIDENCE[entry.source] });
  }

  return { companyName: companyName?.slice(0, 80) ?? null, themeColor, logoCandidates };
}

/**
 * The candidate we would pre-apply, or null when we would only offer an upload.
 *
 * Returning null is a real answer: a favicon is worse than the wordmark, so "we found nothing good
 * enough" beats applying something that makes their report look broken.
 */
export function bestLogoToApply(signals: BrandSignals): LogoCandidate | null {
  return signals.logoCandidates.find((c) => c.confidence === 'high') ?? null;
}

// ── Image validation ─────────────────────────────────────────────────────────

/**
 * Sniff the real format from magic bytes.
 *
 * Content-Type is attacker-controlled — the logo URL comes out of customer HTML, so a hostile page
 * can claim image/png for anything. pdf-lib will throw on a mismatch, and we would rather reject
 * it here than fail mid-render.
 */
export function detectImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((b, i) => bytes[i] === b)) return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Anything larger is not a masthead logo; it is a payload. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
