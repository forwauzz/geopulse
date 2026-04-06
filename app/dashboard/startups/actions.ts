'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { applyStartupRolloutFlagPatch } from '@/lib/server/startup-rollout-flags';
import { structuredLog } from '@/lib/server/structured-log';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const workspaceSchema = z.object({
  workspaceKey: z
    .string()
    .min(2, 'Enter a workspace key.')
    .max(80, 'Workspace key is too long.')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only.'),
  name: z.string().min(1, 'Enter a workspace name.').max(120, 'Workspace name is too long.'),
  primaryDomain: z.string().max(160, 'Primary domain is too long.').optional(),
  canonicalDomain: z.string().max(160, 'Canonical domain is too long.').optional(),
  status: z.enum(['pilot', 'active', 'paused', 'archived']),
  billingMode: z.enum(['free', 'paid', 'trial']),
});

const workspaceUserSchema = z.object({
  startupWorkspaceId: z.string().uuid('Choose a valid startup workspace.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['founder', 'admin', 'member', 'viewer']),
});

const rolloutFlagsSchema = z.object({
  startupWorkspaceId: z.string().uuid('Choose a valid startup workspace.'),
  startupDashboard: z.boolean(),
  githubAgent: z.boolean(),
  autoPr: z.boolean(),
  slackAgent: z.boolean(),
  slackAutoPost: z.boolean(),
});

export type StartupAdminActionState =
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

export async function createStartupWorkspace(
  _prev: StartupAdminActionState | null,
  formData: FormData
): Promise<StartupAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = workspaceSchema.safeParse({
    workspaceKey: normalizeText(formData.get('workspaceKey')),
    name: normalizeText(formData.get('name')),
    primaryDomain: normalizeText(formData.get('primaryDomain')),
    canonicalDomain: normalizeText(formData.get('canonicalDomain')),
    status: normalizeText(formData.get('status')),
    billingMode: normalizeText(formData.get('billingMode')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['workspaceKey']?.[0] ??
        errors['name']?.[0] ??
        errors['primaryDomain']?.[0] ??
        errors['canonicalDomain']?.[0] ??
        errors['status']?.[0] ??
        errors['billingMode']?.[0] ??
        'Check the startup workspace values.',
    };
  }

  const payload = {
    workspace_key: parsed.data.workspaceKey,
    name: parsed.data.name,
    primary_domain: normalizeDomain(parsed.data.primaryDomain),
    canonical_domain: normalizeDomain(parsed.data.canonicalDomain ?? parsed.data.primaryDomain),
    status: parsed.data.status,
    billing_mode: parsed.data.billingMode,
    metadata: { source: 'admin_manual' },
  };

  const { error } = await context.adminDb.from('startup_workspaces').insert(payload);
  if (error) return { ok: false, message: error.message };

  revalidatePath('/dashboard/startups');
  return { ok: true, message: 'Startup workspace created.' };
}

export async function createStartupWorkspaceUser(
  _prev: StartupAdminActionState | null,
  formData: FormData
): Promise<StartupAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = workspaceUserSchema.safeParse({
    startupWorkspaceId: normalizeText(formData.get('startupWorkspaceId')),
    email: normalizeText(formData.get('email')),
    password: normalizeText(formData.get('password')),
    role: normalizeText(formData.get('role')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['startupWorkspaceId']?.[0] ??
        errors['email']?.[0] ??
        errors['password']?.[0] ??
        errors['role']?.[0] ??
        'Check the startup member values.',
    };
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  const { data: existingUser, error: existingUserError } = await context.adminDb
    .from('users')
    .select('id,email')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingUserError) return { ok: false, message: existingUserError.message };

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
      return { ok: false, message: createError?.message ?? 'Could not create startup user.' };
    }
    userId = created.user.id;
  } else {
    const { error: updateError } = await authAdmin.auth.admin.updateUserById(userId, {
      password: parsed.data.password,
      email_confirm: true,
    });
    if (updateError) return { ok: false, message: updateError.message };
  }

  const payload = {
    startup_workspace_id: parsed.data.startupWorkspaceId,
    user_id: userId,
    role: parsed.data.role,
    status: 'active',
    metadata: { source: 'admin_manual' },
  };

  const { data: existingMembership, error: membershipLookupError } = await context.adminDb
    .from('startup_workspace_users')
    .select('id')
    .eq('startup_workspace_id', parsed.data.startupWorkspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipLookupError) return { ok: false, message: membershipLookupError.message };

  const { error } = existingMembership
    ? await context.adminDb
        .from('startup_workspace_users')
        .update(payload)
        .eq('id', existingMembership.id)
    : await context.adminDb.from('startup_workspace_users').insert(payload);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/dashboard/startups');
  return { ok: true, message: 'Startup member saved.' };
}

