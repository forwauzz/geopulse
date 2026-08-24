import type { RepairAgentState } from './agent';
import { RepairAgent } from './agent';
import type { RepairWorkerEnv } from './env';
import { RepairWorkflow } from './workflow';

export { Sandbox } from '@cloudflare/sandbox';
export { RepairAgent, RepairWorkflow };

const MAX_REQUEST_BYTES = 64 * 1024;
const SITE_AGENT_NAME = 'getgeopulse.com';

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsed = Number.parseInt(declaredLength, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_REQUEST_BYTES) {
      throw new Error('request body exceeds 64KB');
    }
  }
  if (!request.body) throw new Error('request body is required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel('request body exceeds 64KB');
      throw new Error('request body exceeds 64KB');
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(combined)) as unknown;
  } catch {
    throw new Error('request body must be valid JSON');
  }
}

async function secureEqual(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(providedHash, expectedHash);
  }
  // Fixed-size SHA-256 values avoid length leakage on runtimes that have not yet exposed
  // timingSafeEqual in their Web Crypto type surface.
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function authorized(request: Request, env: RepairWorkerEnv): Promise<'ok' | 'missing' | 'invalid'> {
  const expected = env.REPAIR_AGENT_API_TOKEN;
  if (!expected) return 'missing';
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return 'invalid';
  return (await secureEqual(authorization.slice('Bearer '.length), expected)) ? 'ok' : 'invalid';
}

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...init?.headers,
    },
  });
}

async function requireAuthorization(
  request: Request,
  env: RepairWorkerEnv
): Promise<Response | null> {
  const result = await authorized(request, env);
  if (result === 'ok') return null;
  if (result === 'missing') {
    return json({ ok: false, error: 'repair agent API token is not configured' }, { status: 503 });
  }
  return json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

async function handleRepairSubmission(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const agent = env.REPAIR_AGENT.getByName(SITE_AGENT_NAME);
  const result = await agent.submitRepair(body);
  console.log(
    JSON.stringify({
      event: 'repair_submission',
      accepted: result.accepted,
      duplicate: result.accepted ? result.duplicate : false,
      jobId: result.accepted ? result.jobId : null,
    })
  );
  return json(result, { status: result.accepted ? 202 : 422 });
}

async function handleStatus(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  const agent = env.REPAIR_AGENT.getByName(SITE_AGENT_NAME);
  const snapshot: RepairAgentState = await agent.getSnapshot();
  return json(snapshot);
}

async function handleAuditSubmission(request: Request, env: RepairWorkerEnv): Promise<Response> {
  // The production scheduler reaches this hostname only through a Cloudflare service binding.
  // Public workers.dev/custom-domain requests retain their real hostname and still require bearer auth.
  const internal = new URL(request.url).hostname === 'repair-agent.internal';
  if (!internal) {
    const denied = await requireAuthorization(request, env);
    if (denied) return denied;
  }
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const agent = env.REPAIR_AGENT.getByName(SITE_AGENT_NAME);
  const result = await agent.submitAudit(body, internal ? 'internal-scheduler' : 'external-canary');
  return json(result, { status: result.accepted ? 202 : 422 });
}

function stringField(body: unknown, field: string): string | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

function integerField(body: unknown, field: string): number | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[field];
  return Number.isInteger(value) ? value as number : null;
}

function stringArrayField(body: unknown, field: string): string[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[field];
  if (!Array.isArray(value) || value.length < 1 || value.length > 10 || !value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 500)) return null;
  return value;
}

async function handleScopeClaim(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const leaseId = stringField(body, 'leaseId');
  const repairId = stringField(body, 'repairId') ?? undefined;
  if (!leaseId) return json({ ok: false, error: 'leaseId is required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).claimScope(leaseId, repairId);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'claim failed' }, { status: 422 });
  }
}

async function handleScopeAck(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const gateDigest = stringField(body, 'gateDigest');
  if (!repairId || !leaseId || !attempt || !gateDigest) return json({ ok: false, error: 'repairId, attempt, leaseId, and gateDigest are required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).acknowledgeScope(repairId, attempt, leaseId, gateDigest);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'acknowledgement failed' }, { status: 409 });
  }
}

async function handleScopeSatisfied(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try { body = await readBoundedJson(request); } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const evidenceDigest = stringField(body, 'evidenceDigest');
  const reasons = stringArrayField(body, 'reasons');
  if (!repairId || !leaseId || !attempt || !evidenceDigest || !reasons) {
    return json({ ok: false, error: 'complete satisfied-scope evidence is required' }, { status: 400 });
  }
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).markScopeSatisfied(repairId, attempt, leaseId, evidenceDigest, reasons);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'satisfied transition failed' }, { status: 409 });
  }
}

function integerArrayField(body: unknown, field: string): number[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[field];
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 || !value.every((item) => Number.isSafeInteger(item) && Number(item) > 0)) return null;
  return value as number[];
}

async function handleMergeIntent(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try { body = await readBoundedJson(request); } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const intentDigest = stringField(body, 'intentDigest');
  const pullRequestNumber = integerField(body, 'pullRequestNumber');
  const issueNumber = integerField(body, 'issueNumber');
  const baseSha = stringField(body, 'baseSha');
  const headSha = stringField(body, 'headSha');
  const patchDigest = stringField(body, 'patchDigest');
  const controllerCheckRunId = integerField(body, 'controllerCheckRunId');
  const requiredCheckRunIds = integerArrayField(body, 'requiredCheckRunIds');
  if (!repairId || !leaseId || !attempt || !intentDigest || !pullRequestNumber || !issueNumber || !baseSha || !headSha || !patchDigest || !controllerCheckRunId || !requiredCheckRunIds) {
    return json({ ok: false, error: 'complete merge intent evidence is required' }, { status: 400 });
  }
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).recordMergeIntent(repairId, attempt, leaseId, {
      intentDigest, pullRequestNumber, issueNumber, baseSha, headSha, patchDigest, controllerCheckRunId, requiredCheckRunIds,
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'merge intent failed' }, { status: 409 });
  }
}

