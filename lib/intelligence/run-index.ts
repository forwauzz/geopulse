import { createHash } from 'node:crypto';

export const RUN_INDEX_CONTRACT_VERSION = 'run-index-v1';

export type RunVisibility = 'tenant' | 'internal' | 'shared';

export type RunIndexCandidate = {
  readonly sourceKind: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly parentSourceKind?: string | null;
  readonly parentSourceId?: string | null;
  readonly identitySourceKind?: string | null;
  readonly identitySourceId?: string | null;
  readonly laneSourceKind?: string | null;
  readonly laneSourceId?: string | null;
  readonly sourceStatus: string | null;
  readonly qualityState: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly observedAt: string | null;
  readonly provider: string | null;
  readonly modelId: string | null;
  readonly runMode: string | null;
  readonly versions: Readonly<Record<string, string | null>>;
  readonly artifactRef: string | null;
  readonly tenantType: string | null;
  readonly tenantId: string | null;
  readonly visibility: RunVisibility;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export function runSourceKey(candidate: Pick<RunIndexCandidate, 'sourceKind' | 'sourceId'>): string {
  return `${candidate.sourceKind}:${candidate.sourceId}`;
}

export function runSourceSnapshot(candidate: RunIndexCandidate): string {
  const payload = {
    sourceKind: candidate.sourceKind,
    sourceTable: candidate.sourceTable,
    sourceId: candidate.sourceId,
    sourceStatus: candidate.sourceStatus,
    startedAt: candidate.startedAt,
    completedAt: candidate.completedAt,
    observedAt: candidate.observedAt,
    provider: candidate.provider,
    modelId: candidate.modelId,
    runMode: candidate.runMode,
    versions: Object.fromEntries(Object.entries(candidate.versions).sort(([a], [b]) => a.localeCompare(b))),
    artifactRef: candidate.artifactRef,
    tenantType: candidate.tenantType,
    tenantId: candidate.tenantId,
    visibility: candidate.visibility,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export type RunIndexValidation = {
  readonly duplicates: readonly string[];
  readonly missingParents: readonly string[];
  readonly unsupported: readonly string[];
};

export function validateRunIndexCandidates(
  candidates: readonly RunIndexCandidate[]
): RunIndexValidation {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const sourceKeys = new Set(candidates.map(runSourceKey));
  const missingParents = new Set<string>();
  const unsupported = new Set<string>();

  for (const candidate of candidates) {
    const key = runSourceKey(candidate);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    if (!candidate.sourceKind || !candidate.sourceTable || !candidate.sourceId) unsupported.add(key);
    if (candidate.parentSourceKind && candidate.parentSourceId) {
      const parentKey = `${candidate.parentSourceKind}:${candidate.parentSourceId}`;
      if (!sourceKeys.has(parentKey)) missingParents.add(`${key}->${parentKey}`);
    }
  }
  return {
    duplicates: [...duplicates].sort(),
    missingParents: [...missingParents].sort(),
    unsupported: [...unsupported].sort(),
  };
}

export function classifyScanSource(runSource: string | null | undefined): string {
  switch (runSource) {
    case 'public_self_serve': return 'free_scan';
    case 'agency_dashboard': return 'agency_scan';
    case 'startup_dashboard': return 'startup_scan';
    case 'admin_manual': return 'admin_scan';
    case 'recurring': return 'recurring_scan';
    case 'internal_benchmark': return 'competitor_scan';
    default: return 'scan_unknown';
  }
}
