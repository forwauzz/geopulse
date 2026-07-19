/**
 * Cloudflare Workers AI — the free, open-source "brain".
 *
 * Runs open models (Llama / Qwen / Mistral …) on Cloudflare's free daily allocation via a native
 * `AI` binding — no API key, no external provider, same Worker. Used for the deep-audit report
 * rewrite and the user-facing agents.
 */

/** Minimal shape of the Workers AI binding (avoids depending on generated CF types). */
export type WorkersAiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

/** Solid general-purpose default; override per call site via env. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Pull the assistant text out of the various shapes Workers AI returns. */
export function extractWorkersAiText(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (typeof r['response'] === 'string') return (r['response'] as string).trim() || null;
  if (typeof r['result'] === 'string') return (r['result'] as string).trim() || null;
  // Chat-completions-ish fallback.
  const choices = r['choices'];
  if (Array.isArray(choices)) {
    const msg = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
    if (typeof msg === 'string') return msg.trim() || null;
  }
  return null;
}

export type WorkersAiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string; model: string };

/**
 * Single-turn prompt against Workers AI. Never throws — returns a typed failure so callers can
 * fall back to another provider.
 */
export async function runWorkersAiPrompt(args: {
  ai: WorkersAiBinding | undefined;
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<WorkersAiResult> {
  const model = args.model?.trim() || DEFAULT_WORKERS_AI_MODEL;
  if (!args.ai || typeof args.ai.run !== 'function') {
    return { ok: false, reason: 'workers_ai_binding_missing', model };
  }
  const messages = [
    ...(args.system ? [{ role: 'system', content: args.system }] : []),
    { role: 'user', content: args.prompt },
  ];
  try {
    const raw = await args.ai.run(model, {
      messages,
      max_tokens: args.maxTokens ?? 4096,
      temperature: args.temperature ?? 0.2,
    });
    const text = extractWorkersAiText(raw);
    if (!text) return { ok: false, reason: 'workers_ai_empty_response', model };
    return { ok: true, text, model };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'workers_ai_error',
      model,
    };
  }
}
