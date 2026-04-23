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

export type BenchmarkExecutionProvider = 'stub' | 'gemini' | 'openai' | 'perplexity' | 'multi';

export type BenchmarkExecutionEnvLike = {
  readonly BENCHMARK_EXECUTION_PROVIDER?: string;
  readonly BENCHMARK_EXECUTION_API_KEY?: string;
  readonly BENCHMARK_EXECUTION_MODEL?: string;
  readonly BENCHMARK_EXECUTION_ENABLED_MODELS?: string;
  readonly BENCHMARK_EXECUTION_ENDPOINT?: string;
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly OPENAI_ENDPOINT?: string;
  readonly PERPLEXITY_API_KEY?: string;
  readonly PERPLEXITY_MODEL?: string;
  readonly PERPLEXITY_ENDPOINT?: string;
};

export type BenchmarkExecutionConfig = {
  readonly provider: BenchmarkExecutionProvider;
  readonly apiKey: string;
  readonly model: string;
  readonly enabledModels: readonly string[];
  readonly endpoint: string;
};

// Gemini retry policy
const GEMINI_TRANSIENT_STATUSES = new Set([429, 503]);
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAYS_MS = [400, 1200];

// OpenAI-compatible retry policy (OpenAI + Perplexity)
// 529 = Perplexity-specific overload code
const OPENAI_TRANSIENT_STATUSES = new Set([429, 503, 529]);
const OPENAI_MAX_ATTEMPTS = 3;
const OPENAI_RETRY_DELAYS_MS = [400, 1200];

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const PERPLEXITY_DEFAULT_MODEL = 'llama-3.1-sonar-small-128k-online';
const PERPLEXITY_DEFAULT_ENDPOINT = 'https://api.perplexity.ai/chat/completions';

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
  if (value === 'gemini' || value === 'google-gemini') return 'gemini';
  if (value === 'openai' || value === 'open-ai') return 'openai';
  if (value === 'perplexity') return 'perplexity';
  if (value === 'multi' || value === 'multi-provider') return 'multi';
  return 'stub';
}

function parseEnabledModels(
  raw: string | undefined,
  fallbackModel: string
): readonly string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const ordered = parsed.length > 0 ? parsed : [fallbackModel];
  return Array.from(new Set(ordered));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves the Gemini-specific config base (no provider tag — caller sets it).
function resolveGeminiConfigBase(
  env: BenchmarkExecutionEnvLike | undefined
): Omit<BenchmarkExecutionConfig, 'provider'> {
  const fallbackModel =
    env?.BENCHMARK_EXECUTION_MODEL?.trim() || env?.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
  const enabledModels = parseEnabledModels(env?.BENCHMARK_EXECUTION_ENABLED_MODELS, fallbackModel);
  return {
    apiKey: env?.BENCHMARK_EXECUTION_API_KEY?.trim() || env?.GEMINI_API_KEY?.trim() || '',
    model: enabledModels[0] ?? fallbackModel,
    enabledModels,
    endpoint:
      env?.BENCHMARK_EXECUTION_ENDPOINT?.trim() ||
      env?.GEMINI_ENDPOINT?.trim() ||
      'https://generativelanguage.googleapis.com/v1beta/models',
  };
}

function resolveOpenAiConfig(
  env: BenchmarkExecutionEnvLike | undefined
): BenchmarkExecutionConfig {
  const model = env?.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL;
  return {
    provider: 'openai',
    apiKey: env?.OPENAI_API_KEY?.trim() || '',
    model,
    enabledModels: [model],
    endpoint: env?.OPENAI_ENDPOINT?.trim() || OPENAI_DEFAULT_ENDPOINT,
  };
}

function resolvePerplexityConfig(
  env: BenchmarkExecutionEnvLike | undefined
): BenchmarkExecutionConfig {
  const model = env?.PERPLEXITY_MODEL?.trim() || PERPLEXITY_DEFAULT_MODEL;
  return {
    provider: 'perplexity',
    apiKey: env?.PERPLEXITY_API_KEY?.trim() || '',
    model,
    enabledModels: [model],
    endpoint: env?.PERPLEXITY_ENDPOINT?.trim() || PERPLEXITY_DEFAULT_ENDPOINT,
  };
}

