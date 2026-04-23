import { describe, expect, it, vi } from 'vitest';
import {
  createBenchmarkExecutionAdapter,
  GeminiBenchmarkExecutionAdapter,
  MultiProviderBenchmarkExecutionAdapter,
  OpenAiCompatibleBenchmarkExecutionAdapter,
  resolveBenchmarkExecutionConfig,
  StubBenchmarkExecutionAdapter,
} from './benchmark-execution';

const sampleQuery = {
  id: 'query-1',
  query_set_id: 'set-1',
  query_key: 'brand-overview',
  query_text: 'What is Example?',
  intent_type: 'direct',
  topic: 'brand',
  weight: 1,
  metadata: {},
  created_at: '2026-03-26T00:00:00.000Z',
} as const;

const sampleContext = {
  domainId: 'domain-1',
  canonicalDomain: 'example.com',
  siteUrl: 'https://example.com/',
  modelId: 'gemini-2.0-flash',
  auditorModelId: null,
  runGroupId: 'run-group-1',
  runMode: 'ungrounded_inference',
  groundingContext: null,
} as const;

// ─── resolveBenchmarkExecutionConfig ────────────────────────────────────────

describe('resolveBenchmarkExecutionConfig', () => {
  it('defaults to the stub provider', () => {
    expect(resolveBenchmarkExecutionConfig(undefined)).toEqual({
      provider: 'stub',
      apiKey: '',
      model: 'gemini-2.0-flash',
      enabledModels: ['gemini-2.0-flash'],
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    });
  });

  it('uses benchmark-specific gemini config when provided', () => {
    expect(
      resolveBenchmarkExecutionConfig({
        BENCHMARK_EXECUTION_PROVIDER: 'gemini',
        BENCHMARK_EXECUTION_API_KEY: 'benchmark-key',
        BENCHMARK_EXECUTION_MODEL: 'gemini-2.5-flash',
        BENCHMARK_EXECUTION_ENDPOINT: 'https://example.test/models',
      })
    ).toEqual({
      provider: 'gemini',
      apiKey: 'benchmark-key',
      model: 'gemini-2.5-flash',
      enabledModels: ['gemini-2.5-flash'],
      endpoint: 'https://example.test/models',
    });
  });

  it('uses a comma-separated model allowlist when provided', () => {
    expect(
      resolveBenchmarkExecutionConfig({
        BENCHMARK_EXECUTION_PROVIDER: 'gemini',
        BENCHMARK_EXECUTION_MODEL: 'gemini-2.5-flash-lite',
        BENCHMARK_EXECUTION_ENABLED_MODELS: 'gemini-2.5-flash-lite, gemini-2.5-flash',
      })
    ).toEqual({
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.5-flash-lite',
      enabledModels: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    });
  });

  it('resolves openai config with defaults', () => {
    const config = resolveBenchmarkExecutionConfig({
      BENCHMARK_EXECUTION_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.endpoint).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('resolves openai config with custom model and endpoint', () => {
    const config = resolveBenchmarkExecutionConfig({
      BENCHMARK_EXECUTION_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-4o',
      OPENAI_ENDPOINT: 'https://custom.openai.test/v1/chat/completions',
    });
    expect(config.model).toBe('gpt-4o');
    expect(config.enabledModels).toEqual(['gpt-4o']);
    expect(config.endpoint).toBe('https://custom.openai.test/v1/chat/completions');
  });

  it('resolves perplexity config with defaults', () => {
    const config = resolveBenchmarkExecutionConfig({
      BENCHMARK_EXECUTION_PROVIDER: 'perplexity',
      PERPLEXITY_API_KEY: 'pplx-test',
    });
    expect(config.provider).toBe('perplexity');
    expect(config.apiKey).toBe('pplx-test');
    expect(config.model).toBe('llama-3.1-sonar-small-128k-online');
    expect(config.endpoint).toBe('https://api.perplexity.ai/chat/completions');
  });

  it('resolves perplexity config with custom model', () => {
    const config = resolveBenchmarkExecutionConfig({
      BENCHMARK_EXECUTION_PROVIDER: 'perplexity',
      PERPLEXITY_API_KEY: 'pplx-test',
      PERPLEXITY_MODEL: 'llama-3.1-sonar-large-128k-online',
    });
    expect(config.model).toBe('llama-3.1-sonar-large-128k-online');
  });

  it('returns multi sentinel config for multi provider', () => {
    const config = resolveBenchmarkExecutionConfig({
      BENCHMARK_EXECUTION_PROVIDER: 'multi',
    });
    expect(config.provider).toBe('multi');
    expect(config.apiKey).toBe('');
    expect(config.enabledModels).toEqual([]);
  });
});

// ─── StubBenchmarkExecutionAdapter ──────────────────────────────────────────

describe('StubBenchmarkExecutionAdapter', () => {
  it('returns an explicit not-implemented execution result', async () => {
    const adapter = new StubBenchmarkExecutionAdapter();
    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('not_implemented');
    expect(result.errorMessage).toBe('benchmark_execution_adapter_not_implemented');
    expect(result.responseMetadata['query_key']).toBe('brand-overview');
    expect(result.responseMetadata['run_mode']).toBe('ungrounded_inference');
  });
});

// ─── GeminiBenchmarkExecutionAdapter ────────────────────────────────────────

describe('GeminiBenchmarkExecutionAdapter', () => {
  it('skips execution when the requested lane is not enabled', async () => {
    const adapter = new GeminiBenchmarkExecutionAdapter({
      provider: 'gemini',
      apiKey: 'benchmark-key',
      model: 'gemini-2.5-flash',
      enabledModels: ['gemini-2.5-flash'],
      endpoint: 'https://example.test/models',
    });

    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toBe('benchmark_model_lane_not_enabled');
  });

  it('fails clearly when gemini is selected without an api key', async () => {
    const adapter = new GeminiBenchmarkExecutionAdapter({
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.0-flash',
      enabledModels: ['gemini-2.0-flash'],
      endpoint: 'https://example.test/models',
    });

    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_gemini_api_key_missing');
  });

  it('returns completed text from the gemini response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Example is a SaaS platform for AI visibility measurement.' }],
            },
          },
        ],
      }),
    });

    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toContain('AI visibility measurement');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('executes an additional enabled model lane beyond the default model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Example appears in comparison responses.' }],
            },
          },
        ],
      }),
    });

    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.5-flash-lite',
        enabledModels: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, {
      ...sampleContext,
      modelId: 'gemini-2.5-flash',
    });

    expect(result.status).toBe('completed');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/gemini-2.5-flash:generateContent');
  });

  it('fails clearly when grounded mode is requested without grounding context', async () => {
    const fetchMock = vi.fn();
    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, {
      ...sampleContext,
      runMode: 'grounded_site',
      groundingContext: null,
    });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_grounded_context_missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds a grounded prompt when site evidence is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Example is a healthcare technology consulting firm.' }],
            },
          },
        ],
      }),
    });

    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    await adapter.executeQuery(sampleQuery, {
      ...sampleContext,
      runMode: 'grounded_site',
      groundingContext: {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-home',
            sourceLabel: 'homepage',
            excerpt: 'Example is a healthcare technology consulting firm.',
            pageUrl: null,
            pageType: null,
            evidenceLabel: null,
            pageTitle: null,
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.contents[0]?.parts[0]?.text).toContain(
      'You are answering a question about a company using only the evidence excerpts below, drawn from example.com. Do not use outside knowledge.'
    );
    expect(body.contents[0]?.parts[0]?.text).toContain(
      'Evidence 1 (homepage): Example is a healthcare technology consulting firm.'
    );
    expect(body.contents[0]?.parts[0]?.text).toContain(
      'Answer in 3 to 5 sentences in plain text. Mention example.com naturally at least once when the evidence supports the target company. If the evidence is ambiguous or incomplete, flag that briefly.'
    );
  });

  it('stores the response body when gemini returns an http error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"Model not found"}}',
    });

    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_gemini_http_400');
    expect(result.responseMetadata['response_body']).toContain('Model not found');
  });

  it('retries transient 503 responses and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => '{"error":{"message":"Try again later"}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Example is a healthcare technology consulting firm.' }],
              },
            },
          ],
        }),
      });

    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toContain('healthcare technology consulting');
    expect(result.responseMetadata['attempts']).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries transient 503 responses and then fails after exhausting attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"error":{"message":"High demand"}}',
    });

    const adapter = new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'benchmark-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_gemini_http_503');
    expect(result.responseMetadata['attempts']).toBe(3);
    expect(result.responseMetadata['retryable']).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ─── OpenAiCompatibleBenchmarkExecutionAdapter ──────────────────────────────

