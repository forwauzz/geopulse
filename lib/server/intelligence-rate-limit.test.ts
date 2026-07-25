import { describe, expect, it } from 'vitest';
import { checkIntelligenceRateLimit } from './intelligence-rate-limit';

function memoryKv(): KVNamespace {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => { values.set(key, value); },
  } as unknown as KVNamespace;
}

describe('intelligence rate limit', () => {
  it('allows local execution without KV and bounds each authenticated actor with KV', async () => {
    expect(await checkIntelligenceRateLimit(undefined, 'actor')).toEqual({ ok: true });
    const kv = memoryKv();
    for (let index = 0; index < 30; index += 1) {
      expect((await checkIntelligenceRateLimit(kv, 'actor', 0)).ok).toBe(true);
    }
    expect(await checkIntelligenceRateLimit(kv, 'actor', 0)).toEqual({
      ok: false,
      retryAfterSec: 60,
    });
    expect((await checkIntelligenceRateLimit(kv, 'other-actor', 0)).ok).toBe(true);
  });
});
