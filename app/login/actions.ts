'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const emailSchema = z.object({
  email: z.string().email(),
});

export type LoginActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

function safeNextPath(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '/dashboard';
  }
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

export async function sendMagicLink(
  _prev: LoginActionState | null,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = emailSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL']?.replace(/\/$/, '');
  if (!appUrl) {
    return { ok: false, message: 'App URL is not configured.' };
  }

  const nextPath = safeNextPath(formData.get('next'));
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { ok: false, message: 'Authentication is not configured.' };
  }

  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: 'Check your email for the sign-in link.',
  };
}
