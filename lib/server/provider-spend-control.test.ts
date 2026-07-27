import { describe, expect, it } from 'vitest';
import { summarizeProviderSpend } from './provider-spend-control';

describe('provider spend control', () => {
  it('surfaces approaching and exhausted hard caps', () => {
    const rows = summarizeProviderSpend([
      { provider: 'gemini', monthly_cap_usd: 5, enabled: true },
      { provider: 'openai', monthly_cap_usd: 5, enabled: true },
    ], [
      { provider: 'gemini', estimated_cost_usd: 4, actual_cost_usd: null, status: 'reserved' },
      { provider: 'openai', estimated_cost_usd: 6, actual_cost_usd: 5, status: 'settled' },
    ]);
    expect(rows[0]).toMatchObject({ percentUsed: 80, status: 'attention', remainingUsd: 1 });
    expect(rows[1]).toMatchObject({ percentUsed: 100, status: 'blocked', remainingUsd: 0 });
  });
});
