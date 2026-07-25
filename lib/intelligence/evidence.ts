import { createHash } from 'node:crypto';

export const EVIDENCE_CATALOG_CONTRACT_VERSION = 'evidence-catalog-v1';

export type EvidenceObjectClass =
  | 'original'
  | 'extracted'
  | 'parsed'
  | 'computed'
  | 'generated';

export type EvidenceStorageKind =
  | 'postgres_source'
  | 'postgres_inline'
  | 'r2'
  | 'external'
  | 'missing';

export type EvidencePrivacy = 'private_tenant' | 'internal' | 'shared' | 'public';
export type EvidenceStatus = 'present' | 'missing' | 'unverified';

export type EvidenceCandidate = {
  readonly sourceKind: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly evidenceKind: string;
  readonly objectClass: EvidenceObjectClass;
  readonly storageKind: EvidenceStorageKind;
  readonly status: EvidenceStatus;
  readonly content?: string | null;
  readonly artifactRef?: string | null;
  readonly parentSourceKind?: string | null;
  readonly parentSourceId?: string | null;
  readonly collectedAt?: string | null;
  readonly sourceCreatedAt?: string | null;
  readonly parserVersion?: string | null;
  readonly extractorVersion?: string | null;
  readonly privacy: EvidencePrivacy;
  readonly tenantType?: string | null;
  readonly tenantId?: string | null;
  readonly retentionClass: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function evidenceSourceKey(
  candidate: Pick<EvidenceCandidate, 'sourceKind' | 'sourceId' | 'evidenceKind'>
): string {
  return `${candidate.sourceKind}:${candidate.sourceId}:${candidate.evidenceKind}`;
}

export function stableEvidenceId(
  candidate: Pick<EvidenceCandidate, 'sourceKind' | 'sourceId' | 'evidenceKind'>
): string {
  return `ev_${digest(evidenceSourceKey(candidate)).slice(0, 40)}`;
}

export function evidenceContentHash(content: string | null | undefined): string | null {
  return typeof content === 'string' ? digest(content) : null;
}

export type EvidenceAccessContext = {
  readonly isPlatformAdmin?: boolean;
  readonly tenantType?: string | null;
  readonly tenantId?: string | null;
};

export function canAccessEvidence(
  evidence: Pick<EvidenceCandidate, 'privacy' | 'tenantType' | 'tenantId'>,
  context: EvidenceAccessContext
): boolean {
  if (context.isPlatformAdmin) return true;
  if (evidence.privacy === 'public' || evidence.privacy === 'shared') return true;
  if (evidence.privacy === 'internal') return false;
  return Boolean(
    evidence.tenantType &&
    evidence.tenantId &&
    evidence.tenantType === context.tenantType &&
    evidence.tenantId === context.tenantId
  );
}

export type EvidenceValidation = {
  readonly duplicates: readonly string[];
  readonly invalid: readonly string[];
};

export function validateEvidenceCandidates(
  candidates: readonly EvidenceCandidate[]
): EvidenceValidation {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const invalid = new Set<string>();
  for (const candidate of candidates) {
    const key = evidenceSourceKey(candidate);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    const hasTenant = Boolean(candidate.tenantType && candidate.tenantId);
    if (candidate.privacy === 'private_tenant' && !hasTenant) invalid.add(`${key}:tenant`);
    if (candidate.status === 'missing' && candidate.storageKind !== 'missing') invalid.add(`${key}:missing`);
    if (candidate.storageKind === 'missing' && candidate.status !== 'missing') invalid.add(`${key}:status`);
    if (candidate.storageKind === 'r2' && !candidate.artifactRef) invalid.add(`${key}:artifact`);
  }
  return { duplicates: [...duplicates].sort(), invalid: [...invalid].sort() };
}
