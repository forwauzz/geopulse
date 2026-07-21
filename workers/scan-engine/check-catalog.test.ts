import { describe, expect, it } from 'vitest';
import { buildDeterministicChecks } from './checks/registry';
import { CHECK_CATALOG, bucketOf, catalogEntry, weightOf } from './check-catalog';

describe('check catalog (spec §3/C7)', () => {
  it('covers every registered deterministic check', () => {
    for (const c of buildDeterministicChecks()) {
      expect(catalogEntry(c.id), `catalog entry missing for ${c.id}`).toBeDefined();
    }
  });

  it('has no orphan entries except the LLM checks', () => {
    const registered = new Set(buildDeterministicChecks().map((c) => c.id));
    const llmChecks = new Set(['llm-qa-pattern', 'llm-extractability']);
    for (const e of CHECK_CATALOG) {
      expect(registered.has(e.id) || llmChecks.has(e.id), `orphan catalog entry ${e.id}`).toBe(true);
    }
  });

  it('puts hygiene items (spec Bucket C) out of the AI score', () => {
    for (const id of ['security-headers', 'open-graph', 'viewport', 'meta-description', 'llms-txt']) {
      expect(bucketOf(id), id).toBe('hygiene');
    }
  });

  it('weights llms.txt at exactly 0', () => {
    expect(weightOf('llms-txt', 99)).toBe(0);
  });

  it('keeps retrieval access as the heaviest eligibility check', () => {
    const access = catalogEntry('ai-crawler-access');
    expect(access?.bucket).toBe('eligibility');
    const maxWeight = Math.max(...CHECK_CATALOG.map((e) => e.weight));
    expect(access?.weight).toBeGreaterThanOrEqual(maxWeight - 2);
  });

  it('every entry has a plain-English why', () => {
    for (const e of CHECK_CATALOG) {
      expect(e.whyItMatters.length, e.id).toBeGreaterThan(20);
    }
  });
});
