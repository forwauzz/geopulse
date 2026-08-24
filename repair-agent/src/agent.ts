import { Agent } from 'agents';
import type { EvaluationResult, RepairRequest, VerifiedRepairArtifact } from './contracts';
import { parseRepairRequest } from './contracts';
import type { RepairWorkerEnv } from './env';
import { admitRepair, policyConfigFromEnv } from './policy';
import { parseAuditEnvelope, selectAuditFinding } from './loop/audit-intake';
import type { RepairScope } from './loop/contracts';
import { INSTALLED_PROFILE_REGISTRY } from './loop/profile-registry';
import { scopeRepair } from './loop/scoper';
import {
  acknowledgeRepairScope,
  appendAttempt,
  attachWorkflow,
  beginRepair,
  completeRepair,
  enqueueRepairScope,
  initialRepairState,
  leaseNextRepairScope,
  markRepairScopeMerged,
  recordRepairMergeIntent,
  recordRepairMergeAbort,
  recordRepairRollbackIntent,
  recordRepairRolledBack,
  recordAuditDisposition,
  recordRepairScopeFeedback,
  recordSatisfiedRepairScope,
  normalizeRepairState,
  validateRepairState,
  type CompletedRepair,
  type RepairAgentState,
  type RepairAttemptRecord,
  type MergeIntent,
  type MergeOutcome,
  type RollbackOutcome,
} from './state';
export type { RepairAgentState } from './state';

export type SubmitRepairResult =
  | { accepted: true; duplicate: boolean; jobId: string; workflowId: string | null }
  | { accepted: false; reasons: string[] };

export type SubmitAuditResult =
  | { accepted: true; queued: true; repairId: string }
  | { accepted: true; queued: false; repairId: null; reasons: string[] }
  | { accepted: false; reasons: string[] };

