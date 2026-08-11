import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { createSupabaseBuyerIntelligenceGenerationRepository } from '@/lib/server/buyer-intelligence-generation-repository';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';

export const runtime = 'nodejs';

const querySchema = z.object({
  agencyAccount: z.string().uuid(),
  client: z.string().uuid(),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ generationId: string }> }): Promise<Response> {
  const [{ generationId }, session] = await Promise.all([context.params, createSupabaseServerClient()]);
  if (!z.string().uuid().safeParse(generationId).success) return Response.json({ error: 'not_found' }, { status: 404 });
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return Response.json({ error: 'not_found' }, { status: 404 });
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const workspace = await loadCurrentAgencyWorkspace({
    userId: user.id,
    supabase: session,
    selectedAccountId: parsed.data.agencyAccount,
    selectedClientId: parsed.data.client,
  });
  if (!workspace || workspace.data.selectedAccountId !== parsed.data.agencyAccount || workspace.data.selectedClientId !== parsed.data.client) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const generation = await createSupabaseBuyerIntelligenceGenerationRepository(workspace.admin)
    .load(generationId, parsed.data.agencyAccount, parsed.data.client);
  if (!generation || generation.status !== 'succeeded' || !generation.artifactR2Key) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const bucket = await resolveReportFilesBucket();
  const artifact = bucket ? await bucket.get(generation.artifactR2Key) : null;
  if (!artifact) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(await artifact.arrayBuffer(), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="buyer-intelligence-${generation.viewKind.replaceAll('_', '-')}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
