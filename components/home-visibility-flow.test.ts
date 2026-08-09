import { describe, expect, it } from 'vitest';
import {
  HOME_ENGINE_LABELS,
  HOME_EXAMPLE_ACTION,
  HOME_EXAMPLE_FINDING,
  HOME_EXAMPLE_LABEL,
  HOME_EXAMPLE_SCORES,
} from '@/components/home-visibility-flow-data';

describe('HomeVisibilityFlow', () => {
  it('keeps the example state explicit and complete across every measured engine', () => {
    expect(HOME_EXAMPLE_LABEL).toBe('Example data');
    expect(Object.keys(HOME_ENGINE_LABELS)).toEqual(['chatgpt', 'google', 'claude', 'copilot', 'perplexity']);
    expect(Object.keys(HOME_EXAMPLE_SCORES)).toEqual(Object.keys(HOME_ENGINE_LABELS));
    expect(Object.values(HOME_EXAMPLE_SCORES).every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(HOME_EXAMPLE_FINDING).toContain('answer the buyer question');
    expect(HOME_EXAMPLE_ACTION).toContain('verify on the next run');
    expect(`${HOME_EXAMPLE_LABEL} ${HOME_EXAMPLE_FINDING} ${HOME_EXAMPLE_ACTION}`.toLowerCase()).not.toContain('partner');
  });
});
