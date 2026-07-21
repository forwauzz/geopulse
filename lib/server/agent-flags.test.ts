import { describe, expect, it } from 'vitest';
import { isAgentEnabled } from './agent-flags';

type FakeRow = { enabled?: boolean; kill_switch?: boolean } | null;

function fakeSupabase(row: FakeRow, fail = false) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (fail) return { data: null, error: { message: 'relation does not exist' } };
            return { data: row, error: null };
          },
        }),
      }),
    }),
  } as never;
}

describe('isAgentEnabled', () => {
  it('honors the failOpen polarity when no row / table exists', async () => {
    expect(await isAgentEnabled(fakeSupabase(null), 'outreach_sweep', { failOpen: true })).toBe(true);
    expect(await isAgentEnabled(fakeSupabase(null, true), 'outreach_sweep', { failOpen: true })).toBe(true);
    expect(await isAgentEnabled(fakeSupabase(null), 'outreach_sweep', { failOpen: false })).toBe(false);
  });

  it('kill switch always wins', async () => {
    expect(await isAgentEnabled(fakeSupabase({ enabled: true, kill_switch: true }), 'research_agent', { failOpen: true })).toBe(false);
  });

  it('explicit enabled=false switches a fail-open agent off', async () => {
    expect(await isAgentEnabled(fakeSupabase({ enabled: false }), 'outreach_sweep', { failOpen: true })).toBe(false);
    expect(await isAgentEnabled(fakeSupabase({ enabled: true }), 'outreach_sweep', { failOpen: true })).toBe(true);
  });
});
