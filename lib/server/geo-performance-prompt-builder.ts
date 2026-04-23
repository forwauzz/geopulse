import { z } from 'zod';
import { seedBenchmarkQuerySet } from './benchmark-query-set-seed';
import { structuredLog } from './structured-log';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GpmQueryCategory = 'high_intent' | 'informational' | 'local' | 'branded' | 'comparative';

export type GpmGeneratedQuery = {
  readonly queryKey: string;
  readonly queryText: string;
  readonly intentType: 'direct' | 'comparative' | 'discovery';
  readonly category: GpmQueryCategory;
};

export type GpmPromptBuilderInput = {
  readonly topic: string;
  readonly location: string;
  readonly brandName?: string | null;
  readonly promptCount: number;
};

export type GpmPromptBuilderEnvLike = {
  readonly ANTHROPIC_API_KEY?: string;
  readonly GPM_PROMPT_BUILDER_MODEL?: string;
};

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ── Prompt construction ───────────────────────────────────────────────────────

export function buildGpmQueryPrompt(input: GpmPromptBuilderInput): string {
  const { topic, location, brandName, promptCount } = input;
  const clampedCount = Math.min(Math.max(promptCount, 3), 20);
  const brandLine = brandName
    ? `The measured brand is "${brandName}". Include 1–2 branded queries that include this name.`
    : 'No brand name is specified — skip branded queries.';

  return `You are helping build an AI search visibility benchmark for a GEO Performance Monitoring report.

Topic: ${topic}
Location: ${location}
${brandLine}

Generate exactly ${clampedCount} search queries that a person might ask ChatGPT, Gemini, or Perplexity to find ${topic} services in ${location}.

Distribute queries across these categories:
- high_intent: direct "best/top/find" queries for the service in that location
- informational: what/why/how questions about the topic
- local: location-anchored queries (neighbourhood, nearby, city-specific)
- branded: queries that mention the specific brand name (only if a brand name is given)
- comparative: "which/compare/vs" queries for provider selection

Rules:
1. Each query must be a natural question or search phrase (not a keyword).
2. Every queryKey must be a unique lowercase slug using only letters, numbers, and hyphens.
3. intentType must be: "direct" (high_intent, branded), "discovery" (informational, local), or "comparative" (comparative).
4. No duplicate queries or keys.
5. Queries must be realistic — something a real person would type.

Respond with valid JSON only. No explanation, no markdown fences. Format:
{
  "queries": [
    {
      "query_key": "string",
      "query_text": "string",
      "intent_type": "direct" | "discovery" | "comparative",
      "category": "high_intent" | "informational" | "local" | "branded" | "comparative"
    }
  ]
}`;
}

// ── Response parsing ──────────────────────────────────────────────────────────

const gpmQuerySchema = z.object({
  query_key: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'key must be a slug'),
  query_text: z.string().min(5).max(300),
  intent_type: z.enum(['direct', 'comparative', 'discovery']),
  category: z.enum(['high_intent', 'informational', 'local', 'branded', 'comparative']),
});

const gpmResponseSchema = z.object({
  queries: z.array(gpmQuerySchema).min(1).max(25),
});

export function parseGpmQueryResponse(raw: string): GpmGeneratedQuery[] {
  // Strip markdown fences if the model wraps its output despite instructions
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in Claude response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('Claude response is not valid JSON.');
  }

  const result = gpmResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Claude response failed validation: ${result.error.message}`);
  }

  // Deduplicate by query_key (take first occurrence)
  const seen = new Set<string>();
  return result.data.queries
    .filter((q) => {
      if (seen.has(q.query_key)) return false;
      seen.add(q.query_key);
      return true;
    })
    .map((q) => ({
      queryKey: q.query_key,
      queryText: q.query_text,
      intentType: q.intent_type,
      category: q.category,
    }));
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function callClaudeMessages(args: {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: args.prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('No text block in Anthropic response.');
  return textBlock.text;
}

// ── Public entry points ───────────────────────────────────────────────────────

export async function generateGpmPrompts(
  input: GpmPromptBuilderInput,
  env: GpmPromptBuilderEnvLike
): Promise<GpmGeneratedQuery[]> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for GPM prompt generation.');

  const model = env.GPM_PROMPT_BUILDER_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildGpmQueryPrompt(input);

  structuredLog('gpm_prompt_generation_started', {
    topic: input.topic,
    location: input.location,
    prompt_count: input.promptCount,
    model,
  });

  const rawResponse = await callClaudeMessages({ apiKey, model, prompt });
  const queries = parseGpmQueryResponse(rawResponse);

  structuredLog('gpm_prompt_generation_completed', {
    topic: input.topic,
    location: input.location,
    generated_count: queries.length,
    model,
  });

  return queries;
}

export async function generateAndSeedGpmQuerySet(args: {
  readonly supabase: any;
  readonly topic: string;
  readonly location: string;
  readonly brandName?: string | null;
  readonly promptCount: number;
  readonly env: GpmPromptBuilderEnvLike;
}): Promise<{ querySetId: string; queryCount: number; querySetName: string }> {
  const queries = await generateGpmPrompts(
    {
      topic: args.topic,
      location: args.location,
      brandName: args.brandName,
      promptCount: args.promptCount,
    },
    args.env
  );

  const querySetName = `GPM: ${args.topic} — ${args.location}`;
  const querySetVersion = new Date().toISOString().slice(0, 10);

  const result = await seedBenchmarkQuerySet(args.supabase, {
    name: querySetName,
    version: querySetVersion,
    description: `Auto-generated GEO Performance Monitoring prompt set for ${args.topic} in ${args.location}.`,
    status: 'active',
    metadata: {
      gpm_generated: true,
      topic: args.topic,
      location: args.location,
      brand_name: args.brandName ?? null,
    },
    queries: queries.map((q) => ({
      queryKey: q.queryKey,
      queryText: q.queryText,
      intentType: q.intentType,
      topic: args.topic,
      weight: 1,
      metadata: { category: q.category },
    })),
  });

  return {
    querySetId: result.querySetId,
    queryCount: result.queryCount,
    querySetName,
  };
}
