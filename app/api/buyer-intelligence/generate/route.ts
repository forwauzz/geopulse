import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createBuyerIntelligenceSnapshotRepository } from '@/lib/server/buyer-intelligence-snapshot-repository';
import {
  buyerIntelligenceGenerationViewSchema,
  createSupabaseBuyerIntelligenceGenerationRepository,
} from '@/lib/server/buyer-intelligence-generation-repository';
import { generateBuyerIntelligenceArtifact } from '@/lib/server/buyer-intelligence-generation-service';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { resolveReportBrand } from '@workers/report/resolve-report-brand';
import { readBuyerIntelligenceHeroRef } from '@/lib/server/buyer-intelligence-hero';

export const runtime = 'nodejs';

const inputSchema = z.object({
  agencyAccountId: z.string().uuid(),
  agencyClientId: z.string().uuid(),
  snapshotId: z.string().min(8).max(160),
  viewKind: buyerIntelligenceGenerationViewSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),
}).strict();

function filePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'business';
}

export async function POST(request: Request): Promise<Response> {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = Object.fromEntries(await request.formData());
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const input = parsed.data;
  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id,
    supabase: session,
    selectedAccountId: input.agencyAccountId,
    selectedClientId: input.agencyClientId,
  });
  if (!workspace || workspace.data.selectedAccountId !== input.agencyAccountId || workspace.data.selectedClientId !== input.agencyClientId) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const account = workspace.data.accounts.find((item) => item.id === input.agencyAccountId);
  const client = account?.clients.find((item) => item.id === input.agencyClientId);
  if (!account || !client) return Response.json({ error: 'not_found' }, { status: 404 });

  const snapshots = createBuyerIntelligenceSnapshotRepository(workspace.admin as never);
  const snapshot = await snapshots.load(input.snapshotId, { type: 'agency_client', id: input.agencyClientId });
  if (!snapshot || snapshot.reportEligibility.state !== 'eligible') {
    return Response.json({ error: 'snapshot_not_eligible' }, { status: 409 });
  }
  const bucket = await resolveReportFilesBucket();
  if (!bucket) return Response.json({ error: 'report_storage_unavailable' }, { status: 503 });
  const { brand } = await resolveReportBrand({
    supabase: workspace.admin,
    scan: { agency_client_id: input.agencyClientId, agency_account_id: input.agencyAccountId, startup_workspace_id: null },
    bucket,
  });
  const { data: clientRow } = await workspace.admin.from('agency_clients').select('metadata')
    .eq('id', input.agencyClientId).eq('agency_account_id', input.agencyAccountId).maybeSingle();
  const hero = readBuyerIntelligenceHeroRef(clientRow?.metadata);
  const heroObject = hero ? await bucket.get(hero.key) : null;
  const heroImageBytes = heroObject ? new Uint8Array(await heroObject.arrayBuffer()) : null;
  const repository = createSupabaseBuyerIntelligenceGenerationRepository(workspace.admin);
  try {
    const result = await generateBuyerIntelligenceArtifact({
      request: {
        agencyAccountId: input.agencyAccountId,
        agencyClientId: input.agencyClientId,
        snapshotId: input.snapshotId,
        viewKind: input.viewKind,
        idempotencyKey: input.idempotencyKey,
        requestedByUserId: user.id,
        branding: brand,
        heroR2Key: hero?.key ?? null,
      },
      snapshot,
      brand,
      heroImageBytes,
      heroImageMime: hero?.mime,
      repository,
      bucket,
    });
    return new Response(Uint8Array.from(result.bytes).buffer, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filePart(client.name)}-${input.viewKind.replaceAll('_', '-')}.pdf"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-generation-id': result.generation.id,
        'x-generation-reused': String(result.reused),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('buyer_intelligence_generation_in_progress:')) {
      return Response.json({ error: 'generation_in_progress' }, { status: 409, headers: { 'retry-after': '3' } });
    }
    return Response.json({ error: 'generation_failed' }, { status: 500 });
  }
}
