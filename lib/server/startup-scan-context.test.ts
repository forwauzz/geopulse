import { describe, expect, it } from 'vitest';
import { validateStartupWorkspaceScanContext } from './startup-scan-context';

describe('validateStartupWorkspaceScanContext', () => {
  it('returns true when an active membership row exists', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: { id: 'm1' }, error: null }),
        };
      },
    };
    await expect(
      validateStartupWorkspaceScanContext({
        supabase: supabase as any,
        userId: 'u1',
        startupWorkspaceId: 'ws1',
      })
    ).resolves.toBe(true);
  });

  it('returns false when no row', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      },
    };
    await expect(
      validateStartupWorkspaceScanContext({
        supabase: supabase as any,
        userId: 'u1',
        startupWorkspaceId: 'ws1',
      })
    ).resolves.toBe(false);
  });

  it('returns false on query error', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: { message: 'x' } }),
        };
      },
    };
    await expect(
      validateStartupWorkspaceScanContext({
        supabase: supabase as any,
        userId: 'u1',
        startupWorkspaceId: 'ws1',
      })
    ).resolves.toBe(false);
  });
});
