'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';

const accountSchema = z.object({
  accountKey: z
    .string()
    .min(2, 'Enter an account key.')
    .max(80, 'Account key is too long.')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only.'),
  name: z.string().min(1, 'Enter an account name.').max(120, 'Account name is too long.'),
  websiteDomain: z.string().max(160, 'Website domain is too long.').optional(),
  canonicalDomain: z.string().max(160, 'Canonical domain is too long.').optional(),
  benchmarkVertical: z.string().max(80, 'Vertical is too long.').optional(),
  benchmarkSubvertical: z.string().max(80, 'Subvertical is too long.').optional(),
});

const clientSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  clientKey: z
    .string()
    .min(2, 'Enter a client key.')
    .max(80, 'Client key is too long.')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only.'),
  name: z.string().min(1, 'Enter a client name.').max(120, 'Client name is too long.'),
  displayName: z.string().max(120, 'Display name is too long.').optional(),
  websiteDomain: z.string().max(160, 'Website domain is too long.').optional(),
  canonicalDomain: z.string().max(160, 'Canonical domain is too long.').optional(),
  vertical: z.string().max(80, 'Vertical is too long.').optional(),
  subvertical: z.string().max(80, 'Subvertical is too long.').optional(),
  icpTag: z.string().max(80, 'ICP tag is too long.').optional(),
});

const flagSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  agencyClientId: z.string().uuid('Choose a valid client id.').optional(),
  flagKey: z
    .string()
    .min(2, 'Enter a flag key.')
    .max(120, 'Flag key is too long.')
    .regex(/^[a-z0-9_:-]+$/, 'Use lowercase letters, numbers, underscores, colons, or hyphens only.'),
  enabled: z.boolean(),
});

const modelPolicySchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  agencyClientId: z.string().uuid('Choose a valid client id.').optional(),
  productSurface: z.enum(['deep_audit', 'free_scan', 'benchmark', 'report_rewrite']),
  providerName: z.enum(['gemini', 'openai', 'anthropic', 'custom']),
  modelId: z.string().min(1, 'Enter a model id.').max(160, 'Model id is too long.'),
});

const agencyUserSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['owner', 'manager', 'member', 'viewer']),
});

export type AgencyAdminActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

function normalizeText(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

export async function createAgencyAccount(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = accountSchema.safeParse({
    accountKey: normalizeText(formData.get('accountKey')),
    name: normalizeText(formData.get('name')),
    websiteDomain: normalizeText(formData.get('websiteDomain')),
    canonicalDomain: normalizeText(formData.get('canonicalDomain')),
    benchmarkVertical: normalizeText(formData.get('benchmarkVertical')),
    benchmarkSubvertical: normalizeText(formData.get('benchmarkSubvertical')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['accountKey']?.[0] ??
        errors['name']?.[0] ??
        errors['websiteDomain']?.[0] ??
        errors['canonicalDomain']?.[0] ??
        errors['benchmarkVertical']?.[0] ??
        errors['benchmarkSubvertical']?.[0] ??
        'Check the agency account values.',
    };
  }

  const payload = {
    account_key: parsed.data.accountKey,
    name: parsed.data.name,
    website_domain: normalizeDomain(parsed.data.websiteDomain),
    canonical_domain: normalizeDomain(parsed.data.canonicalDomain ?? parsed.data.websiteDomain),
    status: 'pilot',
    billing_mode: 'pilot_exempt',
    benchmark_vertical: parsed.data.benchmarkVertical ?? null,
    benchmark_subvertical: parsed.data.benchmarkSubvertical ?? null,
    metadata: { source: 'admin_manual' },
  };

  const { error } = await context.adminDb.from('agency_accounts').insert(payload);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: 'Agency account created.' };
}

export async function createAgencyClient(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = clientSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    clientKey: normalizeText(formData.get('clientKey')),
    name: normalizeText(formData.get('name')),
    displayName: normalizeText(formData.get('displayName')),
    websiteDomain: normalizeText(formData.get('websiteDomain')),
    canonicalDomain: normalizeText(formData.get('canonicalDomain')),
    vertical: normalizeText(formData.get('vertical')),
    subvertical: normalizeText(formData.get('subvertical')),
    icpTag: normalizeText(formData.get('icpTag')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ??
        errors['clientKey']?.[0] ??
        errors['name']?.[0] ??
        errors['displayName']?.[0] ??
        errors['websiteDomain']?.[0] ??
        errors['canonicalDomain']?.[0] ??
        errors['vertical']?.[0] ??
        errors['subvertical']?.[0] ??
        errors['icpTag']?.[0] ??
        'Check the agency client values.',
    };
  }

  const payload = {
    agency_account_id: parsed.data.agencyAccountId,
    client_key: parsed.data.clientKey,
    name: parsed.data.name,
    display_name: parsed.data.displayName ?? null,
    website_domain: normalizeDomain(parsed.data.websiteDomain),
    canonical_domain: normalizeDomain(parsed.data.canonicalDomain ?? parsed.data.websiteDomain),
    status: 'active',
    vertical: parsed.data.vertical ?? null,
    subvertical: parsed.data.subvertical ?? null,
    icp_tag: parsed.data.icpTag ?? null,
    metadata: { source: 'admin_manual' },
  };

  const { error } = await context.adminDb.from('agency_clients').insert(payload);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: 'Agency client created.' };
}

