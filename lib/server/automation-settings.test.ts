import { describe, expect, it } from 'vitest';
import { configInt, loadAutomationSetting, updateAutomationSetting } from './automation-settings';

function fakeSupabase(row: unknown, opts: { error?: boolean } = {}) {
  const captured: { upsert?: any } = {};
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => (opts.error ? { data: null, error: { message: 'boom' } } : { data: row, error: null }) };
            },
          };
        },
        upsert(values: any) {
          captured.upsert = values;
          return Promise.resolve({ error: opts.error ? { message: 'boom' } : null });
        },
      };
    },
  };
  return { client: client as any, captured };
}

describe('loadAutomationSetting', () => {
  it('maps a row to camelCase', async () => {
    const { client } = fakeSupabase({ enabled: true, kill_switch: false, config: { daily_cap: 3 } });
    const s = await loadAutomationSetting(client, 'marketing_autopilot');
    expect(s).toEqual({ feature: 'marketing_autopilot', enabled: true, killSwitch: false, config: { daily_cap: 3 } });
  });

  it('fails closed (disabled) on error or missing row', async () => {
    const err = fakeSupabase(null, { error: true });
    expect(await loadAutomationSetting(err.client, 'marketing_autopilot')).toEqual({ feature: 'marketing_autopilot', enabled: false, killSwitch: false, config: {} });
    const none = fakeSupabase(null);
    expect((await loadAutomationSetting(none.client, 'marketing_autopilot')).enabled).toBe(false);
  });
});

describe('updateAutomationSetting', () => {
  it('upserts only provided fields with the feature key + updated_by', async () => {
    const { client, captured } = fakeSupabase(null);
    const res = await updateAutomationSetting(client, 'marketing_autopilot', { enabled: true }, 'user-1');
    expect(res).toEqual({ ok: true });
    expect(captured.upsert).toMatchObject({ feature: 'marketing_autopilot', enabled: true, updated_by: 'user-1' });
    expect(captured.upsert).not.toHaveProperty('kill_switch');
  });

  it('surfaces db errors', async () => {
    const { client } = fakeSupabase(null, { error: true });
    expect(await updateAutomationSetting(client, 'marketing_autopilot', { killSwitch: true }, null)).toEqual({ ok: false, error: 'boom' });
  });
});

describe('configInt', () => {
  it('reads a positive int or falls back', () => {
    expect(configInt({ daily_cap: 5 }, 'daily_cap', 2)).toBe(5);
    expect(configInt({ daily_cap: 0 }, 'daily_cap', 2)).toBe(2);
    expect(configInt({}, 'daily_cap', 2)).toBe(2);
    expect(configInt({ daily_cap: 'x' }, 'daily_cap', 2)).toBe(2);
  });
});
