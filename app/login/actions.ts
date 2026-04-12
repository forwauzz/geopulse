'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { resolvePostSignupRedirect } from '@/lib/server/billing-onboarding-flow';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const emailSchema = z.object({
  email: z.string().email(),
});

const signupSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter your name.').max(120, 'Name is too long.'),
    organizationName: z.string().trim().max(120, 'Workspace name is too long.').optional(),
    websiteUrl: z.string().trim().max(512, 'Website URL is too long.').optional(),
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string().min(8, 'Confirm your password.'),
    next: z.string().optional(),
    bundle: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

const passwordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const bundleKeySchema = z.enum(['startup_dev', 'agency_core', 'agency_pro']);

export type LoginActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

function safeNextPath(raw: FormDataEntryValue | string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '/dashboard';
  }
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

function readTrimmedField(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === 'string' ? raw.trim() : '';
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
  const mode = readTrimmedField(formData, 'mode');
  const bundleRaw = readTrimmedField(formData, 'bundle');
  const fullName = readTrimmedField(formData, 'full_name');
  const organizationName = readTrimmedField(formData, 'organization_name');
  const websiteUrl = readTrimmedField(formData, 'website_url');
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { ok: false, message: 'Authentication is not configured.' };
  }

  const redirectParams = new URLSearchParams();
  redirectParams.set('next', nextPath);
  if (mode === 'signup') {
    redirectParams.set('mode', 'signup');
  }
  const bundle = bundleKeySchema.safeParse(bundleRaw);
  if (bundle.success) {
    redirectParams.set('bundle', bundle.data);
  }
  if (fullName) {
    redirectParams.set('name', fullName);
  }
  if (organizationName) {
    redirectParams.set('organization_name', organizationName);
  }
  if (websiteUrl) {
    redirectParams.set('website_url', websiteUrl);
  }
  const redirectTo = `${appUrl}/auth/callback?${redirectParams.toString()}`;

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

export async function signUpWithPassword(
  _prev: LoginActionState | null,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get('full_name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirm_password'),
    next: formData.get('next') ?? undefined,
    bundle: formData.get('bundle') ?? undefined,
    organizationName: formData.get('organization_name') ?? undefined,
    websiteUrl: formData.get('website_url') ?? undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first['fullName']?.[0] ??
      first['email']?.[0] ??
      first['password']?.[0] ??
      first['confirmPassword']?.[0] ??
      'Check your sign-up details.';
    return { ok: false, message: msg };
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL']?.replace(/\/$/, '');
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!appUrl || !supabaseUrl || !serviceKey) {
    return { ok: false, message: 'Authentication is not configured.' };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { ok: false, message: 'Authentication is not configured.' };
  }

  const authAdmin = createServiceRoleClient(supabaseUrl, serviceKey);
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const normalizedName = parsed.data.fullName.trim();
  const normalizedOrganizationName = parsed.data.organizationName?.trim() ?? '';
  const normalizedWebsiteUrl = parsed.data.websiteUrl?.trim() ?? '';

  const { data: created, error: createError } = await authAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: normalizedName ? { full_name: normalizedName } : undefined,
  });

  if (createError || !created.user) {
    const message = createError?.message ?? 'Could not create your account.';
    if (message.toLowerCase().includes('already registered')) {
      return { ok: false, message: 'An account already exists for that email. Sign in instead.' };
    }
    return { ok: false, message };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: parsed.data.password,
  });

  if (signInError) {
    return { ok: false, message: signInError.message };
  }

  if (normalizedName) {
    await authAdmin.from('users').update({ full_name: normalizedName }).eq('id', created.user.id);
  }

  const nextPath = safeNextPath(parsed.data.next);
  const redirectTarget = resolvePostSignupRedirect({
    nextParam: nextPath,
    bundleParam: parsed.data.bundle ?? null,
    isNewUser: true,
    organizationName: normalizedOrganizationName || null,
    websiteUrl: normalizedWebsiteUrl || null,
  });
  redirect(redirectTarget ?? nextPath);
}

export async function signInWithPassword(
  _prev: LoginActionState | null,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = passwordLoginSchema.safeParse({
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
    return { ok: false, message: 'Invalid email or password.' };
  }

  const nextPath = safeNextPath(formData.get('next'));
  const bundleRaw = readTrimmedField(formData, 'bundle');
  const bundle = bundleKeySchema.safeParse(bundleRaw);
  const redirectTarget = resolvePostSignupRedirect({
    nextParam: nextPath,
    bundleParam: bundle.success ? bundle.data : null,
    isNewUser: false,
    organizationName: readTrimmedField(formData, 'organization_name') || null,
  });
  redirect(redirectTarget ?? nextPath);
}