const openaiConfig = {
  provider: 'openai' as const,
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  enabledModels: ['gpt-4o-mini'],
  endpoint: 'https://api.openai.com/v1/chat/completions',
};

const perplexityConfig = {
  provider: 'perplexity' as const,
  apiKey: 'pplx-test',
  model: 'llama-3.1-sonar-small-128k-online',
  enabledModels: ['llama-3.1-sonar-small-128k-online'],
  endpoint: 'https://api.perplexity.ai/chat/completions',
};

const openaiContext = { ...sampleContext, modelId: 'gpt-4o-mini' } as const;
const perplexityContext = {
  ...sampleContext,
  modelId: 'llama-3.1-sonar-small-128k-online',
} as const;

describe('OpenAiCompatibleBenchmarkExecutionAdapter — openai', () => {
  it('exposes the provider tag', () => {
    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter('openai', openaiConfig);
    expect(adapter.providerTag).toBe('openai');
  });

  it('skips execution when the requested model is not in the enabled list', async () => {
    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter('openai', openaiConfig);
    const result = await adapter.executeQuery(sampleQuery, sampleContext); // gemini model
    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toBe('benchmark_model_lane_not_enabled');
    expect(result.responseMetadata['provider']).toBe('openai');
  });

  it('fails clearly when openai is selected without an api key', async () => {
    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter('openai', {
      ...openaiConfig,
      apiKey: '',
    });
    const result = await adapter.executeQuery(sampleQuery, openaiContext);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_openai_api_key_missing');
  });

  it('returns completed text from an openai response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Example is a GEO visibility platform.' } }],
      }),
    });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'openai',
      openaiConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, openaiContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toContain('GEO visibility platform');
    expect(result.responseMetadata['provider']).toBe('openai');
    expect(result.responseMetadata['requested_model']).toBe('gpt-4o-mini');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the correct chat completions request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Some response.' } }],
      }),
    });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'openai',
      openaiConfig,
      fetchMock as unknown as typeof fetch
    );

    await adapter.executeQuery(sampleQuery, openaiContext);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');

    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0]?.role).toBe('user');
    expect(typeof body.messages[0]?.content).toBe('string');
  });

  it('retries on 429 rate limit and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{"error":"rate_limit_exceeded"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Example is a GEO platform.' } }],
        }),
      });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'openai',
      openaiConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, openaiContext);

    expect(result.status).toBe('completed');
    expect(result.responseMetadata['attempts']).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails after exhausting retries on persistent 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":"rate_limit_exceeded"}',
    });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'openai',
      openaiConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, openaiContext);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_openai_http_429');
    expect(result.responseMetadata['attempts']).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails with openai-prefixed error message on http error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid API key"}}',
    });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'openai',
      openaiConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, openaiContext);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_openai_http_401');
    expect(result.responseMetadata['response_body']).toContain('Invalid API key');
  });
});

