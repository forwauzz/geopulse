import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCurrentAgencyWorkspace } from '@/lib/server/current-agency-workspace';
import { loadAgencyPortfolio } from '@/lib/server/agency-portfolio';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { loadCustomerVisibilityView } from '@/lib/server/customer-visibility-view';
import { AgencyVisibilityExperience, CustomerVisibilityExperience } from '@/components/visibility-experience';

export const dynamic = 'force-dynamic';

export default async function VisibilityPage({
  searchParams,
}: {
  readonly searchParams?: Promise<{ agencyAccount?: string }>;
}) {
  const sp = await (searchParams ?? Promise.resolve({} as { agencyAccount?: string }));
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/visibility');
  const agency = await loadCurrentAgencyWorkspace({
    userId: user.id,
    supabase,
    selectedAccountId: sp.agencyAccount,
  });
  if (agency) {
    const account = agency.data.accounts.find((row) => row.id === agency.data.selectedAccountId) ?? agency.data.accounts[0]!;
    const portfolio = await loadAgencyPortfolio({ supabase: agency.admin, data: agency.data, account });
    return <AgencyVisibilityExperience accountName={account.name} accountId={account.id} portfolio={portfolio} />;
  }

  const env = await getScanApiEnv();
  const admin = env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase;
  const view = await loadCustomerVisibilityView({ supabase: admin, userId: user.id });
  if (!view) redirect('/dashboard/welcome');
  return <CustomerVisibilityExperience view={view} />;
}
