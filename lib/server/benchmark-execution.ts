import type { BenchmarkQueryRow } from './benchmark-repository';
import {
  buildBenchmarkPrompt,
  type BenchmarkGroundingContext,
  type BenchmarkRunMode,
} from './benchmark-grounding';

export type BenchmarkExecutionStatus =
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'not_implemented';

export type BenchmarkExecutionResult = {
  readonly status: BenchmarkExecutionStatus;
  readonly responseText: string | null;
  readonly responseMetadata: Record<string, unknown>;
  readonly errorMessage: string | null;
  readonly executedAt: string | null;
};

export type BenchmarkExecutionContext = {
  readonly domainId: string;
  readonly canonicalDomain: string;
  readonly siteUrl: string | null;
  readonly modelId: string;
  readonly auditorModelId: string | null;
  readonly runGroupId: string;
  readonly runMode: BenchmarkRunMode;
  readonly groundingContext: BenchmarkGroundingContext | null;
};

export interface BenchmarkExecutionAdapter {
  executeQuery(
    query: BenchmarkQueryRow,
    context: BenchmarkExecutionContext
  ): Promise<BenchmarkExecutionResult>;
}

export type BenchmarkExecutionProvider = 'stub' | 'gemini';

export type BenchmarkExecutionEnvLike = {
  readonly BENCHMARK_EXECUTION_PROVIDER?: string;
  readonly BENCHMARK_EXECUTION_API_KEY?: string;
  readonly BENCHMARK_EXECUTION_MODEL?: string;
  readonly BENCHMARK_EXECUTION_ENDPOINT?: string;
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
};

export type BenchmarkExecutionConfig = {
  readonly provider: BenchmarkExecutionProvider;
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint: string;
};

const GEMINI_TRANSIENT_STATUSES = new Set([429, 503]);
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAYS_MS = [400, 1200];

export class StubBenchmarkExecutionAdapter implements BenchmarkExecutionAdapter {
  async executeQuery(
    query: BenchmarkQueryRow,
    context: BenchmarkExecutionContext
  ): Promise<BenchmarkExecutionResult> {
    return {
      status: 'not_implemented',
      responseText: null,
      responseMetadata: {
        mode: 'stub',
        query_key: query.query_key,
        model_id: context.modelId,
        auditor_model_id: context.auditorModelId,
        run_mode: context.runMode,
      },
      errorMessage: 'benchmark_execution_adapter_not_implemented',
      executedAt: null,
    };
  }
}

type FetchLike = typeof fetch;