export async function updateStartupWorkspaceRolloutFlags(
  _prev: StartupAdminActionState | null,
  formData: FormData
): Promise<StartupAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = rolloutFlagsSchema.safeParse({
    startupWorkspaceId: normalizeText(formData.get('startupWorkspaceId')),
    startupDashboard: formData.get('startupDashboard') === 'on',
    githubAgent: formData.get('githubAgent') === 'on',
    autoPr: formData.get('autoPr') === 'on',
    slackAgent: formData.get('slackAgent') === 'on',
    slackAutoPost: formData.get('slackAutoPost') === 'on',
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: errors['startupWorkspaceId']?.[0] ?? 'Check rollout flag values.',
    };
  }

  const { data: existing, error: existingError } = await context.adminDb
    .from('startup_workspaces')
    .select('metadata')
    .eq('id', parsed.data.startupWorkspaceId)
    .maybeSingle();
  if (existingError) return { ok: false, message: existingError.message };

  const currentMetadata = (existing?.metadata as Record<string, unknown> | null | undefined) ?? {};
  const nextMetadata = applyStartupRolloutFlagPatch({
    metadata: currentMetadata,
    patch: {
      startupDashboard: parsed.data.startupDashboard,
      githubAgent: parsed.data.githubAgent,
      autoPr: parsed.data.autoPr,
      slackAgent: parsed.data.slackAgent,
      slackAutoPost: parsed.data.slackAutoPost,
    },
  });

  const { error } = await context.adminDb
    .from('startup_workspaces')
    .update({ metadata: nextMetadata })
    .eq('id', parsed.data.startupWorkspaceId);
  if (error) return { ok: false, message: error.message };

  structuredLog(
    'startup_rollout_flags_updated',
    {
      startup_workspace_id: parsed.data.startupWorkspaceId,
      startup_dashboard: parsed.data.startupDashboard,
      github_agent: parsed.data.githubAgent,
      auto_pr: parsed.data.autoPr,
      slack_agent: parsed.data.slackAgent,
      slack_auto_post: parsed.data.slackAutoPost,
    },
    'info'
  );

  revalidatePath('/dashboard/startups');
  revalidatePath('/dashboard/startup');
  return { ok: true, message: 'Startup rollout flags updated.' };
}

const removeMemberSchema = z.object({
  startupWorkspaceId: z.string().uuid('Choose a valid startup workspace.'),
  userId: z.string().uuid('Choose a valid user.'),
});

export async function removeStartupWorkspaceMember(
  _prev: StartupAdminActionState | null,
  formData: FormData
): Promise<StartupAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = removeMemberSchema.safeParse({
    startupWorkspaceId: normalizeText(formData.get('startupWorkspaceId')),
    userId: normalizeText(formData.get('userId')),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['startupWorkspaceId']?.[0] ?? errors['userId']?.[0] ?? 'Check the values.',
    };
  }

  const { error } = await context.adminDb
    .from('startup_workspace_users')
    .delete()
    .eq('startup_workspace_id', parsed.data.startupWorkspaceId)
    .eq('user_id', parsed.data.userId);

  if (error) return { ok: false, message: error.message };

  structuredLog(
    'startup_workspace_member_removed',
    {
      startup_workspace_id: parsed.data.startupWorkspaceId,
      user_id: parsed.data.userId,
    },
    'info'
  );

  revalidatePath('/dashboard/startups');
  return { ok: true, message: 'Member removed.' };
}

const deleteWorkspaceSchema = z.object({
  startupWorkspaceId: z.string().uuid('Choose a valid startup workspace.'),
  confirmName: z.string().min(1, 'Type the workspace name to confirm.'),
});

export async function deleteStartupWorkspace(
  _prev: StartupAdminActionState | null,
  formData: FormData
): Promise<StartupAdminActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = deleteWorkspaceSchema.safeParse({
    startupWorkspaceId: normalizeText(formData.get('startupWorkspaceId')),
    confirmName: normalizeText(formData.get('confirmName')),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['startupWorkspaceId']?.[0] ?? errors['confirmName']?.[0] ?? 'Check the values.',
    };
  }

  const { data: workspace, error: fetchErr } = await context.adminDb
    .from('startup_workspaces')
    .select('name')
    .eq('id', parsed.data.startupWorkspaceId)
    .maybeSingle();
  if (fetchErr) return { ok: false, message: fetchErr.message };
  if (!workspace) return { ok: false, message: 'Workspace not found.' };

  if (workspace.name.trim().toLowerCase() !== parsed.data.confirmName.trim().toLowerCase()) {
    return {
      ok: false,
      message: 'Workspace name does not match. Type the exact name to confirm.',
    };
  }

  const { error } = await context.adminDb
    .from('startup_workspaces')
    .delete()
    .eq('id', parsed.data.startupWorkspaceId);

  if (error) return { ok: false, message: error.message };

  structuredLog(
    'startup_workspace_deleted',
    {
      startup_workspace_id: parsed.data.startupWorkspaceId,
      workspace_name: workspace.name,
    },
    'info'
  );

  revalidatePath('/dashboard/startups');
  return { ok: true, message: `Workspace "${workspace.name}" deleted.` };
}
