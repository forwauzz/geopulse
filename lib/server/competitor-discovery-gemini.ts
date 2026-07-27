/**
 * Live competitor discovery via Gemini with Google-Search grounding (`google_search` tool).
 *
 * DORMANT by default: `resolveDiscoveryMode()` returns 'mock' unless COMPETITOR_DISCOVERY_MODE
 * is set to 'live' AND a GEMINI_API_KEY is present. Even then it needs a BILLED Gemini key —
 * the free tier 429s immediately on grounded search (OSS-REFACTOR-PLAN.md Loop 4 prerequisite).
 * This is the one remaining external blocker for live discovery; the code path is complete.
 *
 * Modeled on `GeminiBenchmarkExecutionAdapter` (retry policy + Workers-safe fetch wrapper).
 */
import {
  buildDiscoveryPrompt,
  parseDiscoveryPayload,
  type BusinessProfile,
  type CompetitorCandidate,
  type DiscoveredBusinessContext,
} from './competitor-discovery';

export type CompetitorDiscoveryGeminiEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  COMPETITOR_DISCOVERY_GEMINI_MODEL?: string;
  GEMINI_ENDPOINT?: string;
};

export type LiveDiscoveryResult =
  | { ok: true; competitors: CompetitorCandidate[]; context: DiscoveredBusinessContext | null }
  | { ok: false; reason: string };

type FetchLike = typeof fetch;
// Free invocation keeps `this === globalThis` (Cloudflare Workers "Illegal invocation" guard).
const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const TRANSIENT_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];
const EXCLUDED_GROUNDED_DOMAINS = new Set([
  'google.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com',
  'yelp.com', 'yellowpages.ca', 'wikipedia.org',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function discoverCompetitorsLive(
  env: CompetitorDiscoveryGeminiEnv,
  profile: BusinessProfile,
  selfDomain: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<LiveDiscoveryResult> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, reason: 'gemini_api_key_missing' };

  const model =
    env.COMPETITOR_DISCOVERY_GEMINI_MODEL?.trim() ||
    env.GEMINI_MODEL?.trim() ||
    'gemini-2.5-flash-lite';
  const base = (env.GEMINI_ENDPOINT?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/$/, '');
  const url = `${base}/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ parts: [{ text: buildDiscoveryPrompt(profile, selfDomain) }] }],
    // Google-Search grounding — the whole point of the live path. Requires a billed key.
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const retryable = TRANSIENT_STATUSES.has(res.status);
        if (retryable && attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1200);
          continue;
        }
        return { ok: false, reason: `gemini_http_${String(res.status)}` };
      }

      const data = (await res.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          groundingMetadata?: {
            groundingChunks?: { web?: { uri?: string; title?: string } }[];
          };
        }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      const parsed = parseDiscoveryPayload(text, selfDomain);
      const competitors = [...parsed.competitors];
      const seen = new Set(competitors.map((item) => item.domain));
      const self = selfDomain.replace(/^www\./i, '').toLowerCase();
      for (const chunk of data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
        const uri = chunk.web?.uri;
        if (!uri) continue;
        try {
          const url = new URL(uri);
          const domain = url.hostname.replace(/^www\./i, '').toLowerCase();
          if (
            !domain || domain === self || seen.has(domain) ||
            EXCLUDED_GROUNDED_DOMAINS.has(domain)
          ) continue;
          seen.add(domain);
          competitors.push({
            name: chunk.web?.title?.trim() || domain,
            domain,
            url: `${url.protocol}//${url.hostname}/`,
            reason: 'Found in the grounded competitor search.',
          });
          if (competitors.length >= 5) break;
        } catch {
          // Ignore malformed grounding URLs.
        }
      }
      if (competitors.length < 3) return { ok: false, reason: 'gemini_insufficient_competitors' };
      return { ok: true, competitors: competitors.slice(0, 5), context: parsed.context };
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1200);
        continue;
      }
      return { ok: false, reason: error instanceof Error ? error.message : 'gemini_error' };
    }
  }
  return { ok: false, reason: 'gemini_retry_exhausted' };
}