async function readResponseTextSafely(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function normalizeProvider(raw: string | undefined): BenchmarkExecutionProvider {
  const value = raw?.trim().toLowerCase();
  if (value === 'gemini' || value === 'google-gemini') {
    return 'gemini';
  }
  return 'stub';
}

export function resolveBenchmarkExecutionConfig(
  env: BenchmarkExecutionEnvLike | undefined
): BenchmarkExecutionConfig {
  return {
    provider: normalizeProvider(env?.BENCHMARK_EXECUTION_PROVIDER),
    apiKey: env?.BENCHMARK_EXECUTION_API_KEY?.trim() || env?.GEMINI_API_KEY?.trim() || '',
    model: env?.BENCHMARK_EXECUTION_MODEL?.trim() || env?.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    endpoint:
      env?.BENCHMARK_EXECUTION_ENDPOINT?.trim() ||
      env?.GEMINI_ENDPOINT?.trim() ||
      'https://generativelanguage.googleapis.com/v1beta/models',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiBenchmarkExecutionAdapter implements BenchmarkExecutionAdapter {
  constructor(
    private readonly config: BenchmarkExecutionConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async executeQuery(
    query: BenchmarkQueryRow,
    context: BenchmarkExecutionContext
  ): Promise<BenchmarkExecutionResult> {
    const executedAt = new Date().toISOString();

    if (context.modelId !== this.config.model) {
      return {
        status: 'skipped',
        responseText: null,
        responseMetadata: {
          provider: 'gemini',
          configured_model: this.config.model,
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
        },
        errorMessage: 'benchmark_model_lane_not_enabled',
        executedAt,
      };
    }

    if (!this.config.apiKey) {
      return {
        status: 'failed',
        responseText: null,
        responseMetadata: {
          provider: 'gemini',
          configured_model: this.config.model,
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
        },
        errorMessage: 'benchmark_gemini_api_key_missing',
        executedAt,
      };
    }

    const base = this.config.endpoint.replace(/\/$/, '');
    const url = `${base}/${this.config.model}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;
    let promptText: string;
    try {
      promptText = buildBenchmarkPrompt({
        queryText: query.query_text,
        canonicalDomain: context.canonicalDomain,
        siteUrl: context.siteUrl,
        runMode: context.runMode,
        groundingContext: context.groundingContext,
      });
    } catch (error) {
      return {
        status: 'failed',
        responseText: null,
        responseMetadata: {
          provider: 'gemini',
          configured_model: this.config.model,
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
        },
        errorMessage: error instanceof Error ? error.message : 'benchmark_prompt_build_failed',
        executedAt,
      };
    }

    const body = {
      contents: [
        {
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
      },
    };

    for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25_000),
        });

        if (!response.ok) {
          const responseBody = await readResponseTextSafely(response);
          const retryable = GEMINI_TRANSIENT_STATUSES.has(response.status);
          const hasRetry = attempt < GEMINI_MAX_ATTEMPTS;
          if (retryable && hasRetry) {
            const delayMs = GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 1200;
            await sleep(delayMs);
            continue;
          }

          return {
            status: 'failed',
            responseText: null,
            responseMetadata: {
              provider: 'gemini',
              configured_model: this.config.model,
              requested_model: context.modelId,
              query_key: query.query_key,
              run_mode: context.runMode,
              http_status: response.status,
              response_body: responseBody,
              attempts: attempt,
              retryable,
            },
            errorMessage: `benchmark_gemini_http_${String(response.status)}`,
            executedAt,
          };
        }

        const data = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
        if (!responseText) {
          return {
            status: 'failed',
            responseText: null,
            responseMetadata: {
              provider: 'gemini',
              configured_model: this.config.model,
              requested_model: context.modelId,
              query_key: query.query_key,
              run_mode: context.runMode,
              attempts: attempt,
            },
            errorMessage: 'benchmark_gemini_empty_response',
            executedAt,
          };
        }

        return {
          status: 'completed',
          responseText,
          responseMetadata: {
            provider: 'gemini',
            configured_model: this.config.model,
            requested_model: context.modelId,
            query_key: query.query_key,
            run_mode: context.runMode,
            attempts: attempt,
          },
          errorMessage: null,
          executedAt,
        };
      } catch (error) {
        const hasRetry = attempt < GEMINI_MAX_ATTEMPTS;
        if (hasRetry) {
          const delayMs = GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 1200;
          await sleep(delayMs);
          continue;
        }

        return {
          status: 'failed',
          responseText: null,
          responseMetadata: {
            provider: 'gemini',
            configured_model: this.config.model,
            requested_model: context.modelId,
            query_key: query.query_key,
            run_mode: context.runMode,
            attempts: attempt,
          },
          errorMessage: error instanceof Error ? error.message : 'benchmark_gemini_error',
          executedAt,
        };
      }
    }

    return {
      status: 'failed',
      responseText: null,
      responseMetadata: {
        provider: 'gemini',
        configured_model: this.config.model,
        requested_model: context.modelId,
        query_key: query.query_key,
        run_mode: context.runMode,
        attempts: GEMINI_MAX_ATTEMPTS,
      },
      errorMessage: 'benchmark_gemini_retry_exhausted',
      executedAt,
    };
  }
}

export function getBenchmarkExecutionAdapterMode(adapter: BenchmarkExecutionAdapter): string {
  if (adapter instanceof GeminiBenchmarkExecutionAdapter) return 'gemini';
  if (adapter instanceof StubBenchmarkExecutionAdapter) return 'stub';
  return 'custom';
}

export function createBenchmarkExecutionAdapter(
  env?: BenchmarkExecutionEnvLike,
  fetchImpl?: FetchLike
): BenchmarkExecutionAdapter {
  const config = resolveBenchmarkExecutionConfig(env);
  if (config.provider === 'gemini') {
    return new GeminiBenchmarkExecutionAdapter(config, fetchImpl);
  }
  return new StubBenchmarkExecutionAdapter();
}
