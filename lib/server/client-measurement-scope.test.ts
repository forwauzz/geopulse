import { describe, expect, it } from 'vitest';
import { applyClientMeasurementScope, isPlatformEnabled } from './client-measurement-scope';

describe('client measurement scope', () => {
  it('binds an agency projection to its active query set and tenant', () => {
    const filters: Array<[string, string]> = [];
    const query = {
      eq(column: string, value: string) {
        filters.push([column, value]);
        return this;
      },
    };

    applyClientMeasurementScope(query, {
      querySetId: 'source-verified-set',
      agencyAccountId: 'lifter',
      enabledPlatforms: ['gemini', 'perplexity'],
    });

    expect(filters).toEqual([
      ['query_set_id', 'source-verified-set'],
      ['agency_account_id', 'lifter'],
    ]);
    expect(isPlatformEnabled({
      querySetId: 'source-verified-set',
      agencyAccountId: 'lifter',
      enabledPlatforms: ['gemini', 'perplexity'],
    }, 'chatgpt')).toBe(false);
  });

  it('binds a direct-business projection to its workspace', () => {
    const filters: Array<[string, string]> = [];
    const query = {
      eq(column: string, value: string) {
        filters.push([column, value]);
        return this;
      },
    };
    applyClientMeasurementScope(query, {
      querySetId: 'set-1',
      startupWorkspaceId: 'workspace-1',
    });
    expect(filters).toEqual([
      ['query_set_id', 'set-1'],
      ['startup_workspace_id', 'workspace-1'],
    ]);
  });
});
