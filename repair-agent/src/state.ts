import type { EvaluationResult } from './contracts';

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
};

export type RepairAgentState = {
  schemaVersion: 1;
  mode: 'shadow';
  productionMutationsEnabled: false;
  active: ActiveRepair | null;
  recent: CompletedRepair[];
  updatedAt: string | null;
};

export function initialRepairState(): RepairAgentState {
  return {
    schemaVersion: 1,
    mode: 'shadow',
    productionMutationsEnabled: false,
    active: null,
    recent: [],
    updatedAt: null,
  };
}

export function validateRepairState(state: RepairAgentState): void {
  if (state.schemaVersion !== 1 || state.mode !== 'shadow') {
    throw new Error('repair agent state must remain on shadow schema v1');
  }
  if (state.productionMutationsEnabled) throw new Error('production mutations are forbidden');
  if (state.active && state.active.attempts.length > 3) throw new Error('attempt ceiling exceeded');
  if (state.recent.length > 25) throw new Error('recent repair history exceeds retention limit');
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
  now: string
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
  };
  const next: RepairAgentState = {
    ...state,
    active: null,
    recent: [completed, ...state.recent].slice(0, 25),
    updatedAt: now,
  };
  validateRepairState(next);
  return next;
}
