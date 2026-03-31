import { describe, expect, it, vi } from 'vitest';
import {
  createBenchmarkExecutionAdapter,
  GeminiBenchmarkExecutionAdapter,
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
});

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
});
