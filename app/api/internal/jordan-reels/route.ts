import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  claimNextJordanReel,
  completeJordanReelRender,
  failJordanReelRender,
  type JordanReelBucket,
  type JordanReelRenderValidation,
} from '@/lib/server/jordan-reel-render';
import { structuredLog } from '@/lib/server/structured-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RenderEnv = {
  readonly JORDAN_REEL_RENDER_SECRET: string;
  readonly NEXT_PUBLIC_SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly SOCIAL_MEDIA_PUBLIC_BASE: string;
  readonly REPORT_FILES?: JordanReelBucket;
};

async function env(): Promise<RenderEnv> {
  try {
    const { env: raw } = await getCloudflareContext({ async: true });
    const record = raw as unknown as Record<string, unknown>;
    return {
      JORDAN_REEL_RENDER_SECRET: String(record['JORDAN_REEL_RENDER_SECRET'] ?? ''),
      NEXT_PUBLIC_SUPABASE_URL: String(record['NEXT_PUBLIC_SUPABASE_URL'] ?? ''),
      SUPABASE_SERVICE_ROLE_KEY: String(record['SUPABASE_SERVICE_ROLE_KEY'] ?? ''),
      SOCIAL_MEDIA_PUBLIC_BASE: String(record['SOCIAL_MEDIA_PUBLIC_BASE'] ?? ''),
      REPORT_FILES: record['REPORT_FILES'] as JordanReelBucket | undefined,
    };
  } catch {
    return {
      JORDAN_REEL_RENDER_SECRET: process.env['JORDAN_REEL_RENDER_SECRET'] ?? '',
      NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      SOCIAL_MEDIA_PUBLIC_BASE: process.env['SOCIAL_MEDIA_PUBLIC_BASE'] ?? '',
    };
  }
}

function authorized(request: Request, secret: string): boolean {
  const provided = request.headers.get('authorization');
  return secret.length >= 32 && provided === `Bearer ${secret}`;
}

function serviceClient(config: RenderEnv) {
  return createServiceRoleClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY
  );
}

function ready(config: RenderEnv): boolean {
  return Boolean(
    config.NEXT_PUBLIC_SUPABASE_URL &&
    config.SUPABASE_SERVICE_ROLE_KEY &&
    config.SOCIAL_MEDIA_PUBLIC_BASE
  );
}

export async function GET(request: Request): Promise<Response> {
  const config = await env();
  if (!authorized(request, config.JORDAN_REEL_RENDER_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!ready(config)) return Response.json({ error: 'misconfigured' }, { status: 503 });
  const claim = await claimNextJordanReel(serviceClient(config));
  return Response.json(claim ? { status: 'claimed', claim } : { status: 'idle' });
}

export async function POST(request: Request): Promise<Response> {
  const config = await env();
  if (!authorized(request, config.JORDAN_REEL_RENDER_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!ready(config)) return Response.json({ error: 'misconfigured' }, { status: 503 });
  const supabase = serviceClient(config);

  if ((request.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (
      !body ||
      body['action'] !== 'fail' ||
      typeof body['assetId'] !== 'string' ||
      typeof body['attemptId'] !== 'string' ||
      typeof body['error'] !== 'string'
    ) {
      return Response.json({ error: 'validation_error' }, { status: 400 });
    }
    await failJordanReelRender({
      supabase,
      assetId: body['assetId'],
      attemptId: body['attemptId'],
      error: body['error'],
    });
    structuredLog('jordan_reel_render_failed', {
      asset_id: body['assetId'],
      error: body['error'].slice(0, 300),
    }, 'error');
    return Response.json({ status: 'failed_recorded' });
  }

  if (!config.REPORT_FILES) return Response.json({ error: 'r2_unavailable' }, { status: 503 });
  const form = await request.formData();
  const assetId = form.get('assetId');
  const attemptId = form.get('attemptId');
  const validationRaw = form.get('validation');
  const video = form.get('video');
  const thumbnail = form.get('thumbnail');
  const feedPreview = form.get('feedPreview');
  const gridPreview = form.get('gridPreview');
  if (
    typeof assetId !== 'string' ||
    typeof attemptId !== 'string' ||
    typeof validationRaw !== 'string' ||
    !(video instanceof File) ||
    !(thumbnail instanceof File) ||
    !(feedPreview instanceof File) ||
    !(gridPreview instanceof File)
  ) {
    return Response.json({ error: 'validation_error' }, { status: 400 });
  }

  let validation: JordanReelRenderValidation;
  try {
    validation = JSON.parse(validationRaw) as JordanReelRenderValidation;
  } catch {
    return Response.json({ error: 'invalid_validation_json' }, { status: 400 });
  }
  try {
    const result = await completeJordanReelRender({
      supabase,
      bucket: config.REPORT_FILES,
      publicBase: config.SOCIAL_MEDIA_PUBLIC_BASE,
      assetId,
      attemptId,
      video: await video.arrayBuffer(),
      thumbnail: await thumbnail.arrayBuffer(),
      feedPreview: await feedPreview.arrayBuffer(),
      gridPreview: await gridPreview.arrayBuffer(),
      validation,
    });
    structuredLog('jordan_reel_render_completed', {
      asset_id: assetId,
      scheduled: result.scheduled,
      renderer: 'github_actions_hyperframes',
    }, 'info');
    return Response.json({ status: 'complete', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    await failJordanReelRender({ supabase, assetId, attemptId, error: message });
    structuredLog('jordan_reel_render_rejected', { asset_id: assetId, error: message }, 'error');
    return Response.json({ error: message }, { status: 422 });
  }
}
