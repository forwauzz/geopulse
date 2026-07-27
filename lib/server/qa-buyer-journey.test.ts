import { describe, expect, it, vi } from 'vitest';
import {
  cleanupQaBuyerJourney,
  completeQaBuyerJourney,
  issueQaBuyerJourney,
  loadQaBuyerJourneyResult,
  validateQaBuyerJourney,
} from './qa-buyer-journey';

function fakeKv(): KVNamespace {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream) => {
      values.set(key, String(value));
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as unknown as KVNamespace;
}

describe('QA buyer journey tokens', () => {
  it.each([
    ['business', 'startup_dev'],
    ['agency', 'agency_core'],
  ] as const)('issues and validates a protected %s journey', async (persona, bundleKey) => {
    const kv = fakeKv();
    const now = new Date('2026-07-28T12:00:00.000Z');
    const claim = await issueQaBuyerJourney({
      kv,
      persona,
      bundleKey,
      issuedByUserId: 'admin-1',
      now,
    });

    expect(claim.email).toContain(`geopulse.qa.${persona}.`);
    expect(
      await validateQaBuyerJourney({
        kv,
        token: claim.token,
        email: claim.email,
        bundleKey,
        now: new Date('2026-07-28T12:05:00.000Z'),
      }),
    ).toEqual({ ok: true, claim });
  });

  it('rejects a leaked token for a different email or bundle', async () => {
    const kv = fakeKv();
    const claim = await issueQaBuyerJourney({
      kv,
      persona: 'agency',
      bundleKey: 'agency_core',
      issuedByUserId: 'admin-1',
      now: new Date('2026-07-28T12:00:00.000Z'),
    });

    await expect(
      validateQaBuyerJourney({
        kv,
        token: claim.token,
        email: 'attacker@example.com',
        bundleKey: 'agency_core',
        now: new Date('2026-07-28T12:01:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'email_mismatch' });
    await expect(
      validateQaBuyerJourney({
        kv,
        token: claim.token,
        email: claim.email,
        bundleKey: 'agency_pro',
        now: new Date('2026-07-28T12:01:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'bundle_mismatch' });
  });

  it('becomes single-use after successful provisioning', async () => {
    const kv = fakeKv();
    const claim = await issueQaBuyerJourney({
      kv,
      persona: 'business',
      bundleKey: 'startup_dev',
      issuedByUserId: 'admin-1',
      now: new Date('2026-07-28T12:00:00.000Z'),
    });
    const result = {
      token: claim.token,
      userId: 'user-qa',
      email: claim.email,
      bundleKey: claim.bundleKey,
      subscriptionId: `sub_qa_${claim.token.slice(0, 32)}`,
      completedAt: '2026-07-28T12:02:00.000Z',
    } as const;

    await completeQaBuyerJourney({ kv, result });

    await expect(
      validateQaBuyerJourney({
        kv,
        token: claim.token,
        email: claim.email,
        bundleKey: claim.bundleKey,
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(loadQaBuyerJourneyResult(kv, claim.token)).resolves.toEqual(result);
  });

  it('cleans an abandoned signup before subscription provisioning', async () => {
    const kv = fakeKv();
    const claim = await issueQaBuyerJourney({
      kv,
      persona: 'agency',
      bundleKey: 'agency_core',
      issuedByUserId: 'admin-1',
      now: new Date('2026-07-28T12:00:00.000Z'),
    });
    const deleteUser = vi.fn(async () => ({ error: null }));

    function query(data: unknown) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        delete: () => builder,
        maybeSingle: async () => ({ data, error: null }),
        then: (resolve: (value: { error: null }) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      return builder;
    }

    const supabase = {
      from: (table: string) => query(table === 'users' ? { id: 'abandoned-user' } : null),
      auth: { admin: { deleteUser } },
    };

    await expect(
      cleanupQaBuyerJourney({
        kv,
        supabase: supabase as never,
        token: claim.token,
      }),
    ).resolves.toEqual({ deleted: true, email: claim.email });
    expect(deleteUser).toHaveBeenCalledWith('abandoned-user');
    await expect(
      validateQaBuyerJourney({
        kv,
        token: claim.token,
        email: claim.email,
        bundleKey: claim.bundleKey,
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
  });
});