async function stableJobId(idempotencyKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idempotencyKey));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export class RepairAgent extends Agent<RepairWorkerEnv, RepairAgentState> {
  initialState: RepairAgentState = initialRepairState();

  async onStart(): Promise<void> {
    const normalized = normalizeRepairState(this.state, new Date().toISOString());
    if (normalized !== this.state) this.setState(normalized);
  }

  validateStateChange(nextState: RepairAgentState): void {
    validateRepairState(nextState);
  }

  async submitRepair(raw: unknown): Promise<SubmitRepairResult> {
    const parsed = parseRepairRequest(raw);
    if (!parsed.ok) return { accepted: false, reasons: [parsed.reason] };
    const request = parsed.request;
    const admission = admitRepair(request, policyConfigFromEnv(this.env));
    if (!admission.admitted) return { accepted: false, reasons: admission.reasons };

    const existing = this.state.active;
    if (existing?.idempotencyKey === request.idempotencyKey) {
      return { accepted: true, duplicate: true, jobId: existing.jobId, workflowId: existing.workflowId };
    }
    const completed = this.state.recent.find((item) => item.idempotencyKey === request.idempotencyKey);
    if (completed) {
      return { accepted: true, duplicate: true, jobId: completed.jobId, workflowId: null };
    }
    if (existing) return { accepted: false, reasons: ['one repair is already active for this site'] };

    const jobId = await stableJobId(request.idempotencyKey);
    this.setState(beginRepair(this.state, {
      jobId,
      idempotencyKey: request.idempotencyKey,
      findingId: request.finding.findingId,
    }, new Date().toISOString()));

    try {
      const workflowId = await this.runWorkflow(
        'REPAIR_WORKFLOW',
        { jobId, request } satisfies RepairWorkflowParams,
        {
          id: `repair-${jobId}`,
          agentBinding: 'REPAIR_AGENT',
          retention: { successRetention: '7 days', errorRetention: '30 days' },
        }
      );
      if (this.state.active?.jobId === jobId) {
        this.setState(attachWorkflow(this.state, jobId, workflowId, new Date().toISOString()));
      }
      return { accepted: true, duplicate: false, jobId, workflowId };
    } catch (error) {
      await this.finishRepair(jobId, 'blocked', null, [
        error instanceof Error ? error.message : 'workflow launch failed',
      ]);
      return { accepted: false, reasons: ['workflow launch failed closed'] };
    }
  }

  async recordAttempt(jobId: string, attempt: RepairAttemptRecord): Promise<void> {
    this.setState(appendAttempt(this.state, jobId, attempt, new Date().toISOString()));
  }

  async finishRepair(
    jobId: string,
    outcome: CompletedRepair['outcome'],
    evaluation: EvaluationResult | null,
    reasons: string[],
    artifact: VerifiedRepairArtifact | null = null
  ): Promise<void> {
    const active = this.state.active;
    if (!active || active.jobId !== jobId) return;
    this.setState(completeRepair(
      this.state,
      jobId,
      outcome,
      evaluation,
      reasons,
      new Date().toISOString(),
      artifact
    ));
  }

  async getSnapshot(): Promise<RepairAgentState> {
    return structuredClone({
      ...this.state,
      pendingScopes: this.state.pendingScopes ?? [],
      auditHistory: this.state.auditHistory ?? [],
      recent: this.state.recent.map((item) => ({ ...item, artifact: null })),
    });
  }

  async submitAudit(raw: unknown, authority: 'internal-scheduler' | 'external-canary'): Promise<SubmitAuditResult> {
    const parsed = parseAuditEnvelope(raw);
    if (!parsed.ok) return { accepted: false, reasons: [parsed.reason] };
    const envelope = parsed.envelope;
    const internalProducer = envelope.producer === 'canonical-cloudflare-scheduler'
      || envelope.producer === 'canonical-cloudflare-admin'
      || envelope.producer === 'canonical-cloudflare-ci';
    if (authority === 'internal-scheduler' && !internalProducer) {
      return { accepted: false, reasons: ['internal audit producer identity does not match'] };
    }
    if (authority === 'external-canary' && envelope.producer !== 'github-shadow-canary') {
      return { accepted: false, reasons: ['external audit producer is restricted to shadow canaries'] };
    }
    const resolvedProfile = await INSTALLED_PROFILE_REGISTRY.resolve({
      profileId: envelope.repositoryProfileId,
      authority,
      targetUrl: envelope.targetUrl,
    });
    if (!resolvedProfile) return { accepted: false, reasons: ['repository profile is not installed for this producer and target'] };
    const { profile, digest: profileDigest } = resolvedProfile;
    const seen = new Set((this.state.auditHistory ?? []).map((item) => item.auditRunId));
    if (seen.has(envelope.auditRunId)) {
      const existing = (this.state.auditHistory ?? []).find((item) => item.auditRunId === envelope.auditRunId);
      if (existing?.outcome === 'satisfied'
        || (existing?.outcome === 'duplicate' && existing.reasons.some((reason) => reason.includes('already satisfied')))) {
        return { accepted: true, queued: false, repairId: null, reasons: ['audit finding is already satisfied'] };
      }
      return existing?.repairId
        ? { accepted: true, queued: true, repairId: existing.repairId }
        : { accepted: true, queued: false, repairId: null, reasons: ['audit run was already consumed'] };
    }
    const decision = selectAuditFinding({ envelope, profile, seenAuditRunIds: seen, nowMs: Date.now() });
    const now = new Date().toISOString();
    if (!decision.accepted) {
      this.setState(recordAuditDisposition(this.state, {
        auditRunId: envelope.auditRunId,
        producer: envelope.producer,
        recordedAt: now,
        outcome: decision.reasons.includes('no eligible supported finding') ? 'unsupported' : 'rejected',
        repairId: null,
        reasons: decision.reasons,
      }));
      return { accepted: true, queued: false, repairId: null, reasons: decision.reasons };
    }
    const scope = await scopeRepair({ envelope, finding: decision.finding, profile, profileDigest, nowMs: Date.now() });
    const pending = (this.state.pendingScopes ?? []).find((item) => item.scope.repairId === scope.repairId);
    if (pending) {
      this.setState(recordAuditDisposition(this.state, {
        auditRunId: envelope.auditRunId,
        producer: envelope.producer,
        recordedAt: now,
        outcome: 'duplicate',
        repairId: scope.repairId,
        reasons: ['same repair defect is already pending'],
      }));
      return { accepted: true, queued: true, repairId: scope.repairId };
    }
    if ((this.state.exhaustedRepairIds ?? []).includes(scope.repairId)) {
      const reasons = ['repair defect is exhausted and its owned incident remains open'];
      this.setState(recordAuditDisposition(this.state, {
        auditRunId: envelope.auditRunId,
        producer: envelope.producer,
        recordedAt: now,
        outcome: 'duplicate',
        repairId: scope.repairId,
        reasons,
      }));
      return { accepted: true, queued: false, repairId: null, reasons };
    }
    if ((this.state.satisfiedRepairIds ?? []).includes(scope.repairId)) {
      const reasons = ['repair postcondition is already satisfied on the default branch'];
      this.setState(recordAuditDisposition(this.state, {
        auditRunId: envelope.auditRunId,
        producer: envelope.producer,
        recordedAt: now,
        outcome: 'duplicate',
        repairId: scope.repairId,
        reasons,
      }));
      return { accepted: true, queued: false, repairId: null, reasons };
    }
    this.setState(enqueueRepairScope(this.state, scope, now));
    return { accepted: true, queued: true, repairId: scope.repairId };
  }

  async claimScope(leaseId: string, repairId?: string): Promise<{ scope: RepairScope | null; leaseId: string }> {
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(leaseId)) throw new Error('lease id is invalid');
    if (repairId !== undefined && !/^[a-f0-9]{32}$/.test(repairId)) throw new Error('repair id is invalid');
    const result = leaseNextRepairScope(this.state, leaseId, Date.now(), repairId);
    this.setState(result.state);
    return { scope: result.scope, leaseId };
  }

  async acknowledgeScope(repairId: string, attempt: number, leaseId: string, gateDigest: string): Promise<{ replayed: boolean }> {
    const result = acknowledgeRepairScope(this.state, repairId, attempt, leaseId, gateDigest, new Date().toISOString());
    this.setState(result.state);
    return { replayed: result.replayed };
  }

  async markScopeSatisfied(repairId: string, attempt: number, leaseId: string, evidenceDigest: string, reasons: string[]): Promise<{ replayed: boolean }> {
    const result = recordSatisfiedRepairScope(this.state, repairId, attempt, leaseId, evidenceDigest, reasons, new Date().toISOString());
    this.setState(result.state);
    return { replayed: result.replayed };
  }

  async recordMergeIntent(repairId: string, attempt: number, leaseId: string, intent: MergeIntent): Promise<{ replayed: boolean }> {
    const result = recordRepairMergeIntent(this.state, repairId, attempt, leaseId, intent, new Date().toISOString());
    this.setState(result.state);
    return { replayed: result.replayed };
  }

  async abortMergeIntent(repairId: string, attempt: number, leaseId: string, abortDigest: string, reasons: string[]): Promise<{ requeued: boolean; nextAttempt: number | null; exhausted: boolean; replayed: boolean }> {
    const result = recordRepairMergeAbort(this.state, repairId, attempt, leaseId, abortDigest, reasons, new Date().toISOString());
    this.setState(result.state);
    return { requeued: result.requeued, nextAttempt: result.nextAttempt, exhausted: result.exhausted, replayed: result.replayed };
  }

  async markScopeMerged(repairId: string, attempt: number, leaseId: string, outcome: MergeOutcome): Promise<{ replayed: boolean }> {
    const result = markRepairScopeMerged(this.state, repairId, attempt, leaseId, outcome, new Date().toISOString());
    this.setState(result.state);
    return { replayed: result.replayed };
  }

  async recordRollbackIntent(repairId: string, attempt: number, leaseId: string, rollbackIntentDigest: string): Promise<{ replayed: boolean }> {
    const result = recordRepairRollbackIntent(this.state, repairId, attempt, leaseId, rollbackIntentDigest, new Date().toISOString());
    this.setState(result.state);
    return { replayed: result.replayed };
  }

  async recordRolledBack(repairId: string, attempt: number, leaseId: string, outcome: RollbackOutcome, reasons: string[]): Promise<{ requeued: boolean; nextAttempt: number | null; exhausted: boolean; replayed: boolean }> {
    const result = recordRepairRolledBack(this.state, repairId, attempt, leaseId, outcome, reasons, new Date().toISOString());
    this.setState(result.state);
    return { requeued: result.requeued, nextAttempt: result.nextAttempt, exhausted: result.exhausted, replayed: result.replayed };
  }

  async submitScopeFeedback(repairId: string, attempt: number, leaseId: string, feedbackDigest: string, reasons: string[]): Promise<{ requeued: boolean; nextAttempt: number | null; exhausted: boolean; replayed: boolean }> {
    const result = recordRepairScopeFeedback(this.state, repairId, attempt, leaseId, feedbackDigest, reasons, new Date().toISOString());
    this.setState(result.state);
    return { requeued: result.requeued, nextAttempt: result.nextAttempt, exhausted: result.exhausted, replayed: result.replayed };
  }

  async getVerifiedArtifact(jobId: string): Promise<VerifiedRepairArtifact | null> {
    const completed = this.state.recent.find((item) => item.jobId === jobId);
    return completed?.outcome === 'verified_shadow' ? structuredClone(completed.artifact ?? null) : null;
  }

  async onWorkflowError(_workflowName: string, workflowId: string, error: string): Promise<void> {
    const active = this.state.active;
    if (!active || (active.workflowId !== null && active.workflowId !== workflowId)) return;
    await this.finishRepair(active.jobId, 'blocked', null, [error]);
  }
}

export type RepairWorkflowParams = {
  jobId: string;
  request: RepairRequest;
};
