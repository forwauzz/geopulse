import { describe, expect, it } from 'vitest';
import {
  normalizeGitHubRepoAllowlist,
  setStartupGithubRepositoryAllowlist,
  upsertStartupGithubInstallationFromCallback,
} from './startup-github-integration';

describe('startup github integration helpers', () => {
  it('normalizes and validates repository allowlist input', () => {
    const result = normalizeGitHubRepoAllowlist(
      ['Acme/Geo-Pulse', 'acme/geo-pulse', 'invalid slug', 'owner/repo', 'owner/repo'].join('\n')
    );

    expect(result.repositories).toEqual(['acme/geo-pulse', 'owner/repo']);
    expect(result.invalid).toEqual(['invalid slug']);
  });

  it('persists callback installation state as connected', async () => {
    const upserts: Array<{ payload: Record<string, unknown>; onConflict?: string }> = [];
    const supabase = {
      from(table: string) {
        if (table !== 'startup_github_installations') throw new Error(`Unexpected table ${table}`);
        return {
          upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
            upserts.push({ payload, onConflict: options.onConflict });
            return Promise.resolve({ error: null });
          },
        };
      },
    } as any;

    await upsertStartupGithubInstallationFromCallback({
      supabase,
      startupWorkspaceId: 'ws-1',
      installationId: 12345,
      accountLogin: 'acme',
      accountType: 'Organization',
      connectedByUserId: 'user-1',
      metadata: { source: 'callback' },
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.onConflict).toBe('startup_workspace_id,provider');
    expect(upserts[0]?.payload.status).toBe('connected');
    expect(upserts[0]?.payload.installation_id).toBe(12345);
  });

  it('replaces allowlist rows for connected installation', async () => {
    const deletes: Array<Record<string, unknown>> = [];
    const inserts: Array<Array<Record<string, unknown>>> = [];
    const supabase = {
      from(table: string) {
        if (table === 'startup_github_installations') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'install-row-1' },
                error: null,
              });
            },
          };
        }
        if (table === 'startup_github_installation_repositories') {
          const state: Record<string, unknown> = {};
          return {
            delete() {
              return this;
            },
            eq(field: string, value: unknown) {
              state[field] = value;
              if (field === 'installation_row_id' && Object.keys(state).length === 1) {
                deletes.push({ ...state });
                return Promise.resolve({ error: null });
              }
              return this;
            },
            insert(rows: Array<Record<string, unknown>>) {
              inserts.push(rows);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    await setStartupGithubRepositoryAllowlist({
      supabase,
      startupWorkspaceId: 'ws-1',
      repositories: ['acme/geo-pulse', 'acme/site'],
    });

    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.map((row) => `${row.repo_owner}/${row.repo_name}`)).toEqual([
      'acme/geo-pulse',
      'acme/site',
    ]);
  });
});
