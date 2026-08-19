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
  kind: 'merge_intent' | 'merged' | 'rollback_intent' | 'rolled_back' | 'acknowledged' | 'feedback';
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
  state: 'pending' | 'leased' | 'merge_pending' | 'awaiting_qa' | 'rollback_pending';
  leaseId: string | null;
  leaseExpiresAt: string | null;
  mergeIntent?: MergeIntent;
  mergeOutcome?: MergeOutcome;
  rollbackIntentDigest?: string;
  rollbackOutcome?: RollbackOutcome;
};

export type MergeIntent = {
  intentDigest: string;
  pullRequestNumber: number;
  issueNumber: number;
  baseSha: string;
  headSha: string;
  patchDigest: string;
  controllerCheckRunId: number;
  requiredCheckRunIds: number[];
};

export type MergeOutcome = {
  mergeSha: string;
  mergeDigest: string;
  integrityFailure?: string;
};

export type RollbackOutcome = {
  rollbackMergeSha: string;
  deploymentId: string;
  versionId: string;
  evidenceDigest: string;
};

export type AuditDisposition = {
  auditRunId: string;
  producer?: RepairScope['producer'];
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
  const baseValid = Number.isInteger(scope.attempt)
    && (scope.attempt ?? 0) >= 1
    && (scope.attempt ?? 0) <= 3
    && Array.isArray(scope.feedback)
    && scope.feedback.length <= 10
    && typeof scope.repositoryProfileDigest === 'string'
    && /^[a-f0-9]{64}$/.test(scope.repositoryProfileDigest)
    && source !== undefined
    && typeof source.checkId === 'string'
    && typeof source.targetUrl === 'string'
    && typeof source.finding === 'string'
    && typeof source.reportedAt === 'string';
  if (!baseValid) return false;
  if (item.state === 'pending' || item.state === 'leased') return true;
  const intent = item.mergeIntent;
  const intentValid = intent !== undefined
    && /^[a-f0-9]{64}$/.test(intent.intentDigest)
    && /^[a-f0-9]{40}$/.test(intent.baseSha)
    && /^[a-f0-9]{40}$/.test(intent.headSha)
    && /^[a-f0-9]{64}$/.test(intent.patchDigest);
  if (!intentValid) return false;
  if (item.state === 'merge_pending') return true;
  const outcome = item.mergeOutcome;
  return outcome !== undefined
    && /^[a-f0-9]{40}$/.test(outcome.mergeSha)
    && /^[a-f0-9]{64}$/.test(outcome.mergeDigest)
    && (item.state !== 'rollback_pending' || /^[a-f0-9]{64}$/.test(item.rollbackIntentDigest ?? ''));
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
    producer: item.scope.producer,
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
    if (!/^[a-f0-9]{64}$/.test(item.scope.repositoryProfileDigest)) {
      throw new Error('scope repository profile digest is invalid');
    }
    if (!item.scope.sourceFinding || typeof item.scope.sourceFinding.checkId !== 'string' || typeof item.scope.sourceFinding.targetUrl !== 'string') {
      throw new Error('scope source finding is incomplete');
    }
    if (item.state === 'leased' && (!item.leaseId || !item.leaseExpiresAt || Number.isNaN(Date.parse(item.leaseExpiresAt)))) {
      throw new Error('leased scope is missing valid lease evidence');
    }
    if (['merge_pending', 'awaiting_qa', 'rollback_pending'].includes(item.state) && (!item.leaseId || item.leaseExpiresAt !== null)) {
      throw new Error('durable repair lifecycle scope is missing stable lease evidence');
    }
    if (item.state === 'pending' && (item.leaseId !== null || item.leaseExpiresAt !== null)) {
      throw new Error('pending scope must not retain a lease');
    }
    if (['merge_pending', 'awaiting_qa', 'rollback_pending'].includes(item.state)) {
      const intent = item.mergeIntent;
      if (!intent || !/^[a-f0-9]{64}$/.test(intent.intentDigest) || !/^[a-f0-9]{40}$/.test(intent.headSha)
        || !/^[a-f0-9]{40}$/.test(intent.baseSha) || !/^[a-f0-9]{64}$/.test(intent.patchDigest)
        || !Number.isSafeInteger(intent.pullRequestNumber) || !Number.isSafeInteger(intent.issueNumber)
        || !Number.isSafeInteger(intent.controllerCheckRunId) || intent.requiredCheckRunIds.some((id) => !Number.isSafeInteger(id))) {
        throw new Error('durable merge intent is invalid');
      }
    }
    if (['awaiting_qa', 'rollback_pending'].includes(item.state)
      && (!item.mergeOutcome || !/^[a-f0-9]{40}$/.test(item.mergeOutcome.mergeSha) || !/^[a-f0-9]{64}$/.test(item.mergeOutcome.mergeDigest))) {
      throw new Error('merged scope is missing durable merge outcome evidence');
    }
    if (item.mergeOutcome?.integrityFailure !== undefined && (item.mergeOutcome.integrityFailure.length < 1 || item.mergeOutcome.integrityFailure.length > 500)) {
      throw new Error('merge integrity failure evidence is invalid');
    }
    if (item.state === 'rollback_pending' && !/^[a-f0-9]{64}$/.test(item.rollbackIntentDigest ?? '')) {
      throw new Error('rollback-pending scope is missing intent evidence');
    }
    if (item.rollbackOutcome && (!/^[a-f0-9]{40}$/.test(item.rollbackOutcome.rollbackMergeSha)
      || !/^[A-Za-z0-9._:-]{1,200}$/.test(item.rollbackOutcome.deploymentId)
      || !/^[A-Za-z0-9._:-]{1,200}$/.test(item.rollbackOutcome.versionId)
      || !/^[a-f0-9]{64}$/.test(item.rollbackOutcome.evidenceDigest))) {
      throw new Error('rollback outcome evidence is invalid');
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
    auditHistory: [{ auditRunId: scope.auditRunId, producer: scope.producer, recordedAt: now, outcome: 'queued' as const, repairId: scope.repairId, reasons: [] }, ...(state.auditHistory ?? [])].slice(0, 50),
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
  if (!item || item.state !== 'awaiting_qa' || item.leaseId !== leaseId || item.scope.attempt !== attempt) throw new Error('scope is not awaiting production QA');
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
    auditHistory: [{ auditRunId: item.scope.auditRunId, producer: item.scope.producer, recordedAt: now, outcome: 'acknowledged' as const, repairId, reasons: [] }, ...(state.auditHistory ?? [])].slice(0, 50),
    scopeTransitions: [transition, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, replayed: false };
}

export function recordRepairMergeIntent(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  intent: MergeIntent,
  now: string
): { state: RepairAgentState; replayed: boolean } {
  validateTransitionInput(attempt, intent.intentDigest);
  const replay = priorTransition(state, 'merge_intent', repairId, attempt, leaseId, intent.intentDigest);
  if (replay) return { state, replayed: true };
  const queue = state.pendingScopes ?? [];
  const index = queue.findIndex((candidate) => candidate.scope.repairId === repairId);
  const item = index >= 0 ? queue[index] : undefined;
  if (!item || item.state !== 'leased' || item.leaseId !== leaseId || item.scope.attempt !== attempt) {
    throw new Error('scope lease does not match merge intent');
  }
  const transition: ScopeTransition = {
    kind: 'merge_intent', repairId, attempt, leaseId, evidenceDigest: intent.intentDigest, recordedAt: now,
    result: { requeued: false, nextAttempt: null, exhausted: false },
  };
  const next: RepairAgentState = {
    ...state,
    pendingScopes: queue.map((candidate, candidateIndex) => candidateIndex === index
      ? { ...candidate, state: 'merge_pending' as const, leaseExpiresAt: null, mergeIntent: structuredClone(intent) }
      : candidate),
    scopeTransitions: [transition, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, replayed: false };
}

export function markRepairScopeMerged(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  mergeOutcome: MergeOutcome,
  now: string
): { state: RepairAgentState; replayed: boolean } {
  validateTransitionInput(attempt, mergeOutcome.mergeDigest);
  if (!/^[a-f0-9]{40}$/.test(mergeOutcome.mergeSha)) throw new Error('merge SHA is invalid');
  const replay = priorTransition(state, 'merged', repairId, attempt, leaseId, mergeOutcome.mergeDigest);
  if (replay) return { state, replayed: true };
  const queue = state.pendingScopes ?? [];
  const index = queue.findIndex((candidate) => candidate.scope.repairId === repairId);
  const item = index >= 0 ? queue[index] : undefined;
  if (!item || item.state !== 'merge_pending' || item.leaseId !== leaseId || item.scope.attempt !== attempt) {
    throw new Error('scope lease does not match merged repair');
  }
  const transition: ScopeTransition = {
    kind: 'merged',
    repairId,
    attempt,
    leaseId,
    evidenceDigest: mergeOutcome.mergeDigest,
    recordedAt: now,
    result: { requeued: false, nextAttempt: null, exhausted: false },
  };
  const next: RepairAgentState = {
    ...state,
    pendingScopes: queue.map((candidate, candidateIndex) => candidateIndex === index
      ? { ...candidate, state: 'awaiting_qa' as const, leaseExpiresAt: null, mergeOutcome: structuredClone(mergeOutcome) }
      : candidate),
    scopeTransitions: [transition, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, replayed: false };
}

export function recordRepairRollbackIntent(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  rollbackIntentDigest: string,
  now: string
): { state: RepairAgentState; replayed: boolean } {
  validateTransitionInput(attempt, rollbackIntentDigest);
  const replay = priorTransition(state, 'rollback_intent', repairId, attempt, leaseId, rollbackIntentDigest);
  if (replay) return { state, replayed: true };
  const queue = state.pendingScopes ?? [];
  const index = queue.findIndex((candidate) => candidate.scope.repairId === repairId);
  const item = index >= 0 ? queue[index] : undefined;
  if (!item || item.state !== 'awaiting_qa' || item.leaseId !== leaseId || item.scope.attempt !== attempt) {
    throw new Error('scope is not awaiting rollback');
  }
  const transition: ScopeTransition = {
    kind: 'rollback_intent', repairId, attempt, leaseId, evidenceDigest: rollbackIntentDigest, recordedAt: now,
    result: { requeued: false, nextAttempt: null, exhausted: false },
  };
  const next: RepairAgentState = {
    ...state,
    pendingScopes: queue.map((candidate, candidateIndex) => candidateIndex === index
      ? { ...candidate, state: 'rollback_pending' as const, rollbackIntentDigest }
      : candidate),
    scopeTransitions: [transition, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, replayed: false };
}

export function recordRepairRolledBack(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  outcome: RollbackOutcome,
  reasons: string[],
  now: string
): { state: RepairAgentState; requeued: boolean; nextAttempt: number | null; exhausted: boolean; replayed: boolean } {
  validateTransitionInput(attempt, outcome.evidenceDigest);
  const replay = priorTransition(state, 'rolled_back', repairId, attempt, leaseId, outcome.evidenceDigest);
  if (replay) return { state, ...replay.result, replayed: true };
  const queue = state.pendingScopes ?? [];
  const index = queue.findIndex((candidate) => candidate.scope.repairId === repairId);
  const item = index >= 0 ? queue[index] : undefined;
  if (!item || item.state !== 'rollback_pending' || item.leaseId !== leaseId || item.scope.attempt !== attempt) {
    throw new Error('scope is not awaiting authenticated rollback evidence');
  }
  const feedback = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))].slice(0, 10);
  if (feedback.length === 0) throw new Error('rolled-back transition requires failure feedback');
  const exhausted = item.scope.attempt >= 3;
  const nextAttempt = exhausted ? null : item.scope.attempt + 1;
  const transition: ScopeTransition = {
    kind: 'rolled_back', repairId, attempt, leaseId, evidenceDigest: outcome.evidenceDigest, recordedAt: now,
    result: { requeued: !exhausted, nextAttempt, exhausted },
  };
  const next: RepairAgentState = {
    ...state,
    pendingScopes: exhausted
      ? queue.filter((_candidate, candidateIndex) => candidateIndex !== index)
      : queue.map((candidate, candidateIndex) => candidateIndex === index
        ? { scope: { ...candidate.scope, attempt: nextAttempt!, feedback }, state: 'pending' as const, leaseId: null, leaseExpiresAt: null, rollbackOutcome: structuredClone(outcome) }
        : candidate),
    auditHistory: [{
      auditRunId: item.scope.auditRunId, producer: item.scope.producer, recordedAt: now,
      outcome: exhausted ? 'exhausted' as const : 'changes_requested' as const, repairId, reasons: feedback,
    }, ...(state.auditHistory ?? [])].slice(0, 50),
    scopeTransitions: [transition, ...(state.scopeTransitions ?? [])].slice(0, 50),
    updatedAt: now,
  };
  validateRepairState(next);
  return { state: next, requeued: !exhausted, nextAttempt, exhausted, replayed: false };
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
      producer: item.scope.producer,
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

export function recordRepairMergeAbort(
  state: RepairAgentState,
  repairId: string,
  attempt: number,
  leaseId: string,
  abortDigest: string,
  reasons: string[],
  now: string
): { state: RepairAgentState; requeued: boolean; nextAttempt: number | null; exhausted: boolean; replayed: boolean } {
  const replay = priorTransition(state, 'feedback', repairId, attempt, leaseId, abortDigest);
  if (replay) return { state, ...replay.result, replayed: true };
  const queue = state.pendingScopes ?? [];
  const index = queue.findIndex((candidate) => candidate.scope.repairId === repairId);
  const item = index >= 0 ? queue[index] : undefined;
  if (!item || item.state !== 'merge_pending' || item.leaseId !== leaseId || item.scope.attempt !== attempt) {
    throw new Error('scope is not awaiting merge reconciliation');
  }
  const leasedState: RepairAgentState = {
    ...state,
    pendingScopes: queue.map((candidate, candidateIndex) => candidateIndex === index
      ? { ...candidate, state: 'leased' as const, leaseExpiresAt: new Date(Date.parse(now) + 15 * 60_000).toISOString() }
      : candidate),
  };
  return recordRepairScopeFeedback(leasedState, repairId, attempt, leaseId, abortDigest, reasons, now);
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
