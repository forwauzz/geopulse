import type { SelfImprovementRunResult } from './self-improvement';

export type RepairAuditService = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
};

export type RepairAuditKv = {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string, type: 'json'): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
};

export type RepairAuditEnvelope = {
  schemaVersion: 1;
  producer: 'canonical-cloudflare-scheduler' | 'canonical-cloudflare-admin' | 'canonical-cloudflare-ci';
  auditRunId: string;
  repositoryProfileId: 'geopulse-v1';
  targetUrl: string;
  generatedAt: string;
  score: number | null;
  letterGrade: string | null;
  checkCatalogVersion: string;
  findings: Array<Record<string, unknown>>;
};

export type RepairAuditDeliveryRecord = {
  schemaVersion: 1;
  auditRunId: string;
  owner: 'repair-intake';
  retryPolicy: 'three_attempts_5m_30m';
  state: 'pending' | 'exhausted';
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  envelope: RepairAuditEnvelope;
};

export type RepairAuditDeliveryResult = {
  auditRunId: string | null;
  delivered: boolean;
  queued: boolean;
  outboxPersisted: boolean;
  deliveryPending: boolean;
  attempts: number;
  exhausted: boolean;
  nextAttemptAt: string | null;
  reason: string | null;
};

function supportedRepairFinding(finding: NonNullable<SelfImprovementRunResult['plan']>[number]): {
  risk: 'low' | 'prohibited';
  repairHint?: { instruction: { skillId: 'allow-ai-retrieval-agents'; path: 'app/robots.ts' } };
} {
  if (finding.checkId === 'ai-crawler-access' && finding.status === 'FAIL' && finding.confidence === 'high') {
    return {
      risk: 'low',
      repairHint: { instruction: { skillId: 'allow-ai-retrieval-agents', path: 'app/robots.ts' } },
    };
  }
  return { risk: 'prohibited' };
}

const SUPPORTED_REPAIR_CHECK_CATALOG_VERSION = '2026-07-21';

const DELIVERY_PREFIX = 'repair-audit-delivery:v1:';
const DELIVERY_TTL_SECONDS = 7 * 24 * 60 * 60;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000] as const;

function deliveryKey(auditRunId: string): string {
  return `${DELIVERY_PREFIX}${auditRunId}`;
}

function validDeliveryRecord(value: unknown): value is RepairAuditDeliveryRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<RepairAuditDeliveryRecord>;
  return record.schemaVersion === 1
    && typeof record.auditRunId === 'string'
    && record.owner === 'repair-intake'
    && record.retryPolicy === 'three_attempts_5m_30m'
    && (record.state === 'pending' || record.state === 'exhausted')
    && Number.isInteger(record.attempts)
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string'
    && record.envelope?.auditRunId === record.auditRunId;
}

async function storeDelivery(kv: RepairAuditKv, record: RepairAuditDeliveryRecord): Promise<void> {
  await kv.put(deliveryKey(record.auditRunId), JSON.stringify(record), { expirationTtl: DELIVERY_TTL_SECONDS });
}

export function buildRepairAuditEnvelope(args: {
  result: SelfImprovementRunResult;
  targetUrl: string;
  generatedAt: string;
}): RepairAuditEnvelope | null {
  if (!args.result.ok || args.result.status !== 'audited' || !args.result.runId || !args.result.plan) return null;
  const producer = args.result.triggerSource === 'worker_cron'
    ? 'canonical-cloudflare-scheduler'
    : args.result.triggerSource === 'admin_manual'
      ? 'canonical-cloudflare-admin'
      : 'canonical-cloudflare-ci';
  return {
    schemaVersion: 1,
    producer,
    auditRunId: args.result.runId,
    repositoryProfileId: 'geopulse-v1',
    targetUrl: args.targetUrl,
    generatedAt: args.generatedAt,
    score: args.result.score ?? null,
    letterGrade: args.result.letterGrade ?? null,
    checkCatalogVersion: args.result.checkCatalogVersion ?? 'unknown',
    findings: args.result.plan.map((finding, index) => {
      const supported = args.result.checkCatalogVersion === SUPPORTED_REPAIR_CHECK_CATALOG_VERSION
        ? supportedRepairFinding(finding)
        : { risk: 'prohibited' as const };
      return {
        findingId: `${args.result.runId}:${finding.checkId}:${index + 1}`,
        checkId: finding.checkId,
        status: finding.status,
        confidence: finding.confidence,
        ...supported,
        weight: finding.weight,
        category: finding.category,
        finding: finding.finding,
        fix: finding.fix,
      };
    }),
  };
}

