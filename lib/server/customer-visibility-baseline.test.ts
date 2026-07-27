import { describe, expect, it } from 'vitest';
import { buildBaselineBuyerPrompts } from './customer-visibility-baseline';

describe('customer visibility baseline prompts', () => {
  it('creates a bounded blind buyer-question set from company context', () => {
    const prompts = buildBaselineBuyerPrompts({
      vertical: 'healthcare',
      subvertical: 'medical_clinic',
      location: 'Montreal, Canada',
    });

    expect(prompts).toHaveLength(10);
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(prompts.every((prompt) => prompt.endsWith('?') || prompt.endsWith('.'))).toBe(true);
    expect(prompts.join(' ')).toContain('medical clinic');
    expect(prompts.join(' ')).toContain('Montreal, Canada');
  });

  it('falls back to useful generic prompts without inventing a market', () => {
    const prompts = buildBaselineBuyerPrompts({});
    expect(prompts).toHaveLength(10);
    expect(prompts[0]).toContain('business services');
    expect(prompts[0]).toContain('your market');
  });
});