export async function upsertAgencyFeatureFlag(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = flagSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    agencyClientId: normalizeText(formData.get('agencyClientId')),
    flagKey: normalizeText(formData.get('flagKey')),
    enabled: String(formData.get('enabled') ?? '') === 'true',
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ??
        errors['agencyClientId']?.[0] ??
        errors['flagKey']?.[0] ??
        errors['enabled']?.[0] ??
        'Check the feature flag values.',
    };
  }

  const payload = {
    agency_account_id: parsed.data.agencyAccountId,
    agency_client_id: parsed.data.agencyClientId ?? null,
    flag_key: parsed.data.flagKey,
    enabled: parsed.data.enabled,
    config: {},
    metadata: { source: 'admin_manual' },
  };

  let existingQuery = context.adminDb
    .from('agency_feature_flags')
    .select('id')
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('flag_key', parsed.data.flagKey);

  existingQuery = parsed.data.agencyClientId
    ? existingQuery.eq('agency_client_id', parsed.data.agencyClientId)
    : existingQuery.is('agency_client_id', null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  const { error } = existing
    ? await context.adminDb.from('agency_feature_flags').update(payload).eq('id', existing.id)
    : await context.adminDb.from('agency_feature_flags').insert(payload);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: 'Feature flag updated.' };
}

export async function upsertAgencyModelPolicy(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = modelPolicySchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    agencyClientId: normalizeText(formData.get('agencyClientId')),
    productSurface: normalizeText(formData.get('productSurface')),
    providerName: normalizeText(formData.get('providerName')),
    modelId: normalizeText(formData.get('modelId')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ??
        errors['agencyClientId']?.[0] ??
        errors['productSurface']?.[0] ??
        errors['providerName']?.[0] ??
        errors['modelId']?.[0] ??
        'Check the model policy values.',
    };
  }

  const payload = {
    agency_account_id: parsed.data.agencyAccountId,
    agency_client_id: parsed.data.agencyClientId ?? null,
    product_surface: parsed.data.productSurface,
    provider_name: parsed.data.providerName,
    model_id: parsed.data.modelId,
    is_active: true,
    metadata: { source: 'admin_manual' },
  };

  let existingQuery = context.adminDb
    .from('agency_model_policies')
    .select('id')
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('product_surface', parsed.data.productSurface);

  existingQuery = parsed.data.agencyClientId
    ? existingQuery.eq('agency_client_id', parsed.data.agencyClientId)
    : existingQuery.is('agency_client_id', null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  const { error } = existing
    ? await context.adminDb.from('agency_model_policies').update(payload).eq('id', existing.id)
    : await context.adminDb.from('agency_model_policies').insert(payload);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: 'Model policy updated.' };
}

