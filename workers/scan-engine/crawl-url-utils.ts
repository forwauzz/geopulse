/**
 * URL normalization, same-origin link extraction, and section-aware ordering (DA-002).
 */

/**
 * Normalize URL for deduplication: scheme + lowercase host + path + search; no fragment.
 */
export function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.hostname.toLowerCase();
    const path = u.pathname || '/';
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return '';
  }
}

/**
 * Extract same-origin http(s) links for crawl frontier (bounded). Hostname match only (http/https treated as same site).
 */
export function extractSameOriginLinks(html: string, pageUrl: string, maxLinks: number): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const originHost = base.hostname.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < maxLinks) {
    const raw = m[1]?.trim();
    if (!raw || raw.startsWith('#') || raw.toLowerCase().startsWith('javascript:')) continue;
    const lower = raw.toLowerCase();
    if (lower.startsWith('mailto:') || lower.startsWith('tel:')) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, base);
    } catch {
      continue;
    }
    if (resolved.hostname.toLowerCase() !== originHost) continue;
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    const key = normalizeUrlKey(resolved.href);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(resolved.href);
  }
  return out;
}

/** Top-level path segment for section diversity, e.g. `/`, `/blog`, `/practice-areas`. */
export function pathSectionKey(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  return `/${parts[0]}`;
}

/**
 * Reserve at least one slot per distinct path section where possible, then fill to `limit`.
 */
export function prioritizeUrlsBySection(seedUrl: string, candidates: readonly string[], limit: number): string[] {
  const seedNorm = normalizeUrlKey(seedUrl);
  const unique = new Map<string, string>();
  for (const u of candidates) {
    const n = normalizeUrlKey(u);
    if (!n) continue;
    if (!unique.has(n)) unique.set(n, u);
  }

  const ordered: string[] = [];
  const used = new Set<string>();

  if (seedNorm && unique.has(seedNorm)) {
    ordered.push(unique.get(seedNorm)!);
    used.add(seedNorm);
  }

  const bySection = new Map<string, string[]>();
  for (const [norm, url] of unique) {
    if (used.has(norm)) continue;
    try {
      const path = new URL(url).pathname;
      const sec = pathSectionKey(path);
      if (!bySection.has(sec)) bySection.set(sec, []);
      bySection.get(sec)!.push(url);
    } catch {
      continue;
    }
  }

  const sectionKeys = [...bySection.keys()].sort();
  for (const sec of sectionKeys) {
    if (ordered.length >= limit) break;
    const urls = bySection.get(sec)!;
    const pick = urls.find((u) => {
      const nn = normalizeUrlKey(u);
      return nn && !used.has(nn);
    });
    if (pick) {
      const nn = normalizeUrlKey(pick);
      if (nn && !used.has(nn)) {
        ordered.push(pick);
        used.add(nn);
      }
    }
  }

  for (const [norm, url] of unique) {
    if (ordered.length >= limit) break;
    if (used.has(norm)) continue;
    ordered.push(url);
    used.add(norm);
  }

  return ordered.slice(0, limit);
}

export function sameHostname(url: string, hostLower: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === hostLower.toLowerCase();
  } catch {
    return false;
  }
}
