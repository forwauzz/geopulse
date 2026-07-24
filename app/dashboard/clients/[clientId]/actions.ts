'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';

const schema = z.object({
  clientId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  configId: z.string().uuid(),
  cadence: z.enum(['monthly', 'biweekly', 'weekly']),
  reportEmail: z.string().trim().email().or(z.literal('')),
  competitorList: z.string().max(1200),
});

export async function saveClientMonitoring(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    configId: formData.get('configId'),
    cadence: formData.get('cadence'),
    reportEmail: formData.get('reportEmail'),
    competitorList: formData.get('competitorList') ?? '',
  });
  if (!parsed.success) return;

  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/clients');
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: membership } = await admin
    .from('agency_users')
    .select('role')
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership || membership.role === 'viewer') return;

  const { data: client } = await admin
    .from('agency_clients')
    .select('id')
    .eq('id', parsed.data.clientId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('status', 'active')
    .maybeSingle();
  if (!client) return;

  const competitors = Array.from(
    new Set(
      parsed.data.competitorList
        .split(/[\r\n,]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 20);
  await admin
    .from('client_benchmark_configs')
    .update({
      cadence: parsed.data.cadence,
      report_email: parsed.data.reportEmail || null,
      competitor_list: competitors,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId);

  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&monitoring=saved`);
}