export async function deliverRepairEnvelope(args: {
  service: RepairAuditService | undefined;
  envelope: RepairAuditEnvelope;
}): Promise<{ delivered: boolean; queued: boolean; reason: string | null }> {
  if (!args.service) return { delivered: false, queued: false, reason: 'repair agent service binding is missing' };
  try {
    const response = await args.service.fetch('https://repair-agent.internal/v1/audits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args.envelope),
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

export async function deliverRepairAudit(args: {
  service: RepairAuditService | undefined;
  result: SelfImprovementRunResult;
  targetUrl: string;
  generatedAt: string;
}): Promise<{ delivered: boolean; queued: boolean; reason: string | null }> {
  const envelope = buildRepairAuditEnvelope(args);
  if (!envelope) return { delivered: false, queued: false, reason: 'audit produced no committed run' };
  return deliverRepairEnvelope({ service: args.service, envelope });
}

async function attemptStoredDelivery(args: {
  kv: RepairAuditKv;
  service: RepairAuditService | undefined;
  record: RepairAuditDeliveryRecord;
  nowMs: number;
}): Promise<RepairAuditDeliveryResult> {
  const delivered = await deliverRepairEnvelope({ service: args.service, envelope: args.record.envelope });
  const attempts = args.record.attempts + 1;
  if (delivered.delivered) {
    await args.kv.delete(deliveryKey(args.record.auditRunId));
    return {
      auditRunId: args.record.auditRunId,
      ...delivered,
      outboxPersisted: true,
      deliveryPending: false,
      attempts,
      exhausted: false,
      nextAttemptAt: null,
    };
  }
  const exhausted = attempts >= 3;
  const nextAttemptAt = exhausted ? null : new Date(args.nowMs + RETRY_DELAYS_MS[attempts - 1]!).toISOString();
  await storeDelivery(args.kv, {
    ...args.record,
    state: exhausted ? 'exhausted' : 'pending',
    attempts,
    nextAttemptAt,
    lastError: delivered.reason,
    updatedAt: new Date(args.nowMs).toISOString(),
  });
  return {
    auditRunId: args.record.auditRunId,
    ...delivered,
    outboxPersisted: true,
    deliveryPending: !exhausted,
    attempts,
    exhausted,
    nextAttemptAt,
  };
}

export async function persistAndDeliverRepairAudit(args: {
  kv: RepairAuditKv;
  service: RepairAuditService | undefined;
  result: SelfImprovementRunResult;
  targetUrl: string;
  generatedAt: string;
  nowMs?: number;
}): Promise<RepairAuditDeliveryResult> {
  const envelope = buildRepairAuditEnvelope(args);
  if (!envelope) {
    return { auditRunId: null, delivered: false, queued: false, outboxPersisted: false, deliveryPending: false, attempts: 0, exhausted: false, nextAttemptAt: null, reason: 'audit produced no committed run' };
  }
  const nowMs = args.nowMs ?? Date.now();
  const stored = await args.kv.get(deliveryKey(envelope.auditRunId), 'json');
  if (validDeliveryRecord(stored)) {
    if (stored.state === 'exhausted') {
      return {
        auditRunId: stored.auditRunId,
        delivered: false,
        queued: false,
        outboxPersisted: true,
        deliveryPending: false,
        attempts: stored.attempts,
        exhausted: true,
        nextAttemptAt: null,
        reason: stored.lastError,
      };
    }
    if (stored.nextAttemptAt && Date.parse(stored.nextAttemptAt) > nowMs) {
      return {
        auditRunId: stored.auditRunId,
        delivered: false,
        queued: false,
        outboxPersisted: true,
        deliveryPending: true,
        attempts: stored.attempts,
        exhausted: false,
        nextAttemptAt: stored.nextAttemptAt,
        reason: stored.lastError,
      };
    }
    return attemptStoredDelivery({ kv: args.kv, service: args.service, record: stored, nowMs });
  }
  const now = new Date(nowMs).toISOString();
  const record: RepairAuditDeliveryRecord = {
    schemaVersion: 1,
    auditRunId: envelope.auditRunId,
    owner: 'repair-intake',
    retryPolicy: 'three_attempts_5m_30m',
    state: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    envelope,
  };
  // Persist before the first external call so a transient Worker/service failure cannot drop
  // the committed audit. The same auditRunId is the idempotency key on every retry.
  await storeDelivery(args.kv, record);
  return attemptStoredDelivery({ kv: args.kv, service: args.service, record, nowMs });
}

export async function retryPendingRepairAudits(args: {
  kv: RepairAuditKv;
  service: RepairAuditService | undefined;
  nowMs?: number;
  limit?: number;
}): Promise<RepairAuditDeliveryResult[]> {
  const nowMs = args.nowMs ?? Date.now();
  const deliveryLimit = Math.min(Math.max(args.limit ?? 5, 1), 25);
  const scanLimit = 100;
  const results: RepairAuditDeliveryResult[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  do {
    const remaining = scanLimit - scanned;
    if (remaining <= 0 || results.length >= deliveryLimit) break;
    const listed = await args.kv.list({ prefix: DELIVERY_PREFIX, limit: Math.min(25, remaining), ...(cursor ? { cursor } : {}) });
    scanned += listed.keys.length;
    for (const key of listed.keys) {
      if (results.length >= deliveryLimit) break;
      const raw = await args.kv.get(key.name, 'json');
      if (!validDeliveryRecord(raw) || raw.state === 'exhausted') continue;
      if (raw.nextAttemptAt && Date.parse(raw.nextAttemptAt) > nowMs) continue;
      results.push(await attemptStoredDelivery({ kv: args.kv, service: args.service, record: raw, nowMs }));
    }
    if (listed.list_complete || !listed.cursor || listed.cursor === cursor) break;
    cursor = listed.cursor;
  } while (true);
  return results;
}
