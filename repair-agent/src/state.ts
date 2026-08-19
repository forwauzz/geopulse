import type { EvaluationResult, VerifiedRepairArtifact } from './contracts';
import type { RepairScope } from './loop/contracts';

export type RepairAttemptRecord = {
  attempt: number;
  recordedAt: string;
  outcome: 'passed' | 'failed' | 'execution_error';
  evidenceDigest: string | null;
  reasons: string[];
};

export type ActiveRepair = {
  jobId: string;
  idempotencyKey: string;
  findingId: string;
  workflowId: string | null;
  status: 'queued' | 'running';
  attempts: RepairAttemptRecord[];
};

export type CompletedRepair = {
  jobId: string;
  idempotencyKey: string;
  findingId: string;
  outcome: 'verified_shadow' | 'rejected' | 'blocked';
  completedAt: string;
  attempts: RepairAttemptRecord[];
  evidenceDigest: string | null;
  reasons: string[];
  artifact: VerifiedRepairArtifact | null;
};

export type RepairAgentState = {
  schemaVersion: 1;
  mode: 'shadow';
  productionMutationsEnabled: false;
  active: ActiveRepair | null;
  recent: CompletedRepair[];
  updatedAt: string | null;
  pendingScopes?: QueuedRepairScope[];
  auditHistory?: AuditDisposition[];
};

export type QueuedRepairScope = {
  scope: RepairScope;
  state: 'pending' | 'leased';
  leaseId: string | null;
  leaseExpiresAt: string | null;
};

export type AuditDisposition = {
  auditRunId: string;
  recordedAt: string;
  outcome: 'queued' | 'duplicate' | 'unsupported' | 'rejected' | 'acknowledged';
  repairId: string | null;
  reasons: string[];
};

export function initialRepairState(): RepairAgentState {
  return {
    schemaVersion: 1,
    mode: 'shadow',
    productionMutationsEnabled: false,
    active: null,
    recent: [],
    updatedAt: null,
    pendingScopes: [],
    auditHistory: [],
  };
}

export function validateRepairState(state: RepairAgentState): void {
  if (state.schemaVersion !== 1 || state.mode !== 'shadow') {
    throw new Error('repair agent state must remain on shadow schema v1');
  }
  if (state.productionMutationsEnabled) throw new Error('production mutations are forbidden');
  if (state.active && state.active.attempts.length > 3) throw new Error('attempt ceiling exceeded');
  if (state.recent.length > 25) throw new Error('recent repair history exceeds retention limit');
  if ((state.pendingScopes?.length ?? 0) > 25) throw new Error('pending scope queue exceeds retention limit');
  if ((state.auditHistory?.length ?? 0) > 50) throw new Error('audit history exceeds retention limit');
  const repairIds = (state.pendingScopes ?? []).map((item) => item.scope.repairId);
  if (new Set(repairIds).size !== repairIds.length) throw new Error('pending scope queue contains duplicate repair ids');
  for (const item of state.pendingScopes ?? []) {
    if (item.state === 'leased' && (!item.leaseId || !item.leaseExpiresAt || Number.isNaN(Date.parse(item.leaseExpiresAt)))) {
      throw new Error('leased scope is missing valid lease evidence');
    }
    if (item.state === 'pending' && (item.leaseId !== null || item.leaseExpiresAt !== null)) {
      throw new Error('pending scope must not retain a lease');
    }
  }
}

export function recordAuditDisposition(state: RepairAgentState, disposition: AuditDisposition): RepairAgentState {
  const next = { ...state, auditHistory: [disposition, ...(state.auditHistory ?? [])].slice(0, 50), updatedAt: disposition.recordedAt };
  validateRepairState(next);
  return next;
}

