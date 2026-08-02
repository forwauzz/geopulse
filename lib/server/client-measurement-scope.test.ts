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
      contextVersion: 'ocv1-safe',
      agencyAccountId: 'lifter',
      enabledPlatforms: ['gemini', 'perplexity'],
    });

    expect(filters).toEqual([
      ['query_set_id', 'source-verified-set'],
      ['metadata->>organization_context_version', 'ocv1-safe'],
      ['agency_account_id', 'lifter'],
    ]);
    expect(isPlatformEnabled({
      querySetId: 'source-verified-set',
      contextVersion: 'ocv1-safe',
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
      contextVersion: 'ocv1-safe',
      startupWorkspaceId: 'workspace-1',
    });
    expect(filters).toEqual([
      ['query_set_id', 'set-1'],
      ['metadata->>organization_context_version', 'ocv1-safe'],
      ['startup_workspace_id', 'workspace-1'],
    ]);
  });
});
