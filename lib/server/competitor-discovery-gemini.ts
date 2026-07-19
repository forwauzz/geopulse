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
  parseDiscoveryResponse,
  type BusinessProfile,
  type CompetitorCandidate,
} from './competitor-discovery';

export type CompetitorDiscoveryGeminiEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_ENDPOINT?: string;
};

export type LiveDiscoveryResult =
  | { ok: true; competitors: CompetitorCandidate[] }
  | { ok: false; reason: string };

type FetchLike = typeof fetch;
// Free invocation keeps `this === globalThis` (Cloudflare Workers "Illegal invocation" guard).
const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const TRANSIENT_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];

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

  const model = env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
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
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      const competitors = parseDiscoveryResponse(text, selfDomain);
      if (competitors.length === 0) return { ok: false, reason: 'gemini_no_competitors_parsed' };
      return { ok: true, competitors };
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
