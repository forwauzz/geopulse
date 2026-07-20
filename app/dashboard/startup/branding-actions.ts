'use server';

/**
 * Report-branding server actions for the startup workspace settings tab.
 *
 * Branding lands on customer-facing PDFs, so every mutation requires founder/admin — a viewer must
 * not be able to change what a paying customer's report looks like. All logo bytes are validated
 * server-side (size + magic bytes); a remote logo URL only reaches the network through the SSRF
 * fetch gate inside `importBrandLogoFromUrl`.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  importBrandLogoFromUrl,
  removeBrandLogo,
  resolveReportFilesBucket,
  saveBrandFields,
  storeBrandLogoBytes,
  type BrandScope,
} from '@/lib/server/report-branding-settings';
import { structuredLog } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function brandingUrl(workspaceId: string, code: string): string {
  const params = new URLSearchParams({ startupWorkspace: workspaceId, tab: 'settings', brand: code });
  return `/dashboard/startup?${params.toString()}`;
}

/**
 * Authenticate + authorize (founder/admin) and hand back a service client scoped to the workspace.
 * Redirects (and therefore never returns) on any failure.
 */
async function authorizeBrandingAction(formData: FormData): Promise<{
  workspaceId: string;
  scope: BrandScope;
  serviceSupabase: ReturnType<typeof createServiceRoleClient>;
}> {
  const workspaceId = String(formData.get('startupWorkspaceId') ?? '').trim();
  if (!workspaceId) throw new Error('Missing startup workspace id.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/startup');

  const { data: membership, error } = await supabase
    .from('startup_workspace_users')
    .select('role')
    .eq('startup_workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  const role = typeof membership?.role === 'string' ? membership.role : '';
  if (role !== 'founder' && role !== 'admin') {
    redirect(brandingUrl(workspaceId, 'brand_forbidden'));
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service credentials are not configured.');
  }
  const serviceSupabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    workspaceId,
    scope: { table: 'startup_workspaces', id: workspaceId },
    serviceSupabase,
  };
}

export async function saveStartupBrandSettings(formData: FormData): Promise<void> {
  const { workspaceId, scope, serviceSupabase } = await authorizeBrandingAction(formData);

  const result = await saveBrandFields({
    supabase: serviceSupabase as never,
    scope,
    fields: {
      companyName: String(formData.get('companyName') ?? ''),
      primaryHex: String(formData.get('primaryHex') ?? ''),
      footerNote: String(formData.get('footerNote') ?? ''),
      showPoweredBy: formData.get('showPoweredBy') === 'on',
    },
  });

  revalidatePath('/dashboard/startup');
  redirect(brandingUrl(workspaceId, result.ok ? 'brand_saved' : result.code));
}

export async function uploadStartupBrandLogo(formData: FormData): Promise<void> {
  const { workspaceId, scope, serviceSupabase } = await authorizeBrandingAction(formData);

  const file = formData.get('logoFile');
  if (!(file instanceof File) || file.size === 0) {
    redirect(brandingUrl(workspaceId, 'brand_logo_invalid'));
  }

  const bucket = await resolveReportFilesBucket();
  if (!bucket) redirect(brandingUrl(workspaceId, 'brand_storage_unavailable'));

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await storeBrandLogoBytes({ supabase: serviceSupabase as never, bucket, scope, bytes });
  if (!result.ok) {
    structuredLog('startup_brand_logo_rejected', { startup_workspace_id: workspaceId, code: result.code });
  }

  revalidatePath('/dashboard/startup');
  redirect(brandingUrl(workspaceId, result.ok ? 'brand_logo_saved' : result.code));
}

export async function importStartupBrandLogo(formData: FormData): Promise<void> {
  const { workspaceId, scope, serviceSupabase } = await authorizeBrandingAction(formData);

  const url = String(formData.get('logoUrl') ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    redirect(brandingUrl(workspaceId, 'brand_logo_url_invalid'));
  }

  const bucket = await resolveReportFilesBucket();
  if (!bucket) redirect(brandingUrl(workspaceId, 'brand_storage_unavailable'));

  const result = await importBrandLogoFromUrl({ supabase: serviceSupabase as never, bucket, scope, url });
  if (!result.ok) {
    structuredLog('startup_brand_logo_import_failed', { startup_workspace_id: workspaceId, code: result.code });
  }

  revalidatePath('/dashboard/startup');
  redirect(brandingUrl(workspaceId, result.ok ? 'brand_logo_saved' : result.code));
}

export async function removeStartupBrandLogo(formData: FormData): Promise<void> {
  const { workspaceId, scope, serviceSupabase } = await authorizeBrandingAction(formData);

  const bucket = await resolveReportFilesBucket();
  await removeBrandLogo({ supabase: serviceSupabase as never, bucket: bucket ?? null, scope });

  revalidatePath('/dashboard/startup');
  redirect(brandingUrl(workspaceId, 'brand_logo_removed'));
}
