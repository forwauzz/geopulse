import { describe, expect, it } from 'vitest';
import { parseBenchmarkRunnerInput } from './benchmark-runner-contract';

describe('parseBenchmarkRunnerInput', () => {
  it('accepts a valid benchmark runner input', () => {
    const input = parseBenchmarkRunnerInput({
      domainId: '11111111-1111-4111-8111-111111111111',
      querySetId: '22222222-2222-4222-8222-222222222222',
      modelId: 'openai/gpt-4.1-mini',
      auditorModelId: 'openai/gpt-4.1-mini',
      runLabel: 'baseline',
      notes: 'first run',
    });

    expect(input.modelId).toBe('openai/gpt-4.1-mini');
  });

  it('rejects invalid ids', () => {
    expect(() =>
      parseBenchmarkRunnerInput({
        domainId: 'not-a-uuid',
        querySetId: '22222222-2222-4222-8222-222222222222',
        modelId: 'openai/gpt-4.1-mini',
      })
    ).toThrow();
  });
});
