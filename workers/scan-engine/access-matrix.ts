/**
 * Access & Eligibility Matrix (spec §2.2/C3) + scanner-block self-diagnosis (C4).
 *
 * The headline diagnostic output: per AI destination, is this site Eligible, Blocked,
 * or Not Tested — and which specific control governs it. Training crawlers live in a
 * separate panel framed as a business choice, never a failure.
 *
 * Everything here is pure and JSON-serializable so it can be persisted in
 * `scans.full_results_json` and rendered by web + PDF layers.
 */
import { AGENT_REGISTRY_VERSION, agentsByFamily, type RegisteredAgent } from './agent-registry';
import { evaluateRobotsForToken, type RobotsVerdict } from './robots-evaluator';

export type DestinationStatus = 'eligible' | 'blocked' | 'not_tested';

export type DestinationId =
  | 'google_search_ai_overviews'
  | 'chatgpt_search'
  | 'claude'
  | 'perplexity'
  | 'bing_copilot';

export interface DestinationRow {
  destination: DestinationId;
  label: string;
  status: DestinationStatus;
  /** The specific control that governs this destination (plain English). */
  control: string;
  /** What we observed, in plain English. */
  detail: string;
  /** How to fix it, when status is blocked. */
  fix?: string;
}

export interface TrainingPanelEntry {
  token: string;
  vendor: string;
  /** null = robots.txt itself unavailable, so unknown. */
  allowed: boolean | null;
  /** Consequence framing — always a choice, never a failure. */
  note: string;
}

export type FetchBlockKind =
  | 'waf_challenge'
  | 'http_forbidden'
  | 'http_error'
  | 'timeout_or_network'
  | 'not_blocked';

export interface AccessDiagnosis {
  /** Did the scanner retrieve the page content? */
  pageFetched: boolean;
  blockKind: FetchBlockKind;
  /** Plain-English root cause ("Cloudflare challenge page", "HTTP 403", …). */
  rootCause: string | null;
  /** Steps the owner can hand to whoever manages the firewall. */
  safelistSteps: string[];
  /** Whether robots.txt itself was retrievable (access rows can still be graded from it). */
  robotsTxtAvailable: boolean;
}

export interface AccessMatrix {
  registryVersion: string;
  rows: DestinationRow[];
  trainingPanel: TrainingPanelEntry[];
  diagnosis: AccessDiagnosis;
}

// ── Scanner-block classification (C4) ─────────────────────────────────────────

const WAF_HEADER_MARKERS = ['cf-mitigated', 'cf-chl-bypass', 'x-sucuri-id', 'x-sucuri-block'];

export function classifyFetchFailure(input: {
  status?: number;
  headers?: Record<string, string>;
  reason: string;
}): { kind: FetchBlockKind; rootCause: string } {
  const { status, headers, reason } = input;
  const headerKeys = Object.keys(headers ?? {}).map((k) => k.toLowerCase());
  const server = headers?.server?.toLowerCase() ?? '';

  if (headerKeys.some((k) => WAF_HEADER_MARKERS.includes(k))) {
    return { kind: 'waf_challenge', rootCause: 'A firewall (WAF/CDN) challenge blocked the request before it reached your website.' };
  }
  if (status === 403 || status === 503 || status === 429) {
    const vendor = server.includes('cloudflare') ? 'Cloudflare' : server.includes('sucuri') ? 'Sucuri' : 'your firewall/CDN';
    return {
      kind: status === 403 ? 'http_forbidden' : 'waf_challenge',
      rootCause: `The request was refused with HTTP ${String(status)} — most likely ${vendor} bot protection, not your website itself.`,
    };
  }
  if (typeof status === 'number' && status >= 400) {
    return { kind: 'http_error', rootCause: `Your server answered HTTP ${String(status)}.` };
  }
  if (/timeout|network/i.test(reason)) {
    return { kind: 'timeout_or_network', rootCause: 'The request timed out or the connection failed before a response arrived.' };
  }
  return { kind: 'http_error', rootCause: reason };
}

export function safelistStepsFor(kind: FetchBlockKind): string[] {
  if (kind === 'waf_challenge' || kind === 'http_forbidden') {
    return [
      'Log in to your Cloudflare (or firewall) dashboard — whoever manages your hosting can do this.',
      'Open Security → WAF → Custom rules (Cloudflare) or your bot-protection settings.',
      'Add a Skip/Allow rule for verified bots: enable "Verified Bot" skip, or allow these user-agents: OAI-SearchBot, Claude-SearchBot, PerplexityBot, GEO-PulseBot.',
      'If you use "Bot Fight Mode", switch it to a custom rule — Bot Fight Mode cannot exempt specific good bots.',
      'Re-run this scan afterwards to confirm the block is gone.',
    ];
  }
  if (kind === 'timeout_or_network') {
    return [
      'Check that the site loads in a normal browser right now.',
      'If it loads, ask your host whether a firewall rate-limits or geo-blocks unknown visitors.',
      'Re-run this scan; a second timeout usually means automated visitors are being dropped.',
    ];
  }
  if (kind === 'http_error') {
    return [
      'Open the URL in a private/incognito browser window and note the error you see.',
      'Share that error with your hosting provider — the server is refusing requests, which also affects AI crawlers.',
    ];
  }
  return [];
}

