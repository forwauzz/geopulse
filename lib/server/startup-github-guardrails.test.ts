import { describe, expect, it } from 'vitest';
import {
  assertNoActiveStartupPrRunForRepo,
  assertStartupWorkspaceRepoAccess,
  hasActiveStartupPrRunForRepo,
  isStartupInternalReservedRepo,
} from './startup-github-guardrails';

describe('startup github guardrails', () => {
  it('recognizes reserved internal repos', () => {
    expect(isStartupInternalReservedRepo('forwauzz/geopulse')).toBe(true);
    expect(isStartupInternalReservedRepo('FORWAUZZ/GEOPULSE')).toBe(true);
    expect(isStartupInternalReservedRepo('acme/site')).toBe(false);
  });

  it('allows reserved repo only when workspace metadata explicitly opts in', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                metadata: {
                  allow_internal_product_repo: true,
                },
              },
              error: null,
            });
          },
        };
      },
    } as any;

    await expect(
      assertStartupWorkspaceRepoAccess({
        supabase,
        startupWorkspaceId: 'ws-1',
        repoFullName: 'forwauzz/geopulse',
      })
    ).resolves.toBeUndefined();
  });

  it('blocks reserved repo when workspace metadata does not opt in', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                metadata: {},
              },
              error: null,
            });
          },
        };
      },
    } as any;

    await expect(
      assertStartupWorkspaceRepoAccess({
        supabase,
        startupWorkspaceId: 'ws-1',
        repoFullName: 'forwauzz/geopulse',
      })
    ).rejects.toThrow('Repository is reserved for internal startup workspaces.');
  });

  it('detects active PR runs for the same workspace repo', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'run-1',
                  status: 'queued',
                },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    await expect(
      hasActiveStartupPrRunForRepo({
        supabase,
        startupWorkspaceId: 'ws-1',
        repoFullName: 'acme/site',
      })
    ).resolves.toBe(true);

    await expect(
      assertNoActiveStartupPrRunForRepo({
        supabase,
        startupWorkspaceId: 'ws-1',
        repoFullName: 'acme/site',
      })
    ).rejects.toThrow('An active PR run already exists for this workspace and repository.');
  });
});
