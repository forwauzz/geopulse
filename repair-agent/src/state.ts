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
  scopeTransitions?: ScopeTransition[];
};

export type ScopeTransition = {
  kind: 'acknowledged' | 'feedback';
  repairId: string;
  attempt: number;
  leaseId: string;
  evidenceDigest: string;
  recordedAt: string;
  result: {
    requeued: boolean;
    nextAttempt: number | null;
    exhausted: boolean;
  };
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
  outcome: 'queued' | 'duplicate' | 'unsupported' | 'rejected' | 'changes_requested' | 'exhausted' | 'acknowledged';
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
    scopeTransitions: [],
  };
}

function currentScope(item: QueuedRepairScope): boolean {
  const scope = item.scope as Partial<RepairScope>;
  const source = scope.sourceFinding as Partial<RepairScope['sourceFinding']> | undefined;
  return Number.isInteger(scope.attempt)
    && (scope.attempt ?? 0) >= 1
    && (scope.attempt ?? 0) <= 3
    && Array.isArray(scope.feedback)
    && scope.feedback.length <= 10
    && source !== undefined
    && typeof source.checkId === 'string'
    && typeof source.targetUrl === 'string'
    && typeof source.finding === 'string'
    && typeof source.reportedAt === 'string';
}

export function normalizeRepairState(state: RepairAgentState, now: string): RepairAgentState {
  const queue = state.pendingScopes ?? [];
  const retained = queue.filter(currentScope);
  const quarantined = queue.filter((item) => !currentScope(item));
  const recent = (state.recent ?? []).map((item) => ({ ...item, artifact: item.artifact ?? null }));
  const needsNormalization = state.pendingScopes === undefined
    || state.auditHistory === undefined
    || state.scopeTransitions === undefined
    || retained.length !== queue.length
    || recent.some((item, index) => item.artifact !== state.recent?.[index]?.artifact);
  if (!needsNormalization) return state;
  const quarantineEvents: AuditDisposition[] = quarantined.map((item) => ({
    auditRunId: item.scope.auditRunId,
    recordedAt: now,
    outcome: 'rejected',
    repairId: item.scope.repairId,
    reasons: ['legacy repair scope quarantined; a fresh provenance-complete audit is required'],
  }));
  const normalized: RepairAgentState = {
    ...state,
    active: state.active ?? null,
    recent,
    pendingScopes: retained,
    auditHistory: [...quarantineEvents, ...(state.auditHistory ?? [])].slice(0, 50),
    scopeTransitions: state.scopeTransitions ?? [],
    updatedAt: quarantined.length > 0 ? now : state.updatedAt ?? null,
  };
  validateRepairState(normalized);
  return normalized;
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
  if ((state.scopeTransitions?.length ?? 0) > 50) throw new Error('scope transition history exceeds retention limit');
  const repairIds = (state.pendingScopes ?? []).map((item) => item.scope.repairId);
  if (new Set(repairIds).size !== repairIds.length) throw new Error('pending scope queue contains duplicate repair ids');
  for (const item of state.pendingScopes ?? []) {
    if (!Number.isInteger(item.scope.attempt) || item.scope.attempt < 1 || item.scope.attempt > 3) {
      throw new Error('scope attempt is outside the retry ceiling');
    }
    if (!Array.isArray(item.scope.feedback) || item.scope.feedback.length > 10) {
      throw new Error('scope feedback exceeds its bounded contract');
    }
    if (!item.scope.sourceFinding || typeof item.scope.sourceFinding.checkId !== 'string' || typeof item.scope.sourceFinding.targetUrl !== 'string') {
      throw new Error('scope source finding is incomplete');
    }
    if (item.state === 'leased' && (!item.leaseId || !item.leaseExpiresAt || Number.isNaN(Date.parse(item.leaseExpiresAt)))) {
      throw new Error('leased scope is missing valid lease evidence');
    }
    if (item.state === 'pending' && (item.leaseId !== null || item.leaseExpiresAt !== null)) {
      throw new Error('pending scope must not retain a lease');
    }
  }
}

