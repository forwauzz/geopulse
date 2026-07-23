import { describe, expect, it } from 'vitest';
import { checkSessionEventRateLimit } from './rate-limit-kv';

/** In-memory KV stub good enough for the counter logic (ignores TTL). */
function fakeKv() {
  const store = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(store.get(k) ?? null),
    put: (k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    },
  } as unknown as KVNamespace;
}

describe('checkSessionEventRateLimit', () => {
  it('allows through when no KV is bound (dev / misconfig)', async () => {
    expect(await checkSessionEventRateLimit(undefined, '1.2.3.4')).toEqual({ ok: true });
  });

  it('permits up to 30/min per IP, then throttles', async () => {
    const kv = fakeKv();
    for (let i = 0; i < 30; i += 1) {
      expect(await checkSessionEventRateLimit(kv, '1.2.3.4')).toEqual({ ok: true });
    }
    const blocked = await checkSessionEventRateLimit(kv, '1.2.3.4');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('ip');
  });

  it('tracks IPs independently', async () => {
    const kv = fakeKv();
    for (let i = 0; i < 30; i += 1) await checkSessionEventRateLimit(kv, 'a');
    expect((await checkSessionEventRateLimit(kv, 'a')).ok).toBe(false);
    expect((await checkSessionEventRateLimit(kv, 'b')).ok).toBe(true);
  });
});
