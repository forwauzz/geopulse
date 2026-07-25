import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from './openai-embedding-provider';

describe('OpenAI embedding provider adapter', () => {
  it('records ordered vectors, token usage, and estimated cost without an SDK dependency', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
        usage: { total_tokens: 50 },
      }),
    });
    const provider = new OpenAIEmbeddingProvider(
      'test-key', 'text-embedding-3-small', 512, fetchImpl as unknown as typeof fetch
    );
    const result = await provider.embed(['one', 'two']);
    expect(result.vectors).toEqual([[1, 0], [0, 1]]);
    expect(result.tokenCount).toBe(50);
    expect(result.estimatedCostUsd).toBeCloseTo(0.000001, 12);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
