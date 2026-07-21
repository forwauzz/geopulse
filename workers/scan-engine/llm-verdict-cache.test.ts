import { afterEach, describe, expect, it } from 'vitest';
import type { LLMProvider } from '../lib/interfaces/providers';
import { auditPageFromHtml, registerLlmVerdictCache } from './run-scan';

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string, _type: 'text') => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function countingLlm(counter: { calls: number }, confidence: 'high' | 'low' = 'high', reasoning = 'Clear answer-first structure.'): LLMProvider {
  return {
    async analyze() {
      counter.calls += 1;
      return { passed: true, reasoning, confidence };
    },
  };
}

const HTML = '<html><head><title>Acme IT</title></head><body><h1>Managed IT</h1><p>We support 80 clients in Montreal since 2012.</p></body></html>';

afterEach(() => registerLlmVerdictCache(null));

describe('LLM verdict cache (issue #109 — identical input, identical score)', () => {
  it('reuses verdicts for a byte-identical page: zero LLM calls on the second audit, identical output', async () => {
    const kv = fakeKv();
    registerLlmVerdictCache(kv);
    const counter = { calls: 0 };

    const first = await auditPageFromHtml('https://acme.ca/', HTML, countingLlm(counter), { useLlm: true });
    expect(counter.calls).toBe(2); // qa + extractability
    expect(kv.store.size).toBe(1);

    const second = await auditPageFromHtml('https://acme.ca/', HTML, countingLlm(counter), { useLlm: true });
    expect(counter.calls).toBe(2); // cache hit — no new LLM calls
    expect(second.score).toBe(first.score);
    expect(second.issues).toEqual(first.issues);
  });

  it('re-runs when the page content changes', async () => {
    const kv = fakeKv();
    registerLlmVerdictCache(kv);
    const counter = { calls: 0 };

    await auditPageFromHtml('https://acme.ca/', HTML, countingLlm(counter), { useLlm: true });
    await auditPageFromHtml('https://acme.ca/', HTML.replace('80 clients', '95 clients'), countingLlm(counter), { useLlm: true });
    expect(counter.calls).toBe(4);
    expect(kv.store.size).toBe(2);
  });

  it('never caches transient provider failures', async () => {
    const kv = fakeKv();
    registerLlmVerdictCache(kv);
    const counter = { calls: 0 };

    await auditPageFromHtml('https://acme.ca/', HTML, countingLlm(counter, 'low', 'http_500'), { useLlm: true });
    expect(kv.store.size).toBe(0); // failure not stored

    await auditPageFromHtml('https://acme.ca/', HTML, countingLlm(counter), { useLlm: true });
    expect(counter.calls).toBe(4); // re-ran after the failure
    expect(kv.store.size).toBe(1); // healthy verdicts stored
  });

  it('runs normally with no cache registered', async () => {
    const counter = { calls: 0 };
    const out = await auditPageFromHtml('https://acme.ca/', HTML, countingLlm(counter), { useLlm: true });
    expect(counter.calls).toBe(2);
    expect(out.score).toBeGreaterThan(0);
  });
});
