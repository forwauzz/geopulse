import { describe, expect, it } from 'vitest';
import { listUserFeatures, userHasFeature } from './user-feature-grants';

function fakeSupabase(row: unknown, rows: unknown[] = []) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: row, error: null }),
                  };
                },
                // listUserFeatures does .eq('user_id').eq('granted', true) → returns rows
                then: undefined,
                maybeSingle: async () => ({ data: row, error: null }),
                // support the two-eq chain used by listUserFeatures via a resolved array
                data: rows,
              } as any;
            },
          };
        },
      };
    },
  } as any;
}

describe('userHasFeature', () => {
  it('true when a granted row exists', async () => {
    expect(await userHasFeature(fakeSupabase({ granted: true }), 'u1', 'automation')).toBe(true);
  });
  it('false when missing or revoked', async () => {
    expect(await userHasFeature(fakeSupabase(null), 'u1', 'automation')).toBe(false);
    expect(await userHasFeature(fakeSupabase({ granted: false }), 'u1', 'automation')).toBe(false);
  });
  it('false for an empty user id', async () => {
    expect(await userHasFeature(fakeSupabase({ granted: true }), '', 'automation')).toBe(false);
  });
});

describe('listUserFeatures', () => {
  it('returns an empty set for an empty user id', async () => {
    const s = await listUserFeatures(fakeSupabase(null, []), '');
    expect(s.size).toBe(0);
  });
});
