import { buildLayerOneReportRewritePrompt } from './layer-one-report-rewrite-prompt';

export type LayerOneInternalRewriteResult =
  | {
      readonly status: 'completed';
      readonly rewrittenMarkdown: string;
      readonly modelId: string;
      readonly executedAt: string;
      readonly responseMetadata: Record<string, unknown>;
    }
  | {
      readonly status: 'skipped' | 'failed';
      readonly rewrittenMarkdown: null;
      readonly modelId: string;
      readonly executedAt: string;
      readonly responseMetadata: Record<string, unknown>;
      readonly errorMessage: string;
    };

export type LayerOneInternalRewriteEnv = {
  readonly enabled?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly endpoint?: string;
};

type FetchLike = typeof fetch;

const TRANSIENT_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];

function isEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseTextSafely(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function extractResponseText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  const text = candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return text.length > 0 ? text : null;
}

function normalizeMarkdown(text: string): string {
  return text.replace(/^\s*```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

export async function rewriteLayerOneReportInternal(
  reportMarkdown: string,
  env: LayerOneInternalRewriteEnv,
  fetchImpl: FetchLike = fetch
): Promise<LayerOneInternalRewriteResult> {
  const modelId = env.model?.trim() || 'gemini-2.0-flash';
  const executedAt = new Date().toISOString();

  if (!isEnabled(env.enabled)) {
    return {
      status: 'skipped',
      rewrittenMarkdown: null,
      modelId,
      executedAt,
      responseMetadata: { enabled: false },
      errorMessage: 'layer_one_internal_rewrite_disabled',
    };
  }

  const apiKey = env.apiKey?.trim() || '';
  if (!apiKey) {
    return {
      status: 'failed',
      rewrittenMarkdown: null,
      modelId,
      executedAt,
      responseMetadata: { enabled: true },
      errorMessage: 'layer_one_internal_rewrite_api_key_missing',
    };
  }

  const endpoint =
    env.endpoint?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models';
  const base = endpoint.replace(/\/$/, '');
  const url = `${base}/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = buildLayerOneReportRewritePrompt({ reportMarkdown });

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${prompt}\nRewrite the report now. Return only the rewritten report.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const responseBody = await readResponseTextSafely(response);
        const retryable = TRANSIENT_STATUSES.has(response.status);
        const hasRetry = attempt < MAX_ATTEMPTS;
        if (retryable && hasRetry) {
          const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 1200;
          await sleep(delayMs);
          continue;
        }

        return {
          status: 'failed',
          rewrittenMarkdown: null,
          modelId,
          executedAt,
          responseMetadata: {
            http_status: response.status,
            response_body: responseBody,
            attempts: attempt,
            retryable,
          },
          errorMessage: `layer_one_internal_rewrite_http_${String(response.status)}`,
        };
      }

      const data = await response.json();
      const responseText = extractResponseText(data);
      if (!responseText) {
        return {
          status: 'failed',
          rewrittenMarkdown: null,
          modelId,
          executedAt,
          responseMetadata: { attempts: attempt },
          errorMessage: 'layer_one_internal_rewrite_empty_response',
        };
      }

      const rewrittenMarkdown = normalizeMarkdown(responseText);
      if (!rewrittenMarkdown) {
        return {
          status: 'failed',
          rewrittenMarkdown: null,
          modelId,
          executedAt,
          responseMetadata: { attempts: attempt },
          errorMessage: 'layer_one_internal_rewrite_empty_markdown',
        };
      }

      return {
        status: 'completed',
        rewrittenMarkdown,
        modelId,
        executedAt,
        responseMetadata: { attempts: attempt },
      };
    } catch (error) {
      const hasRetry = attempt < MAX_ATTEMPTS;
      if (hasRetry) {
        const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 1200;
        await sleep(delayMs);
        continue;
      }

      return {
        status: 'failed',
        rewrittenMarkdown: null,
        modelId,
        executedAt,
        responseMetadata: { attempts: attempt },
        errorMessage:
          error instanceof Error ? error.message : 'layer_one_internal_rewrite_error',
      };
    }
  }

  return {
    status: 'failed',
    rewrittenMarkdown: null,
    modelId,
    executedAt,
    responseMetadata: { attempts: MAX_ATTEMPTS },
    errorMessage: 'layer_one_internal_rewrite_retry_exhausted',
  };
}
