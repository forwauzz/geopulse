import { getScanApiEnv } from '@/lib/server/cf-env';
import { verifyBuyerIntelligenceShareCapability } from '@/lib/server/buyer-intelligence-share-capability';
import { loadBuyerIntelligenceShareTarget } from '@/lib/server/buyer-intelligence-share-target';
import { readBuyerIntelligenceHeroRef } from '@/lib/server/buyer-intelligence-hero';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { buildAuditCampaignThumbnailHtml, renderAuditCampaignThumbnail } from '@workers/report/audit-campaign-thumbnail';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const env = await getScanApiEnv(); const { token } = await context.params;
  const secret = env.AUDIT_REPORT_CAPABILITY_SECRET?.trim();
  if (!secret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'thumbnail_unavailable' }, { status: 503 });
  }
  const verified = verifyBuyerIntelligenceShareCapability({ token, secret, nowMs: Date.now() });
  if (!verified.ok) return Response.json({ error: verified.code }, { status: verified.code === 'expired' ? 410 : 403 });
  const target = await loadBuyerIntelligenceShareTarget({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    payload: verified.payload,
  });
  if (!target) return Response.json({ error: 'thumbnail_target_mismatch' }, { status: 403 });
  const bucket = await resolveReportFilesBucket();
  const hero = readBuyerIntelligenceHeroRef(target.client.metadata);
  const heroObject = bucket && hero ? await bucket.get(hero.key) : null;
  const heroImage = heroObject ? new Uint8Array(await heroObject.arrayBuffer()) : null;
  const primary = target.generation.branding['primary'] as { r?: number; g?: number; b?: number } | undefined;
  const channel = (value?: number) => Math.round(Math.max(0, Math.min(1, value ?? 0.34)) * 255).toString(16).padStart(2, '0');
  const html = buildAuditCampaignThumbnailHtml({
    firstName: verified.payload.recipientFirstName, company: verified.payload.recipientCompany,
    domain: verified.payload.domain, generatedAt: target.generation.completedAt ?? target.generation.createdAt,
    primaryHex: `#${channel(primary?.r)}${channel(primary?.g)}${channel(primary?.b)}`, heroImage,
  });
  const bytes = await renderAuditCampaignThumbnail({ env, html });
  if (!bytes) return Response.json({ error: 'thumbnail_render_failed' }, { status: 503 });
  return new Response(Buffer.from(bytes), { headers: {
    'content-type': 'image/jpeg',
    'content-disposition': `inline; filename="${verified.payload.domain}-report-cover.jpg"`,
    'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff',
  } });
}
