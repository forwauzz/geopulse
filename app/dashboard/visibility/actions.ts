'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { updateVisibilityScorecardSharing } from '@/lib/server/visibility-scorecard-service';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  workspaceId: z.string().uuid(),
  mode: z.enum(['enable', 'rotate', 'disable']),
});

export async function updateBusinessScorecardSharing(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    workspaceId: formData.get('workspaceId'),
    mode: formData.get('mode'),
  });
  if (!parsed.success) redirect('/dashboard/visibility?share=invalid');

  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/visibility');
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect('/dashboard/visibility?share=unavailable');
  }
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await updateVisibilityScorecardSharing({
    supabase: admin,
    userId: user.id,
    subject: { kind: 'startup_workspace', id: parsed.data.workspaceId },
    mode: parsed.data.mode,
  });
  revalidatePath('/dashboard/visibility');
  redirect(`/dashboard/visibility?share=${result.ok ? parsed.data.mode : result.code}`);
}
