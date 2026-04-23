import { describe, expect, it } from 'vitest';
import { buildGpmQueryPrompt, parseGpmQueryResponse } from './geo-performance-prompt-builder';

// ── buildGpmQueryPrompt ───────────────────────────────────────────────────────

describe('buildGpmQueryPrompt', () => {
  it('includes topic and location in the prompt', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Vestibular Rehabilitation',
      location: 'Vancouver',
      promptCount: 10,
    });
    expect(prompt).toContain('Vestibular Rehabilitation');
    expect(prompt).toContain('Vancouver');
  });

  it('includes brand name when provided', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Physiotherapy',
      location: 'Toronto',
      brandName: 'Elite Physio',
      promptCount: 10,
    });
    expect(prompt).toContain('Elite Physio');
    expect(prompt).toContain('branded');
  });

  it('omits brand instruction when brandName is null', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Physiotherapy',
      location: 'Toronto',
      brandName: null,
      promptCount: 10,
    });
    expect(prompt).toContain('No brand name is specified');
  });

  it('clamps promptCount to minimum of 3', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Acupuncture',
      location: 'Calgary',
      promptCount: 1,
    });
    expect(prompt).toContain('exactly 3');
  });

  it('clamps promptCount to maximum of 20', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Acupuncture',
      location: 'Calgary',
      promptCount: 99,
    });
    expect(prompt).toContain('exactly 20');
  });

  it('includes the correct count when within range', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Chiropractic',
      location: 'Montreal',
      promptCount: 15,
    });
    expect(prompt).toContain('exactly 15');
  });

  it('instructs Claude to return raw JSON without markdown fences', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'Vestibular Rehabilitation',
      location: 'Vancouver',
      promptCount: 10,
    });
    expect(prompt).toContain('valid JSON only');
    expect(prompt).toContain('No explanation, no markdown fences');
  });

  it('lists all five intent categories in the prompt', () => {
    const prompt = buildGpmQueryPrompt({
      topic: 'PT',
      location: 'Ottawa',
      promptCount: 10,
    });
    expect(prompt).toContain('high_intent');
    expect(prompt).toContain('informational');
    expect(prompt).toContain('local');
    expect(prompt).toContain('branded');
    expect(prompt).toContain('comparative');
  });
});

// ── parseGpmQueryResponse ─────────────────────────────────────────────────────

const validResponseJson = JSON.stringify({
  queries: [
    {
      query_key: 'vestibular-rehab-vancouver-best',
      query_text: 'Best vestibular rehabilitation clinics in Vancouver',
      intent_type: 'direct',
      category: 'high_intent',
    },
    {
      query_key: 'vestibular-therapy-near-me',
      query_text: 'Vestibular therapy near me Vancouver',
      intent_type: 'discovery',
      category: 'local',
    },
    {
      query_key: 'compare-vestibular-clinics-vancouver',
      query_text: 'Which vestibular rehabilitation clinic is best in Vancouver?',
      intent_type: 'comparative',
      category: 'comparative',
    },
  ],
});

describe('parseGpmQueryResponse', () => {
  it('parses a valid Claude JSON response', () => {
    const queries = parseGpmQueryResponse(validResponseJson);
    expect(queries).toHaveLength(3);
    expect(queries[0]?.queryKey).toBe('vestibular-rehab-vancouver-best');
    expect(queries[0]?.intentType).toBe('direct');
    expect(queries[0]?.category).toBe('high_intent');
  });

  it('strips markdown fences if Claude wraps output', () => {
    const fenced = `\`\`\`json\n${validResponseJson}\n\`\`\``;
    const queries = parseGpmQueryResponse(fenced);
    expect(queries).toHaveLength(3);
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const wrapped = `Here are your queries:\n${validResponseJson}\nLet me know if you need more.`;
    const queries = parseGpmQueryResponse(wrapped);
    expect(queries).toHaveLength(3);
  });

  it('deduplicates by query_key, keeping the first occurrence', () => {
    const withDuplicate = JSON.stringify({
      queries: [
        { query_key: 'dup-key', query_text: 'First', intent_type: 'direct', category: 'high_intent' },
        { query_key: 'dup-key', query_text: 'Second (duplicate)', intent_type: 'direct', category: 'high_intent' },
        { query_key: 'unique-key', query_text: 'Third', intent_type: 'discovery', category: 'local' },
      ],
    });
    const queries = parseGpmQueryResponse(withDuplicate);
    expect(queries).toHaveLength(2);
    expect(queries[0]?.queryText).toBe('First');
  });

  it('throws when there is no JSON in the response', () => {
    expect(() => parseGpmQueryResponse('Sorry, I cannot help with that.')).toThrow();
  });

  it('throws when the JSON is malformed', () => {
    expect(() => parseGpmQueryResponse('{ queries: [invalid}}')).toThrow();
  });

  it('throws when a query_key contains invalid characters', () => {
    const bad = JSON.stringify({
      queries: [
        { query_key: 'has spaces here', query_text: 'Some query', intent_type: 'direct', category: 'high_intent' },
      ],
    });
    expect(() => parseGpmQueryResponse(bad)).toThrow();
  });

  it('throws when intent_type is not a valid value', () => {
    const bad = JSON.stringify({
      queries: [
        { query_key: 'valid-key', query_text: 'Some query', intent_type: 'unknown', category: 'high_intent' },
      ],
    });
    expect(() => parseGpmQueryResponse(bad)).toThrow();
  });

  it('throws when category is not a valid value', () => {
    const bad = JSON.stringify({
      queries: [
        { query_key: 'valid-key', query_text: 'Some query', intent_type: 'direct', category: 'invalid_category' },
      ],
    });
    expect(() => parseGpmQueryResponse(bad)).toThrow();
  });

  it('maps snake_case keys to camelCase on output', () => {
    const queries = parseGpmQueryResponse(validResponseJson);
    expect(queries[0]).toHaveProperty('queryKey');
    expect(queries[0]).toHaveProperty('queryText');
    expect(queries[0]).toHaveProperty('intentType');
    expect(queries[0]).not.toHaveProperty('query_key');
  });
});
