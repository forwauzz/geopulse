import { describe, expect, it } from 'vitest';
import {
  estimateGpmActivationCostUsd,
  estimateGpmPlatformCostUsd,
  isGpmSpendAllowed,
  resolveGpmSpendPolicy,
} from './gpm-spend-guard';

describe('GPM spend guard', () => {
  it('uses conservative, low activation estimates', () => {
    expect(estimateGpmPlatformCostUsd('perplexity', 10)).toBe(0.07);
    expect(estimateGpmActivationCostUsd(['chatgpt', 'gemini', 'perplexity'], 10)).toBe(0.11);
  });

  it('fails closed at either cap', () => {
    const policy = resolveGpmSpendPolicy({});
    expect(isGpmSpendAllowed({ estimatedUsd: 0.1, monthSpendUsd: 0, policy }).allowed).toBe(true);
    expect(isGpmSpendAllowed({ estimatedUsd: 0.21, monthSpendUsd: 0, policy }).reason)
      .toBe('client_activation_cap');
    expect(isGpmSpendAllowed({ estimatedUsd: 0.1, monthSpendUsd: 4.95, policy }).reason)
      .toBe('monthly_portfolio_cap');
  });

  it('accepts explicit positive caps and rejects invalid ones', () => {
    expect(resolveGpmSpendPolicy({
      GPM_MONTHLY_SPEND_CAP_USD: '2.50',
      GPM_CLIENT_ACTIVATION_CAP_USD: '0.12',
    })).toEqual({ monthlyCapUsd: 2.5, clientActivationCapUsd: 0.12 });
    expect(resolveGpmSpendPolicy({
      GPM_MONTHLY_SPEND_CAP_USD: '-1',
      GPM_CLIENT_ACTIVATION_CAP_USD: 'nope',
    })).toEqual({ monthlyCapUsd: 5, clientActivationCapUsd: 0.2 });
  });
});