export async function createAgencyUser(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = agencyUserSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    email: normalizeText(formData.get('email')),
    password: normalizeText(formData.get('password')),
    role: normalizeText(formData.get('role')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ??
        errors['email']?.[0] ??
        errors['password']?.[0] ??
        errors['role']?.[0] ??
        'Check the agency user values.',
    };
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const { data: existingUser, error: existingUserError } = await context.adminDb
    .from('users')
    .select('id,email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingUserError) {
    return { ok: false, message: existingUserError.message };
  }

  let userId = existingUser?.id ?? null;

  if (!context.env.NEXT_PUBLIC_SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: 'Authentication admin access is not configured.' };
  }

  const authAdmin = createServiceRoleClient(
    context.env.NEXT_PUBLIC_SUPABASE_URL,
    context.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!userId) {
    const { data: created, error: createError } = await authAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: parsed.data.password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return { ok: false, message: createError?.message ?? 'Could not create agency user.' };
    }

    userId = created.user.id;
  } else {
    const { error: updateError } = await authAdmin.auth.admin.updateUserById(userId, {
      password: parsed.data.password,
      email_confirm: true,
    });

    if (updateError) {
      return { ok: false, message: updateError.message };
    }
  }

  const membershipPayload = {
    agency_account_id: parsed.data.agencyAccountId,
    user_id: userId,
    role: parsed.data.role,
    status: 'active',
    metadata: { source: 'admin_manual' },
  };

  const { data: existingMembership, error: membershipLookupError } = await context.adminDb
    .from('agency_users')
    .select('id')
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipLookupError) {
    return { ok: false, message: membershipLookupError.message };
  }

  const { error } = existingMembership
    ? await context.adminDb
        .from('agency_users')
        .update(membershipPayload)
        .eq('id', existingMembership.id)
    : await context.adminDb.from('agency_users').insert(membershipPayload);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: 'Agency user saved.' };
}

const removeAgencyMemberSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  userId: z.string().uuid('Choose a valid user.'),
});

export async function removeAgencyMember(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = removeAgencyMemberSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    userId: normalizeText(formData.get('userId')),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ?? errors['userId']?.[0] ?? 'Check the values.',
    };
  }

  const { error } = await context.adminDb
    .from('agency_users')
    .delete()
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('user_id', parsed.data.userId);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: 'Member removed.' };
}

const deleteAgencyAccountSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  confirmName: z.string().min(1, 'Type the account name to confirm.'),
});

export async function deleteAgencyAccount(
  _prev: AgencyAdminActionState | null,
  formData: FormData
): Promise<AgencyAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = deleteAgencyAccountSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    confirmName: normalizeText(formData.get('confirmName')),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ?? errors['confirmName']?.[0] ?? 'Check the values.',
    };
  }

  const { data: account, error: fetchErr } = await context.adminDb
    .from('agency_accounts')
    .select('name')
    .eq('id', parsed.data.agencyAccountId)
    .maybeSingle();
  if (fetchErr) return { ok: false, message: fetchErr.message };
  if (!account) return { ok: false, message: 'Account not found.' };

  if (account.name.trim().toLowerCase() !== parsed.data.confirmName.trim().toLowerCase()) {
    return {
      ok: false,
      message: 'Account name does not match. Type the exact name to confirm.',
    };
  }

  const { error } = await context.adminDb
    .from('agency_accounts')
    .delete()
    .eq('id', parsed.data.agencyAccountId);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/dashboard/agencies');
  return { ok: true, message: `Account "${account.name}" deleted.` };
}
