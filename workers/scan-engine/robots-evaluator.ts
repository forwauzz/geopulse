/**
 * Per-token robots.txt evaluation, modeled on RFC 9309 group selection:
 *   - rules are grouped under one or more User-agent lines;
 *   - a crawler obeys the group whose user-agent token matches it most specifically
 *     (exact token match beats the `*` group; the `*` group applies only when no
 *     specific group exists);
 *   - within the selected group, the longest-path rule wins; Allow beats Disallow
 *     on equal length.
 *
 * This replaces the old line-scan heuristic that only caught blanket `Disallow: /`
 * and conflated every "AI bot" into one verdict.
 */

export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
}

export interface RobotsGroup {
  agents: string[]; // lower-cased user-agent tokens
  rules: RobotsRule[];
}

export interface RobotsVerdict {
  token: string;
  /** Which group governed the verdict. */
  matchedGroup: 'specific' | 'wildcard' | 'none';
  /** Whether the given path is crawlable for this token. */
  allowed: boolean;
  /** The winning rule line, for showing the owner exactly what caused a block. */
  decidingRule: string | null;
}

export function parseRobotsTxt(content: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === 'user-agent') {
      if (!lastLineWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      // A malformed empty token would otherwise prefix-match every crawler.
      if (value) current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      current.rules.push({ type: field, path: value });
    }
  }

  return groups;
}

/** Longest-match path comparison per RFC 9309 (supports `*` wildcards and `$` anchors). */
function pathMatches(rulePath: string, path: string): boolean {
  if (rulePath === '') return false; // empty Disallow = allow everything
  // Escape regex specials except * and $, then translate.
  const escaped = rulePath.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
  const anchored = escaped.endsWith('$')
    ? `^${escaped.slice(0, -1).replaceAll('*', '.*')}$`
    : `^${escaped.replaceAll('*', '.*')}`;
  try {
    return new RegExp(anchored).test(path);
  } catch {
    return path.startsWith(rulePath.replace(/\*.*$/, ''));
  }
}

function selectGroup(groups: RobotsGroup[], token: string): { group: RobotsGroup | null; kind: 'specific' | 'wildcard' | 'none' } {
  const lower = token.toLowerCase();
  // Exact token match, plus the vendor-style dash-boundary fallback (a group named
  // "Claude" governs "Claude-SearchBot"). A bare prefix without the boundary must NOT
  // match — "Google" would otherwise capture "Google-Extended" AND "Googlebot" from
  // unrelated groups per plain startsWith.
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && (lower === a || lower.startsWith(`${a}-`)))
  );
  if (specific.length > 0) {
    // Merge all groups naming this token (RFC: rules from all matching groups combine).
    const merged: RobotsGroup = { agents: [lower], rules: specific.flatMap((g) => g.rules) };
    return { group: merged, kind: 'specific' };
  }
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  if (wildcard.length > 0) {
    const merged: RobotsGroup = { agents: ['*'], rules: wildcard.flatMap((g) => g.rules) };
    return { group: merged, kind: 'wildcard' };
  }
  return { group: null, kind: 'none' };
}

/**
 * Evaluate whether `token` may crawl `path` (default `/`) under this robots.txt.
 * Empty/missing robots.txt ⇒ allowed.
 */
export function evaluateRobotsForToken(
  robotsTxt: string,
  token: string,
  path = '/'
): RobotsVerdict {
  if (!robotsTxt.trim()) {
    return { token, matchedGroup: 'none', allowed: true, decidingRule: null };
  }

  const groups = parseRobotsTxt(robotsTxt);
  const { group, kind } = selectGroup(groups, token);
  if (!group) {
    return { token, matchedGroup: 'none', allowed: true, decidingRule: null };
  }

  let winner: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!pathMatches(rule.path, path)) continue;
    if (!winner) {
      winner = rule;
      continue;
    }
    if (rule.path.length > winner.path.length) {
      winner = rule;
    } else if (rule.path.length === winner.path.length && rule.type === 'allow' && winner.type === 'disallow') {
      winner = rule;
    }
  }

  if (!winner) {
    return { token, matchedGroup: kind, allowed: true, decidingRule: null };
  }

  return {
    token,
    matchedGroup: kind,
    allowed: winner.type === 'allow',
    decidingRule: `${winner.type === 'allow' ? 'Allow' : 'Disallow'}: ${winner.path}`,
  };
}
