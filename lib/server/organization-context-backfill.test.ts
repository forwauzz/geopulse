import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION } from '../intelligence/organization-context-backfill';
import type {
  OrganizationContextBackfillPlan,
  OrganizationContextBackfillSource,
} from '../intelligence/organization-context-backfill';
import type { OrganizationContext } from '../intelligence/organization-context';
import {
  applyOrganizationContextBackfill,
  isOperationsExcludedContextConfig,
  previewOrganizationContextBackfill,
  type OrganizationContextBackfillCheckpoint,
  type OrganizationContextBackfillStore,
} from './organization-context-backfill';

const confirmedContext = {
  contractVersion: 'organization-context-v1', policyVersion: 'organization-context-precedence-v1',
  contextId: 'context', contextVersion: 'ocv1-ready', contentHash: 'fnv1a32:1234abcd',
  owner: { type: 'user', id: '22222222-2222-4222-8222-222222222222' },
  organization: { identityId: '11111111-1111-4111-8111-111111111111', displayName: 'Example', canonicalDomain: 'example.com', aliases: [], category: 'MSP', services: ['managed IT'] },
  market: { scope: 'local', countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal', serviceAreas: ['Montreal'], languages: ['en-CA'], timezone: 'America/Toronto', buyer: 'small businesses', approvedCompetitorDomains: [] },
  status: 'confirmed', evidence: [], conflicts: [],
  confirmation: { actorType: 'user', actorId: '22222222-2222-4222-8222-222222222222', confirmedAt: '2026-08-01T00:00:00.000Z' },
  versionReasonCodes: ['tenant_confirmation'], projectedAt: '2026-08-01T00:00:00.000Z',
} as OrganizationContext;

function source(configId: string, ready = true): OrganizationContextBackfillSource {
  return {
    configId, ownerType: 'user', ownerId: confirmedContext.owner.id,
    domainId: confirmedContext.organization.identityId, mappingStatus: 'mapped',
    lookup: ready ? { status: 'ready', context: confirmedContext } : { status: 'needs_review', reason: 'country_code_missing' },
    previousContext: ready ? confirmedContext : null, routedUserId: confirmedContext.owner.id,
    alreadyAppliedVersion: null,
  };
}

function memoryStore(sources: readonly OrganizationContextBackfillSource[]) {
  let checkpoint: OrganizationContextBackfillCheckpoint | null = null;
  const applyReady = vi.fn(async (_plan: OrganizationContextBackfillPlan, _now: string) => true);
  const applyUnresolved = vi.fn(async (_plan: OrganizationContextBackfillPlan, _now: string) => true);
  const writeCheckpoint = vi.fn(async (args: { lastSourceKey: string | null; status: OrganizationContextBackfillCheckpoint['status'] }) => {
    checkpoint = { lastSourceKey: args.lastSourceKey, status: args.status };
  });
  const store: OrganizationContextBackfillStore = {
    listSources: vi.fn(async ({ afterConfigId, limit }) => sources
      .filter((item) => !afterConfigId || item.configId.localeCompare(afterConfigId) > 0)
      .slice(0, limit)),
    readCheckpoint: vi.fn(async () => checkpoint),
    applyReady,
    applyUnresolved,
    writeCheckpoint,
  };
  return { store, applyReady, applyUnresolved, writeCheckpoint, checkpoint: () => checkpoint };
}

describe('organization context backfill workflow', () => {
  it('treats only an explicit operations exclusion as terminal', () => {
    expect(isOperationsExcludedContextConfig({ operations_excluded: true })).toBe(true);
    expect(isOperationsExcludedContextConfig({ operations_excluded: false })).toBe(false);
    expect(isOperationsExcludedContextConfig({ operations_excluded_reason: 'fixture' })).toBe(false);
  });

  it('previews every record without calling any write method', async () => {
    const memory = memoryStore([source('a'), source('b', false)]);
    const result = await previewOrganizationContextBackfill({ store: memory.store, pageSize: 1 });
    expect(result.summary).toEqual({ total: 2, ready: 1, ambiguous: 1, conflicted: 0, unmapped: 0 });
    expect(memory.applyReady).not.toHaveBeenCalled();
    expect(memory.applyUnresolved).not.toHaveBeenCalled();
    expect(memory.writeCheckpoint).not.toHaveBeenCalled();
  });

  it('requires exact confirmation and is idempotent after a completed checkpoint', async () => {
    const memory = memoryStore([source('a'), source('b', false)]);
    await expect(applyOrganizationContextBackfill({ store: memory.store, confirmation: 'yes' }))
      .rejects.toThrow(ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION);
    const first = await applyOrganizationContextBackfill({
      store: memory.store, confirmation: ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION,
    });
    expect(first).toMatchObject({ changed: 2, status: 'needs_review' });
    expect(memory.applyReady).toHaveBeenCalledTimes(1);
    expect(memory.applyUnresolved).toHaveBeenCalledTimes(1);
    const second = await applyOrganizationContextBackfill({
      store: memory.store, confirmation: ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION,
    });
    expect(second.changed).toBe(0);
    expect(memory.applyReady).toHaveBeenCalledTimes(1);
    expect(memory.applyUnresolved).toHaveBeenCalledTimes(1);
  });

  it('restarts after the last evidence-backed checkpoint instead of repeating prior writes', async () => {
    const memory = memoryStore([source('a'), source('b'), source('c')]);
    memory.applyReady.mockImplementationOnce(async () => true).mockImplementationOnce(async () => {
      throw new Error('transient_write_failure');
    });
    await expect(applyOrganizationContextBackfill({
      store: memory.store, confirmation: ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION,
    })).rejects.toThrow('transient_write_failure');
    expect(memory.checkpoint()).toEqual({ lastSourceKey: 'a', status: 'running' });
    memory.applyReady.mockImplementation(async () => true);
    const resumed = await applyOrganizationContextBackfill({
      store: memory.store, confirmation: ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION,
    });
    expect(resumed.resumedAfter).toBe('a');
    expect(memory.applyReady.mock.calls.map((call) => call[0].configId)).toEqual(['a', 'b', 'b', 'c']);
  });
});
