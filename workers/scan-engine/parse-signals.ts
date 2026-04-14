/**
 * Extract lightweight signals from HTML for deterministic checks.
 * Uses bounded string scans (no full DOM) so it runs in Node dev and Workers.
 */
import type { PageSignals } from '../lib/interfaces/audit';

const MAX_HTML_CHARS = 512_000;

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1]?.trim() ?? null;
}

function countMatches(html: string, re: RegExp): number {
  const g = html.match(re);
  return g?.length ?? 0;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build a short plain-text sample for LLM prompts (bounded).
 */
export function buildTextSample(html: string, maxChars = 8000): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const slice = (bodyMatch?.[1] ?? html).slice(0, MAX_HTML_CHARS);
  return stripTags(slice).slice(0, maxChars);
}

export function parsePageSignals(html: string): PageSignals {
  const h = html.slice(0, MAX_HTML_CHARS);

  const title =
    firstMatch(h, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    firstMatch(h, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);

  const metaDescription =
    firstMatch(h, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

  const canonicalHref =
    firstMatch(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    firstMatch(h, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);

  const robotsMetaContent =
    firstMatch(h, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i);

  const ogTitle =
    firstMatch(h, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);

  const ogDescription =
    firstMatch(h, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);

  const jsonLdSnippetCount = countMatches(h, /<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi);

  const jsonLdTypes: string[] = [];
  const ldBlockRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldBlockRe.exec(h)) !== null) {
    try {
      const parsed: unknown = JSON.parse(ldMatch[1] ?? '');
      const extractType = (obj: unknown): void => {
        if (obj && typeof obj === 'object' && '@type' in (obj as Record<string, unknown>)) {
          const t = (obj as Record<string, unknown>)['@type'];
          if (typeof t === 'string') jsonLdTypes.push(t);
          if (Array.isArray(t)) t.forEach((v) => { if (typeof v === 'string') jsonLdTypes.push(v); });
        }
      };
      if (Array.isArray(parsed)) parsed.forEach(extractType);
      else extractType(parsed);
    } catch { /* malformed JSON-LD — skip */ }
  }

  const h1Count = countMatches(h, /<h1\b/gi);
  const h2Count = countMatches(h, /<h2\b/gi);

  const hasViewportMeta =
    /<meta[^>]+name=["']viewport["']/i.test(h) ||
    /<meta[^>]+content=["'][^"']*width=device-width/i.test(h);

  const hasAuthorMeta = /<meta[^>]+name=["']author["']/i.test(h);
  const hasSchemaAuthor = /"author"/i.test(h) && /"@type"/i.test(h);
  const hasRelAuthor = /rel=["']author["']/i.test(h);
  const hasAuthorClass = /class=["'][^"']*\b(author|byline)\b/i.test(h);
  const hasAuthorSignal = hasAuthorMeta || hasSchemaAuthor || hasRelAuthor || hasAuthorClass;

  const robotsLower = robotsMetaContent?.toLowerCase() ?? '';
  const hasSnippetRestriction =
    robotsLower.includes('nosnippet') ||
    /max-snippet\s*[:=]\s*0/.test(robotsLower);

  const totalImages = countMatches(h, /<img\b/gi);
  const imagesWithAlt = countMatches(h, /<img[^>]+alt=["'][^"']+["']/gi);
  const imagesWithoutAlt = totalImages - imagesWithAlt;

  const publishedDate =
    firstMatch(h, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']article:published_time["']/i) ??
    firstMatch(h, /"datePublished"\s*:\s*"([^"]+)"/i);

  const modifiedDate =
    firstMatch(h, /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(h, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']article:modified_time["']/i) ??
    firstMatch(h, /"dateModified"\s*:\s*"([^"]+)"/i);

  const linkHrefRe = /<a[^>]+href=["']([^"']+)["']/gi;
  let internal = 0;
  let external = 0;
  let hasAboutLink = false;
  let m: RegExpExecArray | null;
  const re = new RegExp(linkHrefRe.source, linkHrefRe.flags);
  while ((m = re.exec(h)) !== null) {
    const href = m[1] ?? '';
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      external += 1;
      if (/\/about\b/i.test(href)) hasAboutLink = true;
    } else {
      internal += 1;
      if (/\/about\b/i.test(href)) hasAboutLink = true;
    }
  }

  return {
    title,
    metaDescription,
    canonicalHref,
    robotsMetaContent,
    ogTitle,
    ogDescription,
    jsonLdSnippetCount,
    jsonLdTypes,
    h1Count,
    h2Count,
    hasViewportMeta,
    htmlCharLength: html.length,
    internalLinkCount: internal,
    externalLinkCount: external,
    hasAuthorSignal,
    hasAboutLink,
    hasSnippetRestriction,
    totalImages,
    imagesWithoutAlt,
    publishedDate,
    modifiedDate,
  };
}
