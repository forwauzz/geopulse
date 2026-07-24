import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';

export const dynamic = 'force-dynamic';

export default async function VisibilityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/visibility');
  const workspace = await loadCurrentAgencyWorkspace({ userId: user.id, supabase });
  const firstClient = workspace?.data.accounts[0]?.clients[0];
  if (workspace && firstClient) {
    redirect(`/dashboard/clients/${firstClient.id}?agencyAccount=${workspace.data.accounts[0]!.id}`);
  }
  redirect('/dashboard');
}
