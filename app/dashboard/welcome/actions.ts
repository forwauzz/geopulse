'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ensureFreeVisibilityWorkspace } from '@/lib/server/customer-visibility-baseline';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const schema = z.object({
  role: z.enum(['business', 'agency']),
  goal: z.enum(['visibility', 'competitors', 'reports']),
  website: z.string().trim().max(240).optional(),
  bundle: z.enum(['startup_dev', 'agency_core', 'agency_pro']).optional(),
  autosubscribe: z.literal('1').optional(),
  organizationName: z.string().trim().max(120).optional(),
  qaToken: z.string().trim().max(160).optional(),
});

export async function completeWelcome(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    role: formData.get('role'),
    goal: formData.get('goal'),
    website: formData.get('website') || undefined,
    bundle: formData.get('bundle') || undefined,
    autosubscribe: formData.get('autosubscribe') || undefined,
    organizationName: formData.get('organization_name') || undefined,
    qaToken: formData.get('qa_token') || undefined,
  });
  if (!parsed.success) redirect('/dashboard/welcome?error=check_details');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/welcome');

  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      gp_onboarding_v1: {
        role: parsed.data.role,
        goal: parsed.data.goal,
        website: parsed.data.website ?? null,
        completed_at: new Date().toISOString(),
      },
    },
  });
  if (error) redirect('/dashboard/welcome?error=save_failed');

  if (parsed.data.role === 'business' && parsed.data.website && !parsed.data.bundle) {
    const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (url && key) {
      await ensureFreeVisibilityWorkspace({
        supabase: createServiceRoleClient(url, key),
        userId: user.id,
        userEmail: user.email,
        domain: parsed.data.website,
      });
    }
  }

  if (parsed.data.bundle && parsed.data.autosubscribe === '1') {
    const params = new URLSearchParams({
      bundle: parsed.data.bundle,
      autosubscribe: '1',
    });
    if (parsed.data.organizationName) {
      params.set('organization_name', parsed.data.organizationName);
    }
    if (parsed.data.website) {
      params.set('website_url', parsed.data.website);
    }
    if (parsed.data.qaToken) {
      params.set('qa_token', parsed.data.qaToken);
    }
    redirect(`/pricing?${params.toString()}`);
  }

  if (parsed.data.role === 'agency') {
    const params = new URLSearchParams({ bundle: 'agency_core' });
    if (parsed.data.website) params.set('website_url', parsed.data.website);
    redirect(`/pricing?${params.toString()}`);
  }
  const query = parsed.data.website ? `?url=${encodeURIComponent(parsed.data.website)}` : '';
  redirect(`/dashboard${query}`);
}
