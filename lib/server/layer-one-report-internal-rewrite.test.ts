import { describe, expect, it, vi } from 'vitest';
import {
  rewriteLayerOneReportInternal,
  workersAiRewriteOutputBudget,
} from './layer-one-report-internal-rewrite';

describe('rewriteLayerOneReportInternal', () => {
  it('skips when the feature flag is disabled', async () => {
    const result = await rewriteLayerOneReportInternal('# Report', {
      enabled: 'false',
      apiKey: 'x',
      model: 'gemini-2.0-flash',
      endpoint: 'https://example.test/models',
    });

    expect(result.status).toBe('skipped');
    expect(result.rewrittenMarkdown).toBeNull();
    if (result.status !== 'skipped') throw new Error('expected skipped result');
    expect(result.errorMessage).toBe('layer_one_internal_rewrite_disabled');
  });

  it('fails clearly when enabled without an api key', async () => {
    const result = await rewriteLayerOneReportInternal('# Report', {
      enabled: 'true',
      apiKey: '',
      model: 'gemini-2.0-flash',
      endpoint: 'https://example.test/models',
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('expected failed result');
    expect(result.errorMessage).toBe('layer_one_internal_rewrite_api_key_missing');
  });

  it('returns rewritten markdown from a gemini response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '```markdown\n## Executive summary\n\nRewritten.\n```' }],
            },
          },
        ],
      }),
    });

    const result = await rewriteLayerOneReportInternal(
      '# GEO-Pulse Report',
      {
        enabled: 'true',
        apiKey: 'test-key',
        model: 'gemini-2.0-flash',
        endpoint: 'https://example.test/models',
      },
      fetchMock as unknown as typeof fetch
    );

    expect(result.status).toBe('completed');
    expect(result.rewrittenMarkdown).toBe('## Executive summary\n\nRewritten.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reserves a safe Workers AI output window for a report-sized prompt', () => {
    const budget = workersAiRewriteOutputBudget('x'.repeat(47_427));
    expect(budget).toBe(4_191);
    expect(Math.ceil(47_427 / 3) + (budget ?? 0)).toBe(20_000);
  });

  it('fails closed without invoking Workers AI when the report cannot fit', async () => {
    const run = vi.fn();
    const result = await rewriteLayerOneReportInternal('x'.repeat(60_000), {
      enabled: 'true',
      provider: 'workers_ai',
      ai: { run },
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('expected failed result');
    expect(result.errorMessage).toBe('layer_one_internal_rewrite_prompt_too_large');
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the adaptive output budget to Workers AI', async () => {
    const run = vi.fn().mockResolvedValue({ response: '# Rewritten' });
    const result = await rewriteLayerOneReportInternal('# Report', {
      enabled: 'true',
      provider: 'workers_ai',
      ai: { run },
    });

    expect(result.status).toBe('completed');
    expect(run).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max_tokens: 6_000 }),
    );
  });
});
