import type { SelfImprovementRunResult } from './self-improvement';
import { resolveSelfImprovementEnvConfig, type SelfImprovementEnvLike } from './self-improvement';
import {
  persistAndDeliverRepairAudit,
  type RepairAuditDeliveryResult,
  type RepairAuditKv,
  type RepairAuditService,
} from './repair-audit-intake';

export type SelfImprovementRepairIntakeEnv = SelfImprovementEnvLike & {
  SCAN_CACHE?: RepairAuditKv;
  REPAIR_AGENT_SERVICE?: RepairAuditService;
};

export function selfImprovementRepairHttpStatus(
  result: SelfImprovementRunResult,
  delivery: RepairAuditDeliveryResult
): 200 | 202 | 409 | 500 | 503 {
  if (!result.ok) return result.status === 'skipped' ? 409 : 500;
  if (delivery.delivered) return 200;
  if (delivery.outboxPersisted && delivery.deliveryPending) return 202;
  return 503;
}

/**
 * Persist and forward one already-committed canonical self-audit.
 *
 * Every trigger (scheduled, admin, or authenticated CI) uses the same durable KV outbox before
 * crossing the internal service binding. Missing runtime bindings are reported as a failed
 * delivery rather than silently turning a committed audit into a green no-op.
 */
export async function persistCommittedSelfImprovementRepairIntake(args: {
  env: SelfImprovementRepairIntakeEnv;
  result: SelfImprovementRunResult;
  generatedAt?: string;
}): Promise<RepairAuditDeliveryResult> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  if (!args.result.ok || args.result.status !== 'audited' || !args.result.runId || !args.result.plan) {
    return {
      auditRunId: args.result.runId ?? null,
      delivered: false,
      queued: false,
      outboxPersisted: false,
      deliveryPending: false,
      attempts: 0,
      exhausted: false,
      nextAttemptAt: null,
      reason: 'audit produced no committed run',
    };
  }
  if (!args.env.SCAN_CACHE) {
    return {
      auditRunId: args.result.runId ?? null,
      delivered: false,
      queued: false,
      outboxPersisted: false,
      deliveryPending: false,
      attempts: 0,
      exhausted: false,
      nextAttemptAt: null,
      reason: 'repair audit outbox binding is missing',
    };
  }
  return persistAndDeliverRepairAudit({
    kv: args.env.SCAN_CACHE,
    service: args.env.REPAIR_AGENT_SERVICE,
    result: args.result,
    targetUrl: resolveSelfImprovementEnvConfig(args.env).targetUrl,
    generatedAt,
  });
}
