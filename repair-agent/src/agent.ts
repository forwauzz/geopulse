import { Agent } from 'agents';
import type { EvaluationResult, RepairRequest } from './contracts';
import { parseRepairRequest } from './contracts';
import type { RepairWorkerEnv } from './env';
import { admitRepair, policyConfigFromEnv } from './policy';
import {
  appendAttempt,
  attachWorkflow,
  beginRepair,
  completeRepair,
  initialRepairState,
  validateRepairState,
  type CompletedRepair,
  type RepairAgentState,
  type RepairAttemptRecord,
} from './state';
export type { RepairAgentState } from './state';

export type SubmitRepairResult =
  | { accepted: true; duplicate: boolean; jobId: string; workflowId: string | null }
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
    reasons: string[]
  ): Promise<void> {
    const active = this.state.active;
    if (!active || active.jobId !== jobId) return;
    this.setState(completeRepair(
      this.state,
      jobId,
      outcome,
      evaluation,
      reasons,
      new Date().toISOString()
    ));
  }

  async getSnapshot(): Promise<RepairAgentState> {
    return structuredClone(this.state);
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
