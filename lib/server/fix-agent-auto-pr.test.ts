import { describe, expect, it } from 'vitest';
import {
  FIX_AGENT_AUTO_PR_KEY,
  isFixAgentAutoPrEnabled,
  setFixAgentAutoPr,
} from './fix-agent-auto-pr';

/**
 * This toggle lives in `user_feature_grants`, the same table that holds admin-assigned
 * capabilities. The boundary that makes that safe is that the key is hardcoded rather than passed
 * in — so a user toggling their own preference cannot grant themselves `fix_agent` or `automation`.
 * These tests exist to keep that property from being refactored away.
 */

type Captured = { table: string; payload: Record<string, unknown> } | null;

function stubClient(opts: { row?: { granted: boolean } | null; error?: boolean } = {}) {
  let captured: Captured = null;
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return opts.error
                        ? { data: null, error: { message: 'boom' } }
                        : { data: opts.row ?? null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async upsert(payload: Record<string, unknown>) {
          captured = { table, payload };
          return { error: opts.error ? { message: 'boom' } : null };
        },
      };
    },
  };
  return { client, get captured() { return captured; } };
}

describe('fix agent auto-PR authorization', () => {
  it('is off until explicitly granted', async () => {
    const { client } = stubClient({ row: null });
    expect(await isFixAgentAutoPrEnabled(client as never, 'user-1')).toBe(false);
  });

  it('is on once granted', async () => {
    const { client } = stubClient({ row: { granted: true } });
    expect(await isFixAgentAutoPrEnabled(client as never, 'user-1')).toBe(true);
  });

  it('fails closed on a read error rather than assuming authorization', async () => {
    const { client } = stubClient({ error: true });
    expect(await isFixAgentAutoPrEnabled(client as never, 'user-1')).toBe(false);
  });

  it('writes ONLY its own feature key, never a caller-supplied one', async () => {
    const stub = stubClient();
    await setFixAgentAutoPr(stub.client as never, 'user-1', true);

    expect(stub.captured?.table).toBe('user_feature_grants');
    expect(stub.captured?.payload['feature']).toBe(FIX_AGENT_AUTO_PR_KEY);
    // The escalation this guards against: writing 'fix_agent' or 'automation' from a user action.
    expect(stub.captured?.payload['feature']).not.toBe('fix_agent');
    expect(stub.captured?.payload['user_id']).toBe('user-1');
    expect(stub.captured?.payload['granted']).toBe(true);
  });

  it('reports a failed write instead of pretending the setting saved', async () => {
    const stub = stubClient({ error: true });
    expect(await setFixAgentAutoPr(stub.client as never, 'user-1', true)).toEqual({
      ok: false,
      reason: 'write_failed',
    });
  });
});
