import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveReportSettings } from '@/lib/server/report-settings';
import { getReportOverride } from '@/lib/server/report-settings-store';
import { loadLatestAgencyReport } from '@/lib/server/load-agency-report-snapshot';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { ReportContentsSettings } from '@/components/report-contents-settings';
import { saveAgencyReportSettings } from './actions';

export const dynamic = 'force-dynamic';

export default async function ReportContentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/workspace/report-contents');

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_account_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const agencyAccountId = membership?.agency_account_id ?? null;

  if (!agencyAccountId) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Settings</p>
        <h1 className="mt-2 font-headline text-2xl font-semibold text-on-background">Report contents</h1>
        <p className="mt-3 text-sm text-on-surface-variant">
          Report contents are configured per agency workspace. This account is not a member of one.
        </p>
        <Link href="/dashboard/workspace" className="mt-5 inline-flex text-sm font-semibold text-primary">
          Back to settings
        </Link>
      </div>
    );
  }

  const { data: account } = await supabase
    .from('agency_accounts')
    .select('name, metadata')
    .eq('id', agencyAccountId)
    .maybeSingle();

  const override = await getReportOverride({
    supabase: supabase as never,
    scope: { table: 'agency_accounts', id: agencyAccountId },
  });
  const settings = resolveReportSettings(override);

  // Preview against a real client — the most recently added one with a domain. Read-only.
  const { data: previewClient } = await supabase
    .from('agency_clients')
    .select('id')
    .eq('agency_account_id', agencyAccountId)
    .eq('status', 'active')
    .not('canonical_domain', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // The benchmark tables are not readable under the caller's row-level security, so a user-scoped
  // read returns null with no error and the preview silently loses every measured figure.
  // Authorization is the agency membership check above; the read itself uses the service role.
  const env = await getScanApiEnv();
  const reader =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : supabase;

  const previewReport = previewClient?.id
    ? await loadLatestAgencyReport({ supabase: reader, agencyClientId: previewClient.id })
    : null;

  const brand = (account?.metadata as Record<string, unknown> | null)?.['brand'] as
    | Record<string, unknown>
    | undefined;
  const brandName =
    typeof brand?.['companyName'] === 'string' && brand['companyName']
      ? (brand['companyName'] as string)
      : (account?.name ?? 'Your agency');
  const brandColor =
    typeof brand?.['primary'] === 'string' && /^#[0-9a-f]{6}$/i.test(brand['primary'] as string)
      ? (brand['primary'] as string)
      : '#565E74';

  return (
    <div className="py-2">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Settings</p>
        <h1 className="mt-1.5 font-headline text-2xl font-semibold text-on-background">Report contents</h1>
        <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
          Set this once. Every client report uses it unless you change something for that client specifically.
        </p>
      </div>

      <ReportContentsSettings
        agencyName={account?.name ?? 'agency'}
        initialSettings={settings}
        initialOverride={override}
        saveAction={saveAgencyReportSettings}
        previewSnapshot={previewReport?.snapshot ?? null}
        brandName={brandName}
        brandColor={brandColor}
      />
    </div>
  );
}
