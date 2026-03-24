/**
 * Gemini REST implementation of LLMProvider (SOLID — engine depends on interface only).
 */
import type { LLMProvider, LLMResult } from '../lib/interfaces/providers';

interface GeminiEnv {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_ENDPOINT: string;
}

function safeParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export class GeminiProvider implements LLMProvider {
  constructor(private readonly env: GeminiEnv) {}

  async analyze(prompt: string, context: string): Promise<LLMResult> {
    const key = this.env.GEMINI_API_KEY;
    if (!key) {
      return { passed: false, reasoning: 'missing_api_key', confidence: 'low' };
    }

    const model = this.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const base = this.env.GEMINI_ENDPOINT.replace(/\/$/, '');
    const url = `${base}/${model}:generateContent?key=${encodeURIComponent(key)}`;

    const body = {
      contents: [
        {
          parts: [
            {
              text: `${prompt}\n\n--- PAGE CONTEXT (truncated) ---\n${context}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });

      if (!res.ok) {
        return { passed: false, reasoning: `http_${String(res.status)}`, confidence: 'low' };
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const obj = safeParseJsonObject(text);
      if (!obj) {
        return { passed: false, reasoning: 'unparseable_model_output', confidence: 'low' };
      }

      const passed = Boolean(obj['passed']);
      const reasoning =
        typeof obj['reasoning'] === 'string' ? obj['reasoning'] : 'no_reasoning';
      const c = obj['confidence'];
      const confidence =
        c === 'high' || c === 'medium' || c === 'low' ? c : ('low' as const);

      return { passed, reasoning, confidence };
    } catch {
      return { passed: false, reasoning: 'error', confidence: 'low' };
    }
  }
}
