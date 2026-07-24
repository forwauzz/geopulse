'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  importBrandLogoFromUrl,
  removeBrandLogo,
  resolveReportFilesBucket,
  saveBrandFields,
  storeBrandLogoBytes,
  type BrandScope,
} from '@/lib/server/report-branding-settings';

function destination(accountId: string, code: string): string {
  return `/dashboard/workspace?agencyAccount=${encodeURIComponent(accountId)}&brand=${encodeURIComponent(code)}`;
}

async function authorize(formData: FormData) {
  const accountId = String(formData.get('agencyAccountId') ?? '').trim();
  if (!accountId) throw new Error('Missing agency account.');
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/workspace');
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Branding is not configured.');
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: membership } = await admin
    .from('agency_users')
    .select('role')
    .eq('agency_account_id', accountId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership || membership.role === 'viewer') redirect(destination(accountId, 'forbidden'));
  return {
    accountId,
    admin,
    scope: { table: 'agency_accounts', id: accountId } satisfies BrandScope,
  };
}

export async function saveAgencyBranding(formData: FormData): Promise<void> {
  const { accountId, admin, scope } = await authorize(formData);
  const result = await saveBrandFields({
    supabase: admin as never,
    scope,
    fields: {
      companyName: String(formData.get('companyName') ?? ''),
      primaryHex: String(formData.get('primaryHex') ?? ''),
      footerNote: String(formData.get('footerNote') ?? ''),
      showPoweredBy: formData.get('showPoweredBy') === 'on',
    },
  });
  revalidatePath('/dashboard/workspace');
  redirect(destination(accountId, result.ok ? 'saved' : result.code));
}

export async function uploadAgencyBrandLogo(formData: FormData): Promise<void> {
  const { accountId, admin, scope } = await authorize(formData);
  const file = formData.get('logoFile');
  if (!(file instanceof File) || file.size === 0) redirect(destination(accountId, 'logo_invalid'));
  const bucket = await resolveReportFilesBucket();
  if (!bucket) redirect(destination(accountId, 'storage_unavailable'));
  const result = await storeBrandLogoBytes({
    supabase: admin as never,
    bucket,
    scope,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  revalidatePath('/dashboard/workspace');
  redirect(destination(accountId, result.ok ? 'logo_saved' : result.code));
}

export async function importAgencyBrandLogo(formData: FormData): Promise<void> {
  const { accountId, admin, scope } = await authorize(formData);
  const url = String(formData.get('logoUrl') ?? '').trim();
  if (!/^https?:\/\//i.test(url)) redirect(destination(accountId, 'logo_invalid'));
  const bucket = await resolveReportFilesBucket();
  if (!bucket) redirect(destination(accountId, 'storage_unavailable'));
  const result = await importBrandLogoFromUrl({ supabase: admin as never, bucket, scope, url });
  revalidatePath('/dashboard/workspace');
  redirect(destination(accountId, result.ok ? 'logo_saved' : result.code));
}

export async function removeAgencyBrandLogo(formData: FormData): Promise<void> {
  const { accountId, admin, scope } = await authorize(formData);
  const bucket = await resolveReportFilesBucket();
  await removeBrandLogo({ supabase: admin as never, bucket: bucket ?? null, scope });
  revalidatePath('/dashboard/workspace');
  redirect(destination(accountId, 'logo_removed'));
}
