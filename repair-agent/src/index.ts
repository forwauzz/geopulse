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
    if (request.method === 'GET' && url.pathname === '/v1/status') {
      return handleStatus(request, env);
    }
    return json({ ok: false, error: 'not found' }, { status: 404 });
  },
} satisfies ExportedHandler<RepairWorkerEnv>;