export function enqueueRepairScope(state: RepairAgentState, scope: RepairScope, now: string): RepairAgentState {
  if ((state.pendingScopes ?? []).some((item) => item.scope.repairId === scope.repairId)) return state;
  const next = {
    ...state,
    pendingScopes: [...(state.pendingScopes ?? []), { scope, state: 'pending' as const, leaseId: null, leaseExpiresAt: null }],
    auditHistory: [{ auditRunId: scope.auditRunId, recordedAt: now, outcome: 'queued' as const, repairId: scope.repairId, reasons: [] }, ...(state.auditHistory ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}

export function leaseNextRepairScope(state: RepairAgentState, leaseId: string, nowMs: number, expectedRepairId?: string): { state: RepairAgentState; scope: RepairScope | null } {
  const now = new Date(nowMs).toISOString();
  const queue = (state.pendingScopes ?? []).map((item) => item.state === 'leased' && item.leaseExpiresAt && Date.parse(item.leaseExpiresAt) <= nowMs
    ? { ...item, state: 'pending' as const, leaseId: null, leaseExpiresAt: null }
    : item);
  const existingLease = queue.find((item) => item.state === 'leased' && item.leaseId === leaseId);
  if (existingLease) return { state: { ...state, pendingScopes: queue }, scope: existingLease.scope };
  const index = queue.findIndex((item) => item.state === 'pending' && (!expectedRepairId || item.scope.repairId === expectedRepairId));
  if (index === -1) return { state: { ...state, pendingScopes: queue }, scope: null };
  const item = queue[index]!;
  queue[index] = { ...item, state: 'leased', leaseId, leaseExpiresAt: new Date(nowMs + 15 * 60_000).toISOString() };
  const next = { ...state, pendingScopes: queue, updatedAt: now };
  validateRepairState(next);
  return { state: next, scope: item.scope };
}

export function acknowledgeRepairScope(state: RepairAgentState, repairId: string, leaseId: string, now: string): RepairAgentState {
  const item = (state.pendingScopes ?? []).find((candidate) => candidate.scope.repairId === repairId);
  if (!item || item.state !== 'leased' || item.leaseId !== leaseId) throw new Error('scope lease does not match');
  const next = {
    ...state,
    pendingScopes: (state.pendingScopes ?? []).filter((candidate) => candidate.scope.repairId !== repairId),
    auditHistory: [{ auditRunId: item.scope.auditRunId, recordedAt: now, outcome: 'acknowledged' as const, repairId, reasons: [] }, ...(state.auditHistory ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}

export function beginRepair(
  state: RepairAgentState,
  input: Pick<ActiveRepair, 'jobId' | 'idempotencyKey' | 'findingId'>,
  now: string
): RepairAgentState {
  if (state.active) throw new Error('one repair is already active for this site');
  const next: RepairAgentState = {
    ...state,
    active: { ...input, workflowId: null, status: 'queued', attempts: [] },
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}

export function attachWorkflow(
  state: RepairAgentState,
  jobId: string,
  workflowId: string,
  now: string
): RepairAgentState {
  if (!state.active || state.active.jobId !== jobId) throw new Error('workflow does not belong to active repair');
  const next: RepairAgentState = {
    ...state,
    active: { ...state.active, workflowId, status: 'running' },
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}

export function appendAttempt(
  state: RepairAgentState,
  jobId: string,
  attempt: RepairAttemptRecord,
  now: string
): RepairAgentState {
  const active = state.active;
  if (!active || active.jobId !== jobId) throw new Error('attempt does not belong to active repair');
  if (attempt.attempt !== active.attempts.length + 1 || attempt.attempt > 3) {
    throw new Error('attempt sequence is invalid');
  }
  const next: RepairAgentState = {
    ...state,
    active: { ...active, attempts: [...active.attempts, attempt] },
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}

export function completeRepair(
  state: RepairAgentState,
  jobId: string,
  outcome: CompletedRepair['outcome'],
  evaluation: EvaluationResult | null,
  reasons: string[],
  now: string,
  artifact: VerifiedRepairArtifact | null = null
): RepairAgentState {
  const active = state.active;
  if (!active || active.jobId !== jobId) return state;
  const completed: CompletedRepair = {
    jobId,
    idempotencyKey: active.idempotencyKey,
    findingId: active.findingId,
    outcome,
    completedAt: now,
    attempts: active.attempts,
    evidenceDigest: evaluation?.evidenceDigest ?? active.attempts.at(-1)?.evidenceDigest ?? null,
    reasons: [...new Set(reasons)],
    artifact,
  };
  const next: RepairAgentState = {
    ...state,
    active: null,
    // Keep the newest retrievable artifact only. Historical summaries retain evidence digests,
    // not source bytes, which bounds Durable Object state and keeps /status compact.
    recent: [completed, ...state.recent.map((item) => ({ ...item, artifact: null }))].slice(0, 25),
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}
