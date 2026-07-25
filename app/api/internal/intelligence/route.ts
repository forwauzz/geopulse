import { ZodError } from 'zod';
import {
  REASONING_CONTRACT_VERSION,
  reasoningErrorSchema,
  reasoningRequestSchema,
} from '@/lib/intelligence/reasoning-contracts';
import { ReasoningGateError, createReasoningService } from '@/lib/intelligence/reasoning';
import { SupabaseReasoningFactReader } from '@/lib/intelligence/reasoning-repository';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { checkIntelligenceRateLimit } from '@/lib/server/intelligence-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(
  error: Parameters<typeof reasoningErrorSchema.parse>[0],
  status: number,
  headers?: HeadersInit
): Response {
  return Response.json(reasoningErrorSchema.parse(error), { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const context = await loadAdminActionContext();
  if (!context.ok) {
    return errorResponse({
      contractVersion: REASONING_CONTRACT_VERSION,
      error: 'unauthorized',
      message: 'Platform-admin authentication is required.',
      retryable: false,
    }, 401);
  }
  const rateLimit = await checkIntelligenceRateLimit(context.env.SCAN_CACHE, context.user.id);
  if (!rateLimit.ok) {
    return errorResponse({
      contractVersion: REASONING_CONTRACT_VERSION,
      error: 'rate_limited',
      message: 'The internal reasoning request limit was reached.',
      retryable: true,
    }, 429, { 'Retry-After': String(rateLimit.retryAfterSec) });
  }

  try {
    const body = reasoningRequestSchema.parse(await request.json());
    const service = createReasoningService(new SupabaseReasoningFactReader(context.adminDb));
    const insight = await service.execute(body, {
      actorId: context.user.id,
      isPlatformAdmin: true,
      tenantType: null,
      tenantId: null,
    });
    return Response.json(insight, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Reasoning-Contract': REASONING_CONTRACT_VERSION,
      },
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse({
        contractVersion: REASONING_CONTRACT_VERSION,
        error: 'validation_error',
        message: 'The reasoning request is invalid.',
        retryable: false,
      }, 400);
    }
    if (error instanceof ReasoningGateError) {
      return errorResponse({
        contractVersion: REASONING_CONTRACT_VERSION,
        error: error.code,
        message: error.message,
        retryable: error.code === 'insufficient_evidence',
      }, error.code === 'tenant_scope_violation' ? 403 : 422);
    }
    const dbError = error as { code?: string; message?: string };
    if (dbError.code === '42P01' || /relation .* does not exist|schema cache/i.test(dbError.message ?? '')) {
      return errorResponse({
        contractVersion: REASONING_CONTRACT_VERSION,
        error: 'migration_pending',
        message: 'The intelligence database foundation is queued for deployment.',
        retryable: true,
      }, 503);
    }
    return errorResponse({
      contractVersion: REASONING_CONTRACT_VERSION,
      error: 'internal_error',
      message: 'The reasoning request could not be completed.',
      retryable: true,
    }, 500);
  }
}
