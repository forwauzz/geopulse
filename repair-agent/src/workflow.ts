import { getSandbox } from '@cloudflare/sandbox';
import { AgentWorkflow } from 'agents/workflows';
import type { AgentWorkflowEvent, AgentWorkflowStep } from 'agents/workflows';
import type { RepairAgent, RepairWorkflowParams } from './agent';
import { parseRunnerResult } from './contracts';
import type { EvaluationResult, RunnerResult, VerifiedRepairArtifact } from './contracts';
import { evaluateRepair } from './evaluator';
import type { RepairWorkerEnv } from './env';
import { admitRepair, policyConfigFromEnv } from './policy';
import type { RepairAttemptRecord } from './state';
import { digestChangedContent } from './artifact';

type AttemptExecution = {
  result: RunnerResult | null;
  error: string | null;
  recordedAt: string;
};

type RepairWorkflowResult = {
  jobId: string;
  outcome: 'verified_shadow' | 'rejected' | 'blocked';
  attempts: number;
  evaluation: EvaluationResult | null;
  reasons: string[];
};

function parentDirectories(path: string): string[] {
  const parts = path.split('/');
  const directories: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    directories.push(parts.slice(0, index).join('/'));
  }
  return directories;
}

async function digestError(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class RepairWorkflow extends AgentWorkflow<
  RepairAgent,
  RepairWorkflowParams,
  { stage: string; attempt?: number },
  RepairWorkerEnv
> {
  async run(
    event: AgentWorkflowEvent<RepairWorkflowParams>,
    step: AgentWorkflowStep
  ): Promise<RepairWorkflowResult> {
    const { jobId, request } = event.payload;
    const admission = await step.do('recheck-admission-policy', async () =>
      admitRepair(request, policyConfigFromEnv(this.env))
    );
    if (!admission.admitted) {
      await step.do('record-rejection', async () => {
        await this.agent.finishRepair(jobId, 'rejected', null, admission.reasons);
      });
      const rejected: RepairWorkflowResult = {
        jobId,
        outcome: 'rejected',
        attempts: 0,
        evaluation: null,
        reasons: admission.reasons,
      };
      await step.reportComplete(rejected);
      return rejected;
    }

    const executionErrors: string[] = [];
    // The durable scope coordinator owns the three-attempt ceiling. Each SHA-bound
    // request gets one Sandbox execution so nested retries cannot exceed that cap.
    for (let attempt = 1; attempt <= 1; attempt += 1) {
      await this.reportProgress({ stage: 'sandbox-execution', attempt });
      const execution = await step.do(`execute-shadow-attempt-${attempt}`, async (): Promise<AttemptExecution> => {
        const sandbox = getSandbox(this.env.Sandbox, `repair-${jobId}-${attempt}`, {
          normalizeId: true,
          sleepAfter: '5m',
        });
        try {
          const repoRoot = '/workspace/repo';
          await sandbox.mkdir(repoRoot, { recursive: true });
          for (const [path, content] of Object.entries(request.fixture.files)) {
            for (const directory of parentDirectories(path)) {
              await sandbox.mkdir(`${repoRoot}/${directory}`, { recursive: true });
            }
            await sandbox.writeFile(`${repoRoot}/${path}`, content);
          }
          const jobPath = '/workspace/job.json';
          const resultPath = '/workspace/result.json';
          await sandbox.writeFile(
            jobPath,
            JSON.stringify({ schemaVersion: 1, jobId, repoRoot, request })
          );
          await sandbox.exec(
            `node /opt/geopulse/repair-runner.mjs ${jobPath} ${resultPath}`,
            { cwd: '/workspace', timeout: 120_000 }
          );
          const rawResult = await sandbox.readFile(resultPath);
          const decoded = JSON.parse(rawResult.content) as unknown;
          const parsed = parseRunnerResult(decoded);
          return parsed.ok
            ? { result: parsed.result, error: null, recordedAt: new Date().toISOString() }
            : { result: null, error: parsed.reason, recordedAt: new Date().toISOString() };
        } catch (error) {
          return {
            result: null,
            error: error instanceof Error ? error.message : 'sandbox execution failed',
            recordedAt: new Date().toISOString(),
          };
        } finally {
          await sandbox.destroy();
        }
      });

      let evaluation: EvaluationResult | null = null;
      let attemptRecord: RepairAttemptRecord;
      if (execution.result) {
        evaluation = await step.do(`evaluate-shadow-attempt-${attempt}`, async () =>
          evaluateRepair(jobId, request, execution.result as RunnerResult)
        );
        attemptRecord = {
          attempt,
          recordedAt: execution.recordedAt,
          outcome: evaluation.passed ? 'passed' : 'failed',
          evidenceDigest: evaluation.evidenceDigest,
          reasons: evaluation.hardGateFailures,
        };
      } else {
        const reason = execution.error ?? 'sandbox returned no result';
        executionErrors.push(reason);
        attemptRecord = {
          attempt,
          recordedAt: execution.recordedAt,
          outcome: 'execution_error',
          evidenceDigest: await step.do(`digest-shadow-error-${attempt}`, async () => digestError(reason)),
          reasons: [reason],
        };
      }

      await step.do(`record-shadow-attempt-${attempt}`, async () => {
        await this.agent.recordAttempt(jobId, attemptRecord);
      });

      if (evaluation?.passed) {
        const artifact: VerifiedRepairArtifact = {
          schemaVersion: 1,
          jobId,
          repository: request.repository,
          siteOrigin: request.siteOrigin,
          idempotencyKey: request.idempotencyKey,
          attempt: request.attempt,
          feedback: request.feedback,
          instruction: request.instruction,
          changedFiles: execution.result?.changedFiles ?? [],
          finalFiles: execution.result?.finalFiles ?? {},
          evidenceDigest: evaluation.evidenceDigest,
          contentDigest: await digestChangedContent(execution.result?.changedFiles ?? [], execution.result?.finalFiles ?? {}),
        };
        await step.do('record-shadow-verification', async () => {
          await this.agent.finishRepair(jobId, 'verified_shadow', evaluation, [], artifact);
        });
        const verified: RepairWorkflowResult = {
          jobId,
          outcome: 'verified_shadow',
          attempts: attempt,
          evaluation,
          reasons: [],
        };
        await step.reportComplete(verified);
        return verified;
      }

      if (evaluation && !evaluation.passed) {
        const reasons = [
          ...evaluation.hardGateFailures,
          'deterministic evaluator failure is not retried because it would repeat the identical patch',
        ];
        await step.do('record-deterministic-block', async () => {
          await this.agent.finishRepair(jobId, 'blocked', evaluation, reasons);
        });
        const blocked: RepairWorkflowResult = {
          jobId,
          outcome: 'blocked',
          attempts: attempt,
          evaluation,
          reasons,
        };
        await step.reportComplete(blocked);
        return blocked;
      }
    }

    const executionFailureReasons = [
      ...executionErrors,
      'the single SHA-bound sandbox execution failed; the scope coordinator owns any next attempt',
    ];
    await step.do('record-sandbox-execution-failure', async () => {
      await this.agent.finishRepair(jobId, 'blocked', null, executionFailureReasons);
    });
    const blocked: RepairWorkflowResult = {
      jobId,
      outcome: 'blocked',
      attempts: 1,
      evaluation: null,
      reasons: executionFailureReasons,
    };
    await step.reportComplete(blocked);
    return blocked;
  }
}
