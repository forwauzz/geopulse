import { describe, expect, it } from 'vitest';
import { observationalConfidence } from './intelligence-learning-loop';

describe('governed intelligence learning loop', () => {
  it('bounds observational confidence below certainty', () => {
    expect(observationalConfidence(1)).toBe(0.1);
    expect(observationalConfidence(25)).toBe(0.5);
    expect(observationalConfidence(10_000)).toBe(0.9);
  });
});
