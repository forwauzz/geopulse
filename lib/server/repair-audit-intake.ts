import type { SelfImprovementRunResult } from './self-improvement';

export type RepairAuditService = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
};

export function buildRepairAuditEnvelope(args: {
  result: SelfImprovementRunResult;
  targetUrl: string;
  generatedAt: string;
}): Record<string, unknown> | null {
  if (!args.result.ok || args.result.status !== 'audited' || !args.result.runId || !args.result.plan) return null;
  return {
    schemaVersion: 1,
    producer: 'canonical-cloudflare-scheduler',
    auditRunId: args.result.runId,
    repositoryProfileId: 'geopulse-v1',
    targetUrl: args.targetUrl,
    generatedAt: args.generatedAt,
    score: args.result.score ?? null,
    letterGrade: args.result.letterGrade ?? null,
    checkCatalogVersion: args.result.checkCatalogVersion ?? 'unknown',
    findings: args.result.plan.map((finding, index) => ({
      findingId: `${args.result.runId}:${finding.checkId}:${index + 1}`,
      checkId: finding.checkId,
      status: finding.status,
      confidence: finding.confidence,
      // The scan plan has no exact repository path/replacement evidence. Marking this prohibited
      // makes the repair agent record it but refuse to infer a code mutation. A later audited
      // skill adapter may attach a bounded repairHint and lower this to low risk.
      risk: 'prohibited',
      weight: finding.weight,
      category: finding.category,
      finding: finding.finding,
      fix: finding.fix,
    })),
  };
}

export async function deliverRepairAudit(args: {
  service: RepairAuditService | undefined;
  result: SelfImprovementRunResult;
  targetUrl: string;
  generatedAt: string;
}): Promise<{ delivered: boolean; queued: boolean; reason: string | null }> {
  const envelope = buildRepairAuditEnvelope(args);
  if (!envelope) return { delivered: false, queued: false, reason: 'audit produced no committed run' };
  if (!args.service) return { delivered: false, queued: false, reason: 'repair agent service binding is missing' };
  try {
    const response = await args.service.fetch('https://repair-agent.internal/v1/audits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    const body = await response.json().catch(() => null) as { accepted?: boolean; queued?: boolean; reasons?: string[] } | null;
    if (!response.ok || body?.accepted !== true) {
      return { delivered: false, queued: false, reason: body?.reasons?.join('; ') || `repair agent returned ${response.status}` };
    }
    return { delivered: true, queued: body.queued === true, reason: body.queued ? null : body.reasons?.join('; ') || 'no eligible supported finding' };
  } catch (error) {
    return { delivered: false, queued: false, reason: error instanceof Error ? error.message : 'repair audit delivery failed' };
  }
}