export function resolveBenchmarkExecutionConfig(
  env: BenchmarkExecutionEnvLike | undefined
): BenchmarkExecutionConfig {
  const provider = normalizeProvider(env?.BENCHMARK_EXECUTION_PROVIDER);
  if (provider === 'openai') return resolveOpenAiConfig(env);
  if (provider === 'perplexity') return resolvePerplexityConfig(env);
  if (provider === 'multi') {
    // Sentinel — createBenchmarkExecutionAdapter resolves per-provider configs separately.
    return { provider: 'multi', apiKey: '', model: '', enabledModels: [], endpoint: '' };
  }
  // 'gemini' or 'stub' — same base config, tagged with the resolved provider.
  return { ...resolveGeminiConfigBase(env), provider };
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
    const enabledModels = new Set(this.config.enabledModels);

    if (!enabledModels.has(context.modelId)) {
      return {
        status: 'skipped',
        responseText: null,
        responseMetadata: {
          provider: 'gemini',
          configured_model: this.config.model,
          enabled_models: this.config.enabledModels,
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
          enabled_models: this.config.enabledModels,
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
        },
        errorMessage: 'benchmark_gemini_api_key_missing',
        executedAt,
      };
    }

    const base = this.config.endpoint.replace(/\/$/, '');
    const requestedModel = context.modelId;
    const url = `${base}/${requestedModel}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;
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
          enabled_models: this.config.enabledModels,
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
              enabled_models: this.config.enabledModels,
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
              enabled_models: this.config.enabledModels,
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
            enabled_models: this.config.enabledModels,
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
            enabled_models: this.config.enabledModels,
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
        enabled_models: this.config.enabledModels,
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

/**
 * Handles both OpenAI and Perplexity. Both use the Chat Completions API format —
 * Perplexity's API is OpenAI-compatible: same request shape, same response shape,
 * different endpoint and model IDs.
 */
export class OpenAiCompatibleBenchmarkExecutionAdapter implements BenchmarkExecutionAdapter {
  readonly providerTag: 'openai' | 'perplexity';

  constructor(
    providerTag: 'openai' | 'perplexity',
    private readonly config: BenchmarkExecutionConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.providerTag = providerTag;
  }

  async executeQuery(
    query: BenchmarkQueryRow,
    context: BenchmarkExecutionContext
  ): Promise<BenchmarkExecutionResult> {
    const executedAt = new Date().toISOString();
    const provider = this.providerTag;
    const enabledModels = new Set(this.config.enabledModels);

    if (!enabledModels.has(context.modelId)) {
      return {
        status: 'skipped',
        responseText: null,
        responseMetadata: {
          provider,
          configured_model: this.config.model,
          enabled_models: this.config.enabledModels,
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
          provider,
          configured_model: this.config.model,
          enabled_models: this.config.enabledModels,
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
        },
        errorMessage: `benchmark_${provider}_api_key_missing`,
        executedAt,
      };
    }

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
          provider,
          configured_model: this.config.model,
          enabled_models: this.config.enabledModels,
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
        },
        errorMessage: error instanceof Error ? error.message : 'benchmark_prompt_build_failed',
        executedAt,
      };
    }

    const body = {
      model: context.modelId,
      messages: [{ role: 'user', content: promptText }],
      max_tokens: 512,
      temperature: 0.2,
    };

    for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          const responseBody = await readResponseTextSafely(response);
          const retryable = OPENAI_TRANSIENT_STATUSES.has(response.status);
          const hasRetry = attempt < OPENAI_MAX_ATTEMPTS;
          if (retryable && hasRetry) {
            const delayMs = OPENAI_RETRY_DELAYS_MS[attempt - 1] ?? 1200;
            await sleep(delayMs);
            continue;
          }

          return {
            status: 'failed',
            responseText: null,
            responseMetadata: {
              provider,
              configured_model: this.config.model,
              enabled_models: this.config.enabledModels,
              requested_model: context.modelId,
              query_key: query.query_key,
              run_mode: context.runMode,
              http_status: response.status,
              response_body: responseBody,
              attempts: attempt,
              retryable,
            },
            errorMessage: `benchmark_${provider}_http_${String(response.status)}`,
            executedAt,
          };
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const responseText = data.choices?.[0]?.message?.content?.trim() ?? '';
        if (!responseText) {
          return {
            status: 'failed',
            responseText: null,
            responseMetadata: {
              provider,
              configured_model: this.config.model,
              enabled_models: this.config.enabledModels,
              requested_model: context.modelId,
              query_key: query.query_key,
              run_mode: context.runMode,
              attempts: attempt,
            },
            errorMessage: `benchmark_${provider}_empty_response`,
            executedAt,
          };
        }

        return {
          status: 'completed',
          responseText,
          responseMetadata: {
            provider,
            configured_model: this.config.model,
            enabled_models: this.config.enabledModels,
            requested_model: context.modelId,
            query_key: query.query_key,
            run_mode: context.runMode,
            attempts: attempt,
          },
          errorMessage: null,
          executedAt,
        };
      } catch (error) {
        const hasRetry = attempt < OPENAI_MAX_ATTEMPTS;
        if (hasRetry) {
          const delayMs = OPENAI_RETRY_DELAYS_MS[attempt - 1] ?? 1200;
          await sleep(delayMs);
          continue;
        }

        return {
          status: 'failed',
          responseText: null,
          responseMetadata: {
            provider,
            configured_model: this.config.model,
            enabled_models: this.config.enabledModels,
            requested_model: context.modelId,
            query_key: query.query_key,
            run_mode: context.runMode,
            attempts: attempt,
          },
          errorMessage: error instanceof Error ? error.message : `benchmark_${provider}_error`,
          executedAt,
        };
      }
    }

    return {
      status: 'failed',
      responseText: null,
      responseMetadata: {
        provider,
        configured_model: this.config.model,
        enabled_models: this.config.enabledModels,
        requested_model: context.modelId,
        query_key: query.query_key,
        run_mode: context.runMode,
        attempts: OPENAI_MAX_ATTEMPTS,
      },
      errorMessage: `benchmark_${provider}_retry_exhausted`,
      executedAt,
    };
  }
}

type AdapterRoute = {
  readonly enabledModelIds: readonly string[];
  readonly adapter: BenchmarkExecutionAdapter;
};

/**
 * Routes queries to the correct provider adapter by exact model ID.
 * Used for GPM multi-provider runs (ChatGPT + Gemini + Perplexity in one pass).
 * First registered route wins for duplicate model IDs.
 */
export class MultiProviderBenchmarkExecutionAdapter implements BenchmarkExecutionAdapter {
  private readonly routingMap: ReadonlyMap<string, BenchmarkExecutionAdapter>;

  constructor(routes: readonly AdapterRoute[]) {
    const map = new Map<string, BenchmarkExecutionAdapter>();
    for (const { enabledModelIds, adapter } of routes) {
      for (const modelId of enabledModelIds) {
        if (!map.has(modelId)) map.set(modelId, adapter);
      }
    }
    this.routingMap = map;
  }

  async executeQuery(
    query: BenchmarkQueryRow,
    context: BenchmarkExecutionContext
  ): Promise<BenchmarkExecutionResult> {
    const adapter = this.routingMap.get(context.modelId);
    if (!adapter) {
      return {
        status: 'skipped',
        responseText: null,
        responseMetadata: {
          provider: 'multi',
          requested_model: context.modelId,
          query_key: query.query_key,
          run_mode: context.runMode,
          registered_models: Array.from(this.routingMap.keys()),
        },
        errorMessage: 'benchmark_multi_provider_model_not_registered',
        executedAt: new Date().toISOString(),
      };
    }
    return adapter.executeQuery(query, context);
  }
}

export function getBenchmarkExecutionAdapterMode(adapter: BenchmarkExecutionAdapter): string {
  if (adapter instanceof GeminiBenchmarkExecutionAdapter) return 'gemini';
  if (adapter instanceof OpenAiCompatibleBenchmarkExecutionAdapter) return adapter.providerTag;
  if (adapter instanceof MultiProviderBenchmarkExecutionAdapter) return 'multi';
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

  if (config.provider === 'openai') {
    return new OpenAiCompatibleBenchmarkExecutionAdapter('openai', config, fetchImpl);
  }

  if (config.provider === 'perplexity') {
    return new OpenAiCompatibleBenchmarkExecutionAdapter('perplexity', config, fetchImpl);
  }

  if (config.provider === 'multi') {
    const geminiCfg: BenchmarkExecutionConfig = { ...resolveGeminiConfigBase(env), provider: 'gemini' };
    const openaiCfg = resolveOpenAiConfig(env);
    const perplexityCfg = resolvePerplexityConfig(env);

    const routes: AdapterRoute[] = [];

    if (geminiCfg.apiKey && geminiCfg.enabledModels.length > 0) {
      routes.push({
        enabledModelIds: geminiCfg.enabledModels,
        adapter: new GeminiBenchmarkExecutionAdapter(geminiCfg, fetchImpl),
      });
    }
    if (openaiCfg.apiKey && openaiCfg.enabledModels.length > 0) {
      routes.push({
        enabledModelIds: openaiCfg.enabledModels,
        adapter: new OpenAiCompatibleBenchmarkExecutionAdapter('openai', openaiCfg, fetchImpl),
      });
    }
    if (perplexityCfg.apiKey && perplexityCfg.enabledModels.length > 0) {
      routes.push({
        enabledModelIds: perplexityCfg.enabledModels,
        adapter: new OpenAiCompatibleBenchmarkExecutionAdapter('perplexity', perplexityCfg, fetchImpl),
      });
    }

    return new MultiProviderBenchmarkExecutionAdapter(routes);
  }

  return new StubBenchmarkExecutionAdapter();
}
