import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import {
  organizationContextContentHash,
  organizationContextVersion,
  type OrganizationContext,
} from '../intelligence/organization-context';
import {
  reconcileConfirmedOrganizationContext,
  recordMaterialOrganizationContextChange,
} from './organization-context-change';

function context(countryCode = 'CA'): OrganizationContext {
  const base = {
    contractVersion: 'organization-context-v1', policyVersion: 'organization-context-precedence-v1',
    contextId: 'context',
    owner: { type: 'startup_workspace', id: '22222222-2222-4222-8222-222222222222' },
    organization: { identityId: '11111111-1111-4111-8111-111111111111', displayName: 'Example', canonicalDomain: 'example.com', aliases: [], category: 'MSP', services: ['managed IT'] },
    market: { scope: 'local', countryCode, subdivisionCode: countryCode === 'CA' ? 'CA-QC' : 'US-NY', locality: countryCode === 'CA' ? 'Montreal' : 'Buffalo', serviceAreas: [], languages: ['en-CA'], timezone: 'America/Toronto', buyer: 'small businesses', approvedCompetitorDomains: [] },
    status: 'confirmed', evidence: [], conflicts: [],
    confirmation: { actorType: 'user', actorId: '33333333-3333-4333-8333-333333333333', confirmedAt: '2026-08-01T00:00:00.000Z' },
    versionReasonCodes: ['tenant_confirmation'], projectedAt: '2026-08-01T00:00:00.000Z',
  };
  const contentHash = organizationContextContentHash({ ...base, projectedAt: undefined });
  return { ...base, contentHash, contextVersion: organizationContextVersion(contentHash) } as OrganizationContext;
}

function supabaseMock() {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const upserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    let action: 'read' | 'update' | 'upsert' = 'read';
    let payload: Record<string, unknown> | null = null;
    const query: any = {
      select: () => query, eq: () => query, in: () => query,
      update: (value: Record<string, unknown>) => { action = 'update'; payload = value; return query; },
      upsert: (value: Record<string, unknown>) => { action = 'upsert'; payload = value; return query; },
      then: (resolve: (value: unknown) => void) => {
        if (action === 'update') {
          updates.push({ table, payload: payload! });
          return resolve({ data: null, error: null });
        }
        if (action === 'upsert') {
          upserts.push({ table, payload: payload! });
          return resolve({ data: null, error: null });
        }
        if (table === 'intelligence_source_identity_maps') return resolve({ data: [{ source_id: 'domain-1' }], error: null });
        if (table === 'client_benchmark_configs') return resolve({
          data: [
            { id: 'config-1', startup_workspace_id: '22222222-2222-4222-8222-222222222222', agency_account_id: null, metadata: {} },
            { id: 'cross-tenant', startup_workspace_id: '99999999-9999-4999-8999-999999999999', agency_account_id: null, metadata: {} },
          ],
          error: null,
        });
        if (table === 'startup_workspace_users') return resolve({
          data: [{ user_id: '33333333-3333-4333-8333-333333333333', role: 'founder' }], error: null,
        });
        return resolve({ data: [], error: null });
      },
    };
    return query;
  });
  return { supabase: { from } as any, from, updates, upserts };
}

describe('organization context material-change persistence', () => {
  it('performs no reads or writes for unchanged facts', async () => {
    const db = supabaseMock();
    const result = await recordMaterialOrganizationContextChange({
      supabase: db.supabase, previous: context(), next: context(),
    });
    expect(result).toEqual({ changed: false, affectedConfigs: 0, reasons: [] });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('blocks only the matching tenant config and opens one bounded user-owned recovery loop', async () => {
    const db = supabaseMock();
    const result = await recordMaterialOrganizationContextChange({
      supabase: db.supabase, previous: context(), next: context('US'),
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    expect(result).toEqual({ changed: true, affectedConfigs: 1, reasons: ['market_changed'] });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({
      table: 'client_benchmark_configs',
      payload: { metadata: { baseline_status: 'queued', report_delivery_state: 'blocked_pending_context_confirmation' } },
    });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({
      table: 'agent_work_loops',
      payload: {
        owner: 'user:33333333-3333-4333-8333-333333333333',
        max_attempts: 3, founder_required: false,
      },
    });
  });

  it('closes confirmation work and keeps delivery paused until a fresh compatible baseline', async () => {
    const db = supabaseMock();
    const result = await reconcileConfirmedOrganizationContext({
      supabase: db.supabase, context: context(), now: new Date('2026-08-02T12:00:00.000Z'),
    });
    expect(result).toEqual({ affectedConfigs: 1, changedConfigs: 1 });
    expect(db.updates[0]).toMatchObject({
      table: 'client_benchmark_configs',
      payload: { metadata: { baseline_status: 'queued', report_delivery_state: 'blocked_pending_fresh_baseline' } },
    });
    expect(db.updates[1]).toMatchObject({
      table: 'agent_work_loops', payload: { state: 'completed', blocker: null },
    });
  });
});