// ── Matrix construction (C3) ──────────────────────────────────────────────────

export interface BuildMatrixInput {
  /** robots.txt content; empty string = fetched but empty/none; null = could not fetch. */
  robotsTxt: string | null;
  /** Did the scanner successfully fetch the page HTML? */
  pageFetched: boolean;
  /** Classification when pageFetched is false. */
  failure?: { status?: number; headers?: Record<string, string>; reason: string };
  /** From page signals when available. */
  signals?: { noindex: boolean; snippetRestricted: boolean };
}

function verdictFor(robotsTxt: string | null, token: string): RobotsVerdict | null {
  if (robotsTxt === null) return null;
  return evaluateRobotsForToken(robotsTxt, token, '/');
}

function robotsDetail(v: RobotsVerdict, agentLabel: string): string {
  if (v.allowed) return `robots.txt allows ${agentLabel}.`;
  const via = v.matchedGroup === 'wildcard' ? 'a catch-all (User-agent: *) rule' : `a rule targeting ${agentLabel}`;
  return `robots.txt blocks ${agentLabel} via ${via} (${v.decidingRule ?? 'Disallow'}).`;
}

/**
 * Build one destination row from a retrieval/search agent verdict plus origin reachability.
 * Robots verdicts are gradeable even when the page fetch was blocked (robots.txt is served
 * by the CDN edge); origin reachability is only "tested" when we actually got the page.
 */
function buildAgentRow(input: {
  destination: DestinationId;
  label: string;
  control: string;
  agent: RegisteredAgent;
  robotsTxt: string | null;
  pageFetched: boolean;
  blockKind: FetchBlockKind;
  fixWhenBlocked: string;
}): DestinationRow {
  const { destination, label, control, agent, robotsTxt, pageFetched, blockKind, fixWhenBlocked } = input;
  const v = verdictFor(robotsTxt, agent.token);

  if (v && !v.allowed) {
    return {
      destination,
      label,
      status: 'blocked',
      control,
      detail: `${robotsDetail(v, agent.token)} ${agent.blockConsequence}`,
      fix: fixWhenBlocked,
    };
  }

  if (!pageFetched) {
    const cause =
      blockKind === 'waf_challenge' || blockKind === 'http_forbidden'
        ? 'a firewall blocked our test fetch, and the same layer can silently block compliant AI bots even when robots.txt allows them'
        : 'our test fetch did not get a response, so bot access could not be confirmed';
    return {
      destination,
      label,
      status: 'not_tested',
      control,
      detail: `robots.txt ${v ? `allows ${agent.token}` : 'could not be checked'}, but ${cause}.`,
      fix: 'Safelist verified bots in your firewall, then re-scan to confirm real access.',
    };
  }

  return {
    destination,
    label,
    status: 'eligible',
    control,
    detail: `${v ? robotsDetail(v, agent.token) : `No robots.txt restriction found for ${agent.token}.`} Origin responded normally to our fetch.`,
  };
}

