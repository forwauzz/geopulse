import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buyerIntelligenceSnapshotSchema,
  type BuyerIntelligenceSnapshot,
} from '../intelligence/buyer-intelligence-contract';
import { structuredLogWithClientAndWait } from './structured-log';

type SnapshotOwner = BuyerIntelligenceSnapshot['owner'];

type SnapshotRow = {
  readonly snapshot_id: string;
  readonly contract_version: string;
  readonly owner_type: SnapshotOwner['type'];
  readonly owner_id: string | null;
  readonly organization_identity_id: string;
  readonly context_id: string;
  readonly context_version: string;
  readonly context_hash: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly previous_snapshot_id: string | null;
  readonly input_fingerprint: string;
  readonly report_eligibility: BuyerIntelligenceSnapshot['reportEligibility']['state'];
  readonly evidence_ids: string[];
  readonly run_ids: string[];
  readonly snapshot: unknown;
};

type SnapshotPersistence = {
  find(snapshotId: string, owner: SnapshotOwner): Promise<SnapshotRow | null>;
  insert(row: SnapshotRow): Promise<void>;
};

export class BuyerIntelligenceSnapshotConflictError extends Error {
  constructor(snapshotId: string) {
    super(`buyer_intelligence_snapshot_conflict:${snapshotId}`);
    this.name = 'BuyerIntelligenceSnapshotConflictError';
  }
}

function toRow(snapshot: BuyerIntelligenceSnapshot): SnapshotRow {
  return {
    snapshot_id: snapshot.snapshotId,
    contract_version: snapshot.contractVersion,
    owner_type: snapshot.owner.type,
    owner_id: snapshot.owner.id,
    organization_identity_id: snapshot.organization.identityId,
    context_id: snapshot.organization.contextId,
    context_version: snapshot.organization.contextVersion,
    context_hash: snapshot.organization.contextHash,
    period_start: snapshot.period.start,
    period_end: snapshot.period.end,
    previous_snapshot_id: snapshot.period.previousSnapshotId,
    input_fingerprint: snapshot.provenance.inputFingerprint,
    report_eligibility: snapshot.reportEligibility.state,
    evidence_ids: snapshot.provenance.evidenceIds,
    run_ids: snapshot.provenance.runIds,
    snapshot,
  };
}

function readRow(row: SnapshotRow): BuyerIntelligenceSnapshot {
  const snapshot = buyerIntelligenceSnapshotSchema.parse(row.snapshot);
  const expected = toRow(snapshot);
  const scalarKeys: (keyof SnapshotRow)[] = [
    'snapshot_id', 'contract_version', 'owner_type', 'owner_id',
    'organization_identity_id', 'context_id', 'context_version', 'context_hash',
    'previous_snapshot_id', 'input_fingerprint', 'report_eligibility',
  ];
  if (scalarKeys.some((key) => row[key] !== expected[key])) {
    throw new Error(`buyer_intelligence_snapshot_corrupt:${row.snapshot_id}`);
  }
  if (Date.parse(row.period_start) !== Date.parse(expected.period_start)
    || Date.parse(row.period_end) !== Date.parse(expected.period_end)) {
    throw new Error(`buyer_intelligence_snapshot_corrupt:${row.snapshot_id}`);
  }
  if (JSON.stringify(row.evidence_ids) !== JSON.stringify(expected.evidence_ids)
    || JSON.stringify(row.run_ids) !== JSON.stringify(expected.run_ids)) {
    throw new Error(`buyer_intelligence_snapshot_corrupt:${row.snapshot_id}`);
  }
  return snapshot;
}

function sameSnapshot(left: BuyerIntelligenceSnapshot, right: BuyerIntelligenceSnapshot): boolean {
  return left.provenance.inputFingerprint === right.provenance.inputFingerprint
    && JSON.stringify(left) === JSON.stringify(right);
}

export function createBuyerIntelligenceSnapshotRepositoryFromPersistence(
  persistence: SnapshotPersistence,
  auditConflict: (snapshot: BuyerIntelligenceSnapshot) => Promise<void> = async () => undefined,
) {
  return {
    async load(snapshotId: string, owner: SnapshotOwner): Promise<BuyerIntelligenceSnapshot | null> {
      const row = await persistence.find(snapshotId, owner);
      if (!row) return null;
      const snapshot = readRow(row);
      if (snapshot.owner.type !== owner.type || snapshot.owner.id !== owner.id) {
        throw new Error(`buyer_intelligence_snapshot_owner_mismatch:${snapshotId}`);
      }
      return snapshot;
    },

    async store(input: BuyerIntelligenceSnapshot): Promise<{ snapshot: BuyerIntelligenceSnapshot; created: boolean }> {
      const snapshot = buyerIntelligenceSnapshotSchema.parse(input);
      const existing = await persistence.find(snapshot.snapshotId, snapshot.owner);
      if (existing) {
        const stored = readRow(existing);
        if (sameSnapshot(stored, snapshot)) return { snapshot: stored, created: false };
        await auditConflict(snapshot);
        throw new BuyerIntelligenceSnapshotConflictError(snapshot.snapshotId);
      }

      try {
        await persistence.insert(toRow(snapshot));
        return { snapshot, created: true };
      } catch (error) {
        const raced = await persistence.find(snapshot.snapshotId, snapshot.owner);
        if (raced) {
          const stored = readRow(raced);
          if (sameSnapshot(stored, snapshot)) return { snapshot: stored, created: false };
          await auditConflict(snapshot);
          throw new BuyerIntelligenceSnapshotConflictError(snapshot.snapshotId);
        }
        throw error;
      }
    },
  };
}

export function createBuyerIntelligenceSnapshotRepository(
  supabase: SupabaseClient<any, 'public', any>,
) {
  const persistence: SnapshotPersistence = {
    async find(snapshotId, owner) {
      let query = supabase
        .from('buyer_intelligence_snapshots')
        .select('*')
        .eq('snapshot_id', snapshotId)
        .eq('owner_type', owner.type);
      query = owner.id === null ? query.is('owner_id', null) : query.eq('owner_id', owner.id);
      const { data, error } = await query.maybeSingle<SnapshotRow>();
      if (error) throw error;
      return data ?? null;
    },
    async insert(row) {
      const { error } = await supabase.from('buyer_intelligence_snapshots').insert(row);
      if (error) throw error;
    },
  };
  return createBuyerIntelligenceSnapshotRepositoryFromPersistence(
    persistence,
    async (snapshot) => structuredLogWithClientAndWait(supabase, 'buyer_intelligence_snapshot_conflict', {
      snapshot_id: snapshot.snapshotId,
      owner_type: snapshot.owner.type,
      owner_id: snapshot.owner.id,
      input_fingerprint: snapshot.provenance.inputFingerprint,
    }, 'error'),
  );
}
