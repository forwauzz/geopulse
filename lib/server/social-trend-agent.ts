/**
 * Sofia — GEO-Pulse social trend intelligence.
 *
 * Sofia uses grounded search providers to collect source-linked ideas. The output is
 * planning data, not copied media: Jordan receives the hook/format/audience pattern
 * and creates an original GEO-Pulse asset. Public claims only become autonomous when
 * the idea points to an authoritative first-party source.
 */

export type SocialTrendSlot = 'timely' | 'humor' | 'carousel' | 'proof';
export type SocialTrendAudience = 'agency' | 'small_business' | 'both';
export type SocialTrendSourceType = 'official' | 'community' | 'industry';

export type SocialTrendIdea = {
  readonly key: string;
  readonly slot: SocialTrendSlot;
  readonly audience: SocialTrendAudience;
  readonly title: string;
  readonly hook: string;
  readonly angle: string;
  readonly caption: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly sourceType: SocialTrendSourceType;
  readonly whyNow: string;
  readonly discoveredAt: string;
  readonly score: number;
  readonly safeForAutonomousPublish: boolean;
};

export type SocialTrendDiscoveryResult =
  | {
      readonly ok: true;
      readonly provider: 'gemini' | 'openai';
      readonly ideas: readonly SocialTrendIdea[];
    }
  | { readonly ok: false; readonly reason: string; readonly ideas: readonly [] };

export type SocialTrendEnv = {
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_ENDPOINT?: string;
  readonly SOCIAL_TREND_GEMINI_MODEL?: string;
  readonly OPENAI_API_KEY?: string;
  readonly SOCIAL_TREND_OPENAI_MODEL?: string;
};

type RawTrendIdea = {
  slot?: unknown;
  audience?: unknown;
  title?: unknown;
  hook?: unknown;
  angle?: unknown;
  caption?: unknown;
  source_url?: unknown;
  source_label?: unknown;
  source_type?: unknown;
  why_now?: unknown;
  relevance?: unknown;
  timeliness?: unknown;
  usefulness?: unknown;
  conversion_fit?: unknown;
};

const FORBIDDEN_CLAIMS =
  /\b(guarantee(?:d|s)?|dominat(?:e|es|ing)|best[- ]in[- ]class|future[- ]proof|number one|#1|market leader|exponential growth)\b/i;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(10, value))
    : 0;
}

function safeHttpsUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value, 500));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizedKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) return null;
    const value = JSON.parse(match[0]) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseSocialTrendDiscovery(
  raw: string,
  discoveredAt = new Date().toISOString()
): SocialTrendIdea[] {
  const parsed = parseJsonObject(raw);
  const rows = Array.isArray(parsed?.['ideas']) ? (parsed?.['ideas'] as RawTrendIdea[]) : [];
  const seen = new Set<string>();
  const ideas: SocialTrendIdea[] = [];

  for (const row of rows) {
    const slot =
      row.slot === 'timely' || row.slot === 'humor' || row.slot === 'carousel' || row.slot === 'proof'
        ? row.slot
        : null;
    const audience =
      row.audience === 'agency' || row.audience === 'small_business' || row.audience === 'both'
        ? row.audience
        : 'both';
    const sourceType =
      row.source_type === 'official' || row.source_type === 'community' || row.source_type === 'industry'
        ? row.source_type
        : 'industry';
    const sourceUrl = safeHttpsUrl(row.source_url);
    const title = text(row.title, 120);
    const hook = text(row.hook, 120);
    const angle = text(row.angle, 260);
    const caption = text(row.caption, 1_500);
    const sourceLabel = text(row.source_label, 100);
    const whyNow = text(row.why_now, 240);
    if (!slot || !sourceUrl || !title || !hook || !angle || !caption || !sourceLabel || !whyNow) {
      continue;
    }
    if (FORBIDDEN_CLAIMS.test(`${title} ${hook} ${angle} ${caption}`)) continue;

    const key = normalizedKey(`${slot}-${sourceUrl}-${title}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const score = Math.round(
      number(row.relevance) * 3 +
      number(row.timeliness) * 3 +
      number(row.usefulness) * 2 +
      number(row.conversion_fit) * 2
    );
    ideas.push({
      key,
      slot,
      audience,
      title,
      hook,
      angle,
      caption,
      sourceUrl,
      sourceLabel,
      sourceType,
      whyNow,
      discoveredAt,
      score,
      // Community chatter is useful vocabulary and format input, never autonomous proof.
      safeForAutonomousPublish: sourceType === 'official',
    });
  }

  return ideas.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 20);
}

export function buildDailySocialSlate(
  ideas: readonly SocialTrendIdea[],
  recentlyUsedKeys: ReadonlySet<string> = new Set()
): SocialTrendIdea[] {
  const slots: readonly SocialTrendSlot[] = ['timely', 'humor', 'carousel', 'proof'];
  const selected: SocialTrendIdea[] = [];
  const selectedSources = new Set<string>();

  for (const slot of slots) {
    const candidate = ideas.find(
      (idea) =>
        idea.slot === slot &&
        !recentlyUsedKeys.has(idea.key) &&
        !selectedSources.has(idea.sourceUrl)
    );
    if (!candidate) continue;
    selected.push(candidate);
    selectedSources.add(candidate.sourceUrl);
  }

  for (const idea of ideas) {
    if (selected.length >= 4) break;
    if (
      recentlyUsedKeys.has(idea.key) ||
      selected.some((row) => row.key === idea.key) ||
      selectedSources.has(idea.sourceUrl)
    ) {
      continue;
    }
    selected.push(idea);
    selectedSources.add(idea.sourceUrl);
  }
  return selected;
}

function discoveryPrompt(now: Date): string {
  return [
    'You are Sofia, GEO-Pulse trend and audience researcher.',
    `Today is ${now.toISOString().slice(0, 10)}. Use web search and inspect current primary sources.`,
    'Find useful content opportunities for SEO consultants, marketing agencies, and small-business owners who need to understand AI-search visibility.',
    'Prefer first-party product announcements from Google, Bing, OpenAI, Anthropic, Perplexity, and credible current industry discussion.',
    'Community or social posts may reveal vocabulary and humor, but never treat engagement or anecdotes as factual proof.',
    'Return 10-14 ideas across exactly these slots: timely, humor, carousel, proof.',
    'Every idea needs a real HTTPS source. source_type must be official, industry, or community.',
    'Write original GEO-Pulse hooks and captions. Do not copy source wording, jokes, visuals, audio, or claims.',
    'No ranking/citation guarantees, invented statistics, market-leader claims, or raw URLs in captions.',
    'Captions must be useful, direct, low-hype, and end with a restrained “run a free scan” CTA when relevant.',
    'Score relevance, timeliness, usefulness, and conversion_fit from 0-10.',
    'Return ONLY JSON: {"ideas":[{"slot":"timely|humor|carousel|proof","audience":"agency|small_business|both","title":"...","hook":"...","angle":"...","caption":"...","source_url":"https://...","source_label":"...","source_type":"official|industry|community","why_now":"...","relevance":0,"timeliness":0,"usefulness":0,"conversion_fit":0}]}',
  ].join('\n');
}

function openAiResponseText(value: unknown): string {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (typeof record['output_text'] === 'string') return record['output_text'];
  const output = Array.isArray(record['output']) ? record['output'] : [];
  return output
    .flatMap((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return Array.isArray(row['content']) ? row['content'] : [];
    })
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return typeof row['text'] === 'string' ? row['text'] : '';
    })
    .join('');
}

async function discoverWithGemini(
  env: SocialTrendEnv,
  prompt: string,
  discoveredAt: string
): Promise<SocialTrendDiscoveryResult> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, reason: 'gemini_key_missing', ideas: [] };
  const model = env.SOCIAL_TREND_GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
  const base = (
    env.GEMINI_ENDPOINT?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models'
  ).replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 5_000 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`);
    return { ok: false, reason: timedOut ? 'gemini_timeout' : 'gemini_network_error', ideas: [] };
  }
  if (!response.ok) return { ok: false, reason: `gemini_http_${response.status}`, ideas: [] };
  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const ideas = parseSocialTrendDiscovery(
    json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    discoveredAt
  );
  return ideas.length > 0
    ? { ok: true, provider: 'gemini', ideas }
    : { ok: false, reason: 'gemini_no_valid_ideas', ideas: [] };
}

async function discoverWithOpenAI(
  env: SocialTrendEnv,
  prompt: string,
  discoveredAt: string
): Promise<SocialTrendDiscoveryResult> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return { ok: false, reason: 'openai_key_missing', ideas: [] };
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.SOCIAL_TREND_OPENAI_MODEL?.trim() || 'gpt-5.6-luna',
        input: prompt,
        tools: [{ type: 'web_search' }],
        reasoning: { effort: 'low' },
        max_output_tokens: 5_000,
      }),
      signal: AbortSignal.timeout(18_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`);
    return { ok: false, reason: timedOut ? 'openai_timeout' : 'openai_network_error', ideas: [] };
  }
  if (!response.ok) return { ok: false, reason: `openai_http_${response.status}`, ideas: [] };
  const ideas = parseSocialTrendDiscovery(openAiResponseText(await response.json()), discoveredAt);
  return ideas.length > 0
    ? { ok: true, provider: 'openai', ideas }
    : { ok: false, reason: 'openai_no_valid_ideas', ideas: [] };
}

export async function discoverSocialTrends(
  env: SocialTrendEnv,
  now = new Date(),
  reserve?: (provider: 'gemini' | 'openai', estimatedCostUsd: number) => Promise<boolean>,
): Promise<SocialTrendDiscoveryResult> {
  const prompt = discoveryPrompt(now);
  const discoveredAt = now.toISOString();
  if (reserve && env.GEMINI_API_KEY?.trim() && !(await reserve('gemini', 0.02))) {
    return { ok: false, reason: 'gemini_spend_cap', ideas: [] };
  }
  const gemini = await discoverWithGemini(env, prompt, discoveredAt);
  if (gemini.ok) return gemini;
  if (reserve && env.OPENAI_API_KEY?.trim() && !(await reserve('openai', 0.05))) {
    return { ok: false, reason: `${gemini.reason};openai_spend_cap`, ideas: [] };
  }
  const openai = await discoverWithOpenAI(env, prompt, discoveredAt);
  if (openai.ok) return openai;
  return { ok: false, reason: `${gemini.reason};${openai.reason}`, ideas: [] };
}

