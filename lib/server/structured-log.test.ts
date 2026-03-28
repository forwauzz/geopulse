import { describe, expect, it } from 'vitest';
import { sanitizeStructuredLogData } from './structured-log';

describe('sanitizeStructuredLogData', () => {
  it('redacts sensitive keys and truncates long strings', () => {
    const sanitized = sanitizeStructuredLogData({
      api_key: 'secret-value',
      message: 'a'.repeat(600),
      status: 503,
      retryable: true,
      optional: undefined,
      nullable: null,
    });

    expect(sanitized['api_key']).toBe('[REDACTED]');
    expect(typeof sanitized['message']).toBe('string');
    expect(String(sanitized['message']).length).toBeLessThan(520);
    expect(sanitized['status']).toBe(503);
    expect(sanitized['retryable']).toBe(true);
    expect(sanitized['nullable']).toBeNull();
    expect('optional' in sanitized).toBe(false);
  });
});