describe('OpenAiCompatibleBenchmarkExecutionAdapter — perplexity', () => {
  it('exposes perplexity as the provider tag', () => {
    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter('perplexity', perplexityConfig);
    expect(adapter.providerTag).toBe('perplexity');
  });

  it('fails with perplexity-prefixed error when api key is missing', async () => {
    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter('perplexity', {
      ...perplexityConfig,
      apiKey: '',
    });
    const result = await adapter.executeQuery(sampleQuery, perplexityContext);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_perplexity_api_key_missing');
  });

  it('returns completed text from a perplexity response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Example provides vestibular rehabilitation services.' } }],
      }),
    });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'perplexity',
      perplexityConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, perplexityContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toContain('vestibular rehabilitation');
    expect(result.responseMetadata['provider']).toBe('perplexity');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.perplexity.ai/chat/completions');
  });

  it('retries on 529 perplexity overload and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 529,
        text: async () => '{"error":"overloaded"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Example is a clinic.' } }],
        }),
      });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'perplexity',
      perplexityConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, perplexityContext);

    expect(result.status).toBe('completed');
    expect(result.responseMetadata['attempts']).toBe(2);
  });

  it('fails with perplexity-prefixed error after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 529,
      text: async () => '{"error":"overloaded"}',
    });

    const adapter = new OpenAiCompatibleBenchmarkExecutionAdapter(
      'perplexity',
      perplexityConfig,
      fetchMock as unknown as typeof fetch
    );

    const result = await adapter.executeQuery(sampleQuery, perplexityContext);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('benchmark_perplexity_http_529');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ─── MultiProviderBenchmarkExecutionAdapter ──────────────────────────────────

