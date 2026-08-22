import { describe, expect, it } from 'vitest';
import { resolveCustomerVisibilityStatus } from './customer-visibility-view';

describe('customer visibility status evidence boundary', () => {
  it('never reports measured from metadata alone', () => {
    expect(resolveCustomerVisibilityStatus({
      configured: true,
      outcomeMeasured: false,
      metadata: { baseline_status: 'measured' },
    })).toBe('failed');
  });

  it('reports measured only when the outcome engine has qualifying evidence', () => {
    expect(resolveCustomerVisibilityStatus({
      configured: true,
      outcomeMeasured: true,
      metadata: { baseline_status: 'failed' },
    })).toBe('measured');
  });

  it('preserves honest pending states and the unconfigured state', () => {
    expect(resolveCustomerVisibilityStatus({
      configured: true,
      outcomeMeasured: false,
      metadata: { baseline_status: 'running' },
    })).toBe('running');
    expect(resolveCustomerVisibilityStatus({
      configured: false,
      outcomeMeasured: false,
      metadata: null,
    })).toBe('not_configured');
  });
});
