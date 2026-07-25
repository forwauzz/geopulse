import type { EmbeddingBatch, EmbeddingProvider } from './retrieval-experiment';

type OpenAIEmbeddingResponse = {
  data?: Array<{ index: number; embedding: number[] }>;
  usage?: { total_tokens?: number };
  error?: { message?: string };
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'openai';
  readonly version = '2026-07';

  constructor(
    private readonly apiKey: string,
    readonly model = 'text-embedding-3-small',
    private readonly dimensions = 512,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async embed(texts: readonly string[]): Promise<EmbeddingBatch> {
    if (!this.apiKey.trim()) throw new Error('OpenAI embedding API key is required.');
    if (texts.length === 0) return { vectors: [], tokenCount: 0, estimatedCostUsd: 0 };
    const response = await this.fetchImpl('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dimensions }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as OpenAIEmbeddingResponse;
    if (!response.ok || !payload.data) {
      throw new Error(payload.error?.message ?? `OpenAI embeddings failed (${response.status}).`);
    }
    const vectors = [...payload.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
    const tokenCount = payload.usage?.total_tokens ?? 0;
    return {
      vectors,
      tokenCount,
      estimatedCostUsd: tokenCount / 1_000_000 * 0.02,
    };
  }
}