describe('MultiProviderBenchmarkExecutionAdapter', () => {
  const makeGeminiAdapter = (fetchMock: ReturnType<typeof vi.fn>) =>
    new GeminiBenchmarkExecutionAdapter(
      {
        provider: 'gemini',
        apiKey: 'gemini-key',
        model: 'gemini-2.0-flash',
        enabledModels: ['gemini-2.0-flash'],
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

  const makeOpenAiAdapter = (fetchMock: ReturnType<typeof vi.fn>) =>
    new OpenAiCompatibleBenchmarkExecutionAdapter(
      'openai',
      openaiConfig,
      fetchMock as unknown as typeof fetch
    );

  const makePerplexityAdapter = (fetchMock: ReturnType<typeof vi.fn>) =>
    new OpenAiCompatibleBenchmarkExecutionAdapter(
      'perplexity',
      perplexityConfig,
      fetchMock as unknown as typeof fetch
    );

  it('routes a gemini model ID to the gemini adapter', async () => {
    const geminiFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini response.' }] } }],
      }),
    });
    const otherFetch = vi.fn();

    const multi = new MultiProviderBenchmarkExecutionAdapter([
      { enabledModelIds: ['gemini-2.0-flash'], adapter: makeGeminiAdapter(geminiFetch) },
      { enabledModelIds: ['gpt-4o-mini'], adapter: makeOpenAiAdapter(otherFetch) },
    ]);

    const result = await multi.executeQuery(sampleQuery, sampleContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toBe('Gemini response.');
    expect(geminiFetch).toHaveBeenCalledTimes(1);
    expect(otherFetch).not.toHaveBeenCalled();
  });

  it('routes an openai model ID to the openai adapter', async () => {
    const openAiFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'OpenAI response.' } }],
      }),
    });
    const otherFetch = vi.fn();

    const multi = new MultiProviderBenchmarkExecutionAdapter([
      { enabledModelIds: ['gemini-2.0-flash'], adapter: makeGeminiAdapter(otherFetch) },
      { enabledModelIds: ['gpt-4o-mini'], adapter: makeOpenAiAdapter(openAiFetch) },
      {
        enabledModelIds: ['llama-3.1-sonar-small-128k-online'],
        adapter: makePerplexityAdapter(otherFetch),
      },
    ]);

    const result = await multi.executeQuery(sampleQuery, openaiContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toBe('OpenAI response.');
    expect(openAiFetch).toHaveBeenCalledTimes(1);
    expect(otherFetch).not.toHaveBeenCalled();
  });

  it('routes a perplexity model ID to the perplexity adapter', async () => {
    const perplexityFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Perplexity response.' } }],
      }),
    });
    const otherFetch = vi.fn();

    const multi = new MultiProviderBenchmarkExecutionAdapter([
      { enabledModelIds: ['gemini-2.0-flash'], adapter: makeGeminiAdapter(otherFetch) },
      { enabledModelIds: ['gpt-4o-mini'], adapter: makeOpenAiAdapter(otherFetch) },
      {
        enabledModelIds: ['llama-3.1-sonar-small-128k-online'],
        adapter: makePerplexityAdapter(perplexityFetch),
      },
    ]);

    const result = await multi.executeQuery(sampleQuery, perplexityContext);

    expect(result.status).toBe('completed');
    expect(result.responseText).toBe('Perplexity response.');
    expect(perplexityFetch).toHaveBeenCalledTimes(1);
    expect(otherFetch).not.toHaveBeenCalled();
  });

  it('returns skipped with registered_models list for an unregistered model ID', async () => {
    const multi = new MultiProviderBenchmarkExecutionAdapter([
      { enabledModelIds: ['gpt-4o-mini'], adapter: makeOpenAiAdapter(vi.fn()) },
    ]);

    const result = await multi.executeQuery(sampleQuery, sampleContext); // gemini-2.0-flash

    expect(result.status).toBe('skipped');
    expect(result.errorMessage).toBe('benchmark_multi_provider_model_not_registered');
    expect(result.responseMetadata['registered_models']).toEqual(['gpt-4o-mini']);
  });

  it('first registered route wins for duplicate model IDs', async () => {
    const firstFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'First adapter response.' } }],
      }),
    });
    const secondFetch = vi.fn();

    const multi = new MultiProviderBenchmarkExecutionAdapter([
      { enabledModelIds: ['gpt-4o-mini'], adapter: makeOpenAiAdapter(firstFetch) },
      { enabledModelIds: ['gpt-4o-mini'], adapter: makeOpenAiAdapter(secondFetch) },
    ]);

    await multi.executeQuery(sampleQuery, openaiContext);

    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).not.toHaveBeenCalled();
  });
});