export function buildAccessMatrix(input: BuildMatrixInput): AccessMatrix {
  const { robotsTxt, pageFetched, failure, signals } = input;

  const classification = pageFetched
    ? { kind: 'not_blocked' as const, rootCause: null }
    : (() => {
        const c = classifyFetchFailure(failure ?? { reason: 'Fetch failed' });
        return { kind: c.kind, rootCause: c.rootCause as string | null };
      })();

  const diagnosis: AccessDiagnosis = {
    pageFetched,
    blockKind: classification.kind,
    rootCause: classification.rootCause,
    safelistSteps: safelistStepsFor(classification.kind),
    robotsTxtAvailable: robotsTxt !== null,
  };

  const byToken = new Map(
    [...agentsByFamily('retrieval'), ...agentsByFamily('conventional_search')].map((a) => [a.token, a])
  );
  const mustAgent = (token: string): RegisteredAgent => {
    const a = byToken.get(token);
    if (!a) throw new Error(`Agent registry is missing required token: ${token}`);
    return a;
  };

  const rows: DestinationRow[] = [];

  // Google Search + AI Overviews — governed by Googlebot + snippet eligibility +
  // the Search Console "Search generative AI" control. NOT by Google-Extended.
  const googlebot = mustAgent('Googlebot');
  const gVerdict = verdictFor(robotsTxt, 'Googlebot');
  if (gVerdict && !gVerdict.allowed) {
    rows.push({
      destination: 'google_search_ai_overviews',
      label: 'Google Search + AI Overviews',
      status: 'blocked',
      control: 'Googlebot crawlability + snippet eligibility + the Search Console AI controls (not Google-Extended)',
      detail: `${robotsDetail(gVerdict, 'Googlebot')} ${googlebot?.blockConsequence ?? ''}`.trim(),
      fix: 'Remove the robots.txt rule blocking Googlebot — AI Overviews eligibility rides on normal Google indexability.',
    });
  } else if (signals?.noindex) {
    rows.push({
      destination: 'google_search_ai_overviews',
      label: 'Google Search + AI Overviews',
      status: 'blocked',
      control: 'Googlebot crawlability + snippet eligibility + the Search Console AI controls (not Google-Extended)',
      detail: 'The page carries a noindex robots meta tag, which removes it from Google Search and therefore from AI Overviews.',
      fix: 'Remove the noindex directive (or scope it to pages you genuinely want hidden).',
    });
  } else if (signals?.snippetRestricted) {
    rows.push({
      destination: 'google_search_ai_overviews',
      label: 'Google Search + AI Overviews',
      status: 'blocked',
      control: 'Snippet eligibility (nosnippet / max-snippet=0)',
      detail: 'A nosnippet/max-snippet restriction makes the page ineligible to appear in AI Overviews snippets.',
      fix: 'Remove nosnippet / max-snippet=0 unless you deliberately opted out of snippets.',
    });
  } else if (!pageFetched) {
    rows.push({
      destination: 'google_search_ai_overviews',
      label: 'Google Search + AI Overviews',
      status: 'not_tested',
      control: 'Googlebot crawlability + snippet eligibility + the Search Console AI controls (not Google-Extended)',
      detail: `robots.txt ${gVerdict ? 'allows Googlebot' : 'could not be checked'}, but the page itself could not be retrieved, so index/snippet signals could not be confirmed.`,
      fix: 'Safelist verified bots in your firewall, then re-scan.',
    });
  } else {
    rows.push({
      destination: 'google_search_ai_overviews',
      label: 'Google Search + AI Overviews',
      status: 'eligible',
      control: 'Googlebot crawlability + snippet eligibility + the Search Console AI controls (not Google-Extended)',
      detail: 'Googlebot is allowed, the page is indexable, and no snippet restriction was found. Confirm real index status in Google Search Console.',
    });
  }

  rows.push(
    buildAgentRow({
      destination: 'chatgpt_search',
      label: 'ChatGPT Search',
      control: 'OAI-SearchBot access + origin reachability (Bing indexing still matters, especially for local queries)',
      agent: mustAgent('OAI-SearchBot'),
      robotsTxt,
      pageFetched,
      blockKind: classification.kind,
      fixWhenBlocked: 'Allow OAI-SearchBot in robots.txt — this is the retrieval agent that decides whether ChatGPT can cite you.',
    }),
    buildAgentRow({
      destination: 'claude',
      label: 'Claude',
      control: 'Claude-SearchBot (search index) + Claude-User (live fetches)',
      agent: mustAgent('Claude-SearchBot'),
      robotsTxt,
      pageFetched,
      blockKind: classification.kind,
      fixWhenBlocked: 'Allow Claude-SearchBot in robots.txt so Claude search can index and cite your site.',
    }),
    buildAgentRow({
      destination: 'perplexity',
      label: 'Perplexity',
      control: 'PerplexityBot access + WAF reachability',
      agent: mustAgent('PerplexityBot'),
      robotsTxt,
      pageFetched,
      blockKind: classification.kind,
      fixWhenBlocked: 'Allow PerplexityBot in robots.txt and confirm your firewall lets it through.',
    }),
    buildAgentRow({
      destination: 'bing_copilot',
      label: 'Bing / Copilot',
      control: 'Bingbot crawlability',
      agent: mustAgent('Bingbot'),
      robotsTxt,
      pageFetched,
      blockKind: classification.kind,
      fixWhenBlocked: 'Allow Bingbot — it feeds Bing, Copilot, and part of ChatGPT search results.',
    })
  );

  // Training / IP decision panel — a choice, not a score input.
  const trainingPanel: TrainingPanelEntry[] = agentsByFamily('training').map((a) => {
    const v = verdictFor(robotsTxt, a.token);
    return {
      token: a.token,
      vendor: a.vendor,
      allowed: v === null ? null : v.allowed,
      note: a.blockConsequence,
    };
  });

  return { registryVersion: AGENT_REGISTRY_VERSION, rows, trainingPanel, diagnosis };
}