function validateTransitionInput(attempt: number, evidenceDigest: string): void {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('scope transition attempt is invalid');
  if (!/^[a-f0-9]{64}$/.test(evidenceDigest)) throw new Error('scope transition evidence digest is invalid');
}

function priorTransition(
  state: RepairAgentState,
  kind: ScopeTransition['kind'],
  repairId: string,
  attempt: number,
  leaseId: string,
  evidenceDigest: string
): ScopeTransition | null {
  const prior = (state.scopeTransitions ?? []).find((transition) => transition.kind === kind
    && transition.repairId === repairId
    && transition.attempt === attempt
    && transition.leaseId === leaseId);
  if (!prior) return null;
  if (prior.evidenceDigest !== evidenceDigest) throw new Error('scope transition evidence digest does not match prior commit');
  return prior;
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

export function acknowledgeRepairScope(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  gateDigest: string,
  now: string
): { state: RepairAgentState; replayed: boolean } {
  validateTransitionInput(attempt, gateDigest);
  const replay = priorTransition(state, 'acknowledged', repairId, attempt, leaseId, gateDigest);
  if (replay) return { state, replayed: true };
  const item = (state.pendingScopes ?? []).find((candidate) => candidate.scope.repairId === repairId);
  if (!item || item.state !== 'leased' || item.leaseId !== leaseId || item.scope.attempt !== attempt) throw new Error('scope lease does not match');
  const transition: ScopeTransition = {
    kind: 'acknowledged',
    repairId,
    attempt,
    leaseId,
    evidenceDigest: gateDigest,
    recordedAt: now,
    result: { requeued: false, nextAttempt: null, exhausted: false },
  };
  const next = {
    ...state,
    pendingScopes: (state.pendingScopes ?? []).filter((candidate) => candidate.scope.repairId !== repairId),
    auditHistory: [{ auditRunId: item.scope.auditRunId, recordedAt: now, outcome: 'acknowledged' as const, repairId, reasons: [] }, ...(state.auditHistory ?? [])].slice(0, 50),
    scopeTransitions: [transition, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, replayed: false };
}

export function recordRepairScopeFeedback(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  feedbackDigest: string,
  reasons: string[],
  now: string
): { state: RepairAgentState; requeued: boolean; nextAttempt: number | null; exhausted: boolean; replayed: boolean } {
  validateTransitionInput(attempt, feedbackDigest);
  const replay = priorTransition(state, 'feedback', repairId, attempt, leaseId, feedbackDigest);
  if (replay) return { state, ...replay.result, replayed: true };
  const queue = state.pendingScopes ?? [];
  const index = queue.findIndex((candidate) => candidate.scope.repairId === repairId);
  const item = index >= 0 ? queue[index] : undefined;
  if (!item || item.state !== 'leased' || item.leaseId !== leaseId || item.scope.attempt !== attempt) throw new Error('scope lease does not match');
  const feedback = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))].slice(0, 10);
  if (feedback.length === 0) throw new Error('scope feedback requires at least one reason');
  const exhausted = item.scope.attempt >= 3;
  const nextAttempt = exhausted ? null : item.scope.attempt + 1;
  const nextQueue = exhausted
    ? queue.filter((candidate) => candidate.scope.repairId !== repairId)
    : queue.map((candidate, candidateIndex) => candidateIndex === index
      ? {
          scope: { ...candidate.scope, attempt: nextAttempt!, feedback },
          state: 'pending' as const,
          leaseId: null,
          leaseExpiresAt: null,
        }
      : candidate);
  const next: RepairAgentState = {
    ...state,
    pendingScopes: nextQueue,
    auditHistory: [{
      auditRunId: item.scope.auditRunId,
      recordedAt: now,
      outcome: exhausted ? 'exhausted' as const : 'changes_requested' as const,
      repairId,
      reasons: feedback,
    }, ...(state.auditHistory ?? [])].slice(0, 50),
    scopeTransitions: [{
      kind: 'feedback' as const,
      repairId,
      attempt,
      leaseId,
      evidenceDigest: feedbackDigest,
      recordedAt: now,
      result: { requeued: !exhausted, nextAttempt, exhausted },
    }, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, requeued: !exhausted, nextAttempt, exhausted, replayed: false };
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
