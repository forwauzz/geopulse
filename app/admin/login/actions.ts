'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export type AdminLoginState =
  | { ok: true }
  | { ok: false; message: string };

const GENERIC_AUTH_ERROR = 'Invalid email or password.';

function safeNextPath(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '/dashboard';
  }
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

export async function signInAdminWithPassword(
  _prev: AdminLoginState | null,
  formData: FormData
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first['email']?.[0] ?? first['password']?.[0] ?? 'Check your email and password.';
    return { ok: false, message: msg };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { ok: false, message: 'Authentication is not configured.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim(),
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, message: GENERIC_AUTH_ERROR };
  }

  const dbPlatformAdmin = await isUserPlatformAdmin(data.user.id);
  if (!dbPlatformAdmin) {
    await supabase.auth.signOut();
    return { ok: false, message: GENERIC_AUTH_ERROR };
  }

  const nextPath = safeNextPath(formData.get('next'));
  redirect(nextPath);
}
