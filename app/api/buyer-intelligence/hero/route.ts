import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { resolveReportFilesBucket } from '@/lib/server/report-branding-settings';
import { readBuyerIntelligenceHeroRef } from '@/lib/server/buyer-intelligence-hero';

export const runtime = 'nodejs';

const querySchema = z.object({ agencyAccount: z.string().uuid(), client: z.string().uuid() }).strict();

export async function GET(request: Request): Promise<Response> {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: 'not_found' }, { status: 404 });
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const workspace = await loadCurrentAgencyWorkspace({ userId: user.id, supabase: session, selectedAccountId: parsed.data.agencyAccount, selectedClientId: parsed.data.client });
  if (!workspace || workspace.data.selectedAccountId !== parsed.data.agencyAccount || workspace.data.selectedClientId !== parsed.data.client) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const { data } = await workspace.admin.from('agency_clients').select('metadata').eq('id', parsed.data.client).eq('agency_account_id', parsed.data.agencyAccount).maybeSingle();
  const hero = readBuyerIntelligenceHeroRef(data?.metadata);
  const bucket = await resolveReportFilesBucket();
  const object = hero && bucket ? await bucket.get(hero.key) : null;
  if (!hero || !object) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(await object.arrayBuffer(), { headers: { 'content-type': hero.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