async function handleScopeMerged(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const mergeDigest = stringField(body, 'mergeDigest');
  const mergeSha = stringField(body, 'mergeSha');
  const integrityFailure = stringField(body, 'integrityFailure') ?? undefined;
  if (!repairId || !leaseId || !attempt || !mergeDigest || !mergeSha) return json({ ok: false, error: 'repairId, attempt, leaseId, mergeSha, and mergeDigest are required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).markScopeMerged(repairId, attempt, leaseId, { mergeSha, mergeDigest, ...(integrityFailure ? { integrityFailure } : {}) });
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'merged transition failed' }, { status: 409 });
  }
}

async function handleRollbackIntent(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try { body = await readBoundedJson(request); } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const rollbackIntentDigest = stringField(body, 'rollbackIntentDigest');
  if (!repairId || !leaseId || !attempt || !rollbackIntentDigest) return json({ ok: false, error: 'rollback intent evidence is required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).recordRollbackIntent(repairId, attempt, leaseId, rollbackIntentDigest);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'rollback intent failed' }, { status: 409 });
  }
}

async function handleRolledBack(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try { body = await readBoundedJson(request); } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const rollbackMergeSha = stringField(body, 'rollbackMergeSha');
  const deploymentId = stringField(body, 'deploymentId');
  const versionId = stringField(body, 'versionId');
  const evidenceDigest = stringField(body, 'evidenceDigest');
  const reasons = stringArrayField(body, 'reasons');
  if (!repairId || !leaseId || !attempt || !rollbackMergeSha || !deploymentId || !versionId || !evidenceDigest || !reasons) return json({ ok: false, error: 'complete rollback outcome evidence and reasons are required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).recordRolledBack(repairId, attempt, leaseId, { rollbackMergeSha, deploymentId, versionId, evidenceDigest }, reasons);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'rolled-back transition failed' }, { status: 409 });
  }
}

async function handleScopeFeedback(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const feedbackDigest = stringField(body, 'feedbackDigest');
  const reasons = stringArrayField(body, 'reasons');
  if (!repairId || !leaseId || !attempt || !feedbackDigest || !reasons) return json({ ok: false, error: 'repairId, attempt, leaseId, feedbackDigest, and bounded reasons are required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).submitScopeFeedback(repairId, attempt, leaseId, feedbackDigest, reasons);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'feedback failed' }, { status: 409 });
  }
}

async function handleMergeAbort(request: Request, env: RepairWorkerEnv): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  let body: unknown;
  try { body = await readBoundedJson(request); } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'invalid request' }, { status: 400 });
  }
  const repairId = stringField(body, 'repairId');
  const leaseId = stringField(body, 'leaseId');
  const attempt = integerField(body, 'attempt');
  const abortDigest = stringField(body, 'abortDigest');
  const reasons = stringArrayField(body, 'reasons');
  if (!repairId || !leaseId || !attempt || !abortDigest || !reasons) return json({ ok: false, error: 'complete merge-abort evidence is required' }, { status: 400 });
  try {
    const result = await env.REPAIR_AGENT.getByName(SITE_AGENT_NAME).abortMergeIntent(repairId, attempt, leaseId, abortDigest, reasons);
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'merge abort failed' }, { status: 409 });
  }
}

async function handleArtifact(request: Request, env: RepairWorkerEnv, jobId: string): Promise<Response> {
  const denied = await requireAuthorization(request, env);
  if (denied) return denied;
  if (!/^[a-f0-9]{32}$/.test(jobId)) {
    return json({ ok: false, error: 'invalid job id' }, { status: 400 });
  }
  const agent = env.REPAIR_AGENT.getByName(SITE_AGENT_NAME);
  const artifact = await agent.getVerifiedArtifact(jobId);
  return artifact
    ? json({ ok: true, artifact })
    : json({ ok: false, error: 'verified artifact not found' }, { status: 404 });
}

export default {
  async fetch(request: Request, env: RepairWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        mode: 'shadow',
        productionMutationsEnabled: false,
        killSwitch: env.REPAIR_KILL_SWITCH !== 'false',
      });
    }
    if (request.method === 'POST' && url.pathname === '/v1/repairs') {
      return handleRepairSubmission(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/audits') {
      return handleAuditSubmission(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/claim') {
      return handleScopeClaim(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/ack') {
      return handleScopeAck(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/satisfied') {
      return handleScopeSatisfied(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/merge-intent') {
      return handleMergeIntent(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/merge-abort') {
      return handleMergeAbort(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/merged') {
      return handleScopeMerged(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/rollback-intent') {
      return handleRollbackIntent(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/rolled-back') {
      return handleRolledBack(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scopes/feedback') {
      return handleScopeFeedback(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/v1/status') {
      return handleStatus(request, env);
    }
    const artifactMatch = /^\/v1\/artifacts\/([a-f0-9]{32})$/.exec(url.pathname);
    if (request.method === 'GET' && artifactMatch?.[1]) {
      return handleArtifact(request, env, artifactMatch[1]);
    }
    return json({ ok: false, error: 'not found' }, { status: 404 });
  },
} satisfies ExportedHandler<RepairWorkerEnv>;
