import { describe, expect, it, vi } from 'vitest';
import { rewriteLayerOneReportInternal } from './layer-one-report-internal-rewrite';

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
});
