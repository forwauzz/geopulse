'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  role: z.enum(['business', 'agency']),
  goal: z.enum(['visibility', 'competitors', 'reports']),
  website: z.string().trim().max(240).optional(),
});

export async function completeWelcome(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    role: formData.get('role'),
    goal: formData.get('goal'),
    website: formData.get('website') || undefined,
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

  if (parsed.data.role === 'agency') {
    const params = new URLSearchParams({ bundle: 'agency_core' });
    if (parsed.data.website) params.set('website_url', parsed.data.website);
    redirect(`/pricing?${params.toString()}`);
  }
  const query = parsed.data.website ? `?url=${encodeURIComponent(parsed.data.website)}` : '';
  redirect(`/dashboard${query}`);
}