// ─── createBenchmarkExecutionAdapter ────────────────────────────────────────

describe('createBenchmarkExecutionAdapter', () => {
  it('creates the stub adapter by default', () => {
    const adapter = createBenchmarkExecutionAdapter();
    expect(adapter).toBeInstanceOf(StubBenchmarkExecutionAdapter);
  });

  it('creates the gemini adapter when explicitly enabled', () => {
    const adapter = createBenchmarkExecutionAdapter({
      BENCHMARK_EXECUTION_PROVIDER: 'gemini',
      BENCHMARK_EXECUTION_API_KEY: 'benchmark-key',
      BENCHMARK_EXECUTION_MODEL: 'gemini-2.0-flash',
    });
    expect(adapter).toBeInstanceOf(GeminiBenchmarkExecutionAdapter);
  });

  it('creates the openai adapter when provider is openai', () => {
    const adapter = createBenchmarkExecutionAdapter({
      BENCHMARK_EXECUTION_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(adapter).toBeInstanceOf(OpenAiCompatibleBenchmarkExecutionAdapter);
    expect((adapter as OpenAiCompatibleBenchmarkExecutionAdapter).providerTag).toBe('openai');
  });

  it('creates the perplexity adapter when provider is perplexity', () => {
    const adapter = createBenchmarkExecutionAdapter({
      BENCHMARK_EXECUTION_PROVIDER: 'perplexity',
      PERPLEXITY_API_KEY: 'pplx-test',
    });
    expect(adapter).toBeInstanceOf(OpenAiCompatibleBenchmarkExecutionAdapter);
    expect((adapter as OpenAiCompatibleBenchmarkExecutionAdapter).providerTag).toBe('perplexity');
  });

  it('creates a multi-provider adapter when provider is multi', () => {
    const adapter = createBenchmarkExecutionAdapter({
      BENCHMARK_EXECUTION_PROVIDER: 'multi',
      GEMINI_API_KEY: 'gemini-key',
      GEMINI_MODEL: 'gemini-2.0-flash',
      OPENAI_API_KEY: 'sk-test',
      PERPLEXITY_API_KEY: 'pplx-test',
    });
    expect(adapter).toBeInstanceOf(MultiProviderBenchmarkExecutionAdapter);
  });

  it('creates a multi-provider stub when no api keys are provided for multi', () => {
    const adapter = createBenchmarkExecutionAdapter({
      BENCHMARK_EXECUTION_PROVIDER: 'multi',
    });
    // No keys — all routes skipped, falls back to stub routing
    expect(adapter).toBeInstanceOf(MultiProviderBenchmarkExecutionAdapter);
  });
});
