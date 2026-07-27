import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import {
  cleanupQaBuyerJourney,
  issueQaBuyerJourney,
} from '@/lib/server/qa-buyer-journey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const issueSchema = z.object({
  persona: z.enum(['business', 'agency']),
  bundleKey: z.enum(['startup_dev', 'agency_core', 'agency_pro']),
}).refine(
  (value) =>
    (value.persona === 'business' && value.bundleKey === 'startup_dev') ||
    (value.persona === 'agency' &&
      (value.bundleKey === 'agency_core' || value.bundleKey === 'agency_pro')),
  { message: 'Bundle does not match persona.' },
);

const cleanupSchema = z.object({
  token: z.string().min(32).max(160),
});

export async function POST(request: Request): Promise<Response> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!ctx.env.SCAN_CACHE) {
    return Response.json({ error: 'qa_store_unavailable' }, { status: 503 });
  }
  const parsed = issueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'validation_error' }, { status: 400 });
  }
  const claim = await issueQaBuyerJourney({
    kv: ctx.env.SCAN_CACHE,
    persona: parsed.data.persona,
    bundleKey: parsed.data.bundleKey,
    issuedByUserId: ctx.user.id,
  });
  const params = new URLSearchParams({
    bundle: claim.bundleKey,
    qa_token: claim.token,
  });
  return Response.json({
    ok: true,
    token: claim.token,
    email: claim.email,
    organizationName: claim.organizationName,
    websiteUrl: claim.websiteUrl,
    expiresAt: claim.expiresAt,
    startUrl: `/pricing?${params.toString()}`,
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!ctx.env.SCAN_CACHE) {
    return Response.json({ error: 'qa_store_unavailable' }, { status: 503 });
  }
  const parsed = cleanupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'validation_error' }, { status: 400 });
  }
  try {
    const result = await cleanupQaBuyerJourney({
      kv: ctx.env.SCAN_CACHE,
      supabase: ctx.adminDb,
      token: parsed.data.token,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'cleanup_failed' },
      { status: 500 },
    );
  }
}
