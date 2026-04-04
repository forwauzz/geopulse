'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { structuredLog } from '@/lib/server/structured-log';
import { isBundleKey, isServiceKey, type BundleKey, type ServiceKey } from '@/lib/server/service-entitlements-contract';

export type ServiceControlActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

type EntitlementScopeType = 'global' | 'bundle_default' | 'agency_account' | 'agency_client' | 'user';
type ServiceAccessMode = 'free' | 'paid' | 'trial' | 'off';

const serviceCatalogSchema = z.object({
  serviceKey: z.string().min(1, 'Choose a service.'),
  defaultAccessMode: z.enum(['free', 'paid', 'trial', 'off']),
  isActive: z.boolean(),
});

const bundleServiceSchema = z.object({
  bundleKey: z.string().min(1, 'Choose a bundle.'),
  serviceKey: z.string().min(1, 'Choose a service.'),
  enabled: z.boolean(),
  accessMode: z.enum(['free', 'paid', 'trial', 'off']).optional(),
  usageLimit: z.coerce.number().int().min(0).optional(),
  stripeProductId: z.string().max(200, 'Stripe product id is too long.').optional(),
  stripePriceId: z.string().max(200, 'Stripe price id is too long.').optional(),
});

const entitlementOverrideSchema = z
  .object({
    serviceKey: z.string().min(1, 'Choose a service.'),
    scopeType: z.enum(['global', 'bundle_default', 'agency_account', 'agency_client', 'user']),
    bundleKey: z.string().optional(),
    agencyAccountId: z.string().uuid('Choose a valid agency account.').optional(),
    agencyClientId: z.string().uuid('Choose a valid agency client.').optional(),
    userId: z.string().uuid('Choose a valid user id.').optional(),
    enabled: z.boolean(),
    accessMode: z.enum(['free', 'paid', 'trial', 'off', 'inherit']),
    usageLimit: z.coerce.number().int().min(0).optional(),
    note: z.string().max(500, 'Note is too long.').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scopeType === 'bundle_default' && !value.bundleKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a bundle for bundle default scope.',
        path: ['bundleKey'],
      });
    }

    if (value.scopeType === 'agency_account' && !value.agencyAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose an agency account for account scope.',
        path: ['agencyAccountId'],
      });
    }

    if (value.scopeType === 'agency_client' && !value.agencyClientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose an agency client for client scope.',
        path: ['agencyClientId'],
      });
    }

    if (value.scopeType === 'user' && !value.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a user id for user scope.',
        path: ['userId'],
      });
    }
  });

function normalizeText(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(raw: FormDataEntryValue | null): boolean {
  return String(raw ?? '') === 'true';
}

function parseOptionalNumber(raw: FormDataEntryValue | null): number | undefined {
  const normalized = normalizeText(raw);
  if (!normalized) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseServiceKey(value: string): ServiceKey | null {
  return isServiceKey(value) ? value : null;
}

function parseBundleKey(value: string | undefined): BundleKey | null {
  if (!value) return null;
  return isBundleKey(value) ? value : null;
}

function normalizeStripeMetadata(args: {
  existing: Record<string, unknown> | null | undefined;
  stripeProductId: string | undefined;
  stripePriceId: string | undefined;
}): Record<string, unknown> {
  const existing = args.existing ?? {};
  const currentStripeValue =
    existing['stripe'] && typeof existing['stripe'] === 'object' && existing['stripe'] !== null
      ? (existing['stripe'] as Record<string, unknown>)
      : {};

  return {
    ...existing,
    stripe: {
      ...currentStripeValue,
      product_id: args.stripeProductId ?? null,
      price_id: args.stripePriceId ?? null,
    },
  };
}

async function loadServiceRow(adminDb: { from(table: string): any }, serviceKey: ServiceKey) {
  const { data, error } = await adminDb
    .from('service_catalog')
    .select('id,service_key,default_access_mode,is_active,metadata')
    .eq('service_key', serviceKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Service not found: ${serviceKey}`);
  return data as {
    id: string;
    service_key: string;
    default_access_mode: ServiceAccessMode;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
  };
}

async function loadBundleRow(adminDb: { from(table: string): any }, bundleKey: BundleKey) {
  const { data, error } = await adminDb
    .from('service_bundles')
    .select('id,bundle_key')
    .eq('bundle_key', bundleKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Bundle not found: ${bundleKey}`);
  return data as { id: string; bundle_key: string };
}

async function logServiceControlChange(args: {
  event: string;
  actorUserId: string;
  serviceKey: string;
  scopeType?: EntitlementScopeType;
  bundleKey?: string | null;
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  userId?: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}) {
  structuredLog(args.event, {
    actorUserId: args.actorUserId,
    serviceKey: args.serviceKey,
    scopeType: args.scopeType,
    bundleKey: args.bundleKey,
    agencyAccountId: args.agencyAccountId,
    agencyClientId: args.agencyClientId,
    userId: args.userId,
    before: JSON.stringify(args.before ?? {}),
    after: JSON.stringify(args.after),
  });
}

export async function upsertServiceCatalogControl(
  _prev: ServiceControlActionState | null,
  formData: FormData
): Promise<ServiceControlActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = serviceCatalogSchema.safeParse({
    serviceKey: normalizeText(formData.get('serviceKey')),
    defaultAccessMode: normalizeText(formData.get('defaultAccessMode')),
    isActive: parseBoolean(formData.get('isActive')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['serviceKey']?.[0] ??
        errors['defaultAccessMode']?.[0] ??
        errors['isActive']?.[0] ??
        'Check the service control values.',
    };
  }

  const serviceKey = parseServiceKey(parsed.data.serviceKey);
  if (!serviceKey) {
    return { ok: false, message: 'Invalid service key.' };
  }

  try {
    const service = await loadServiceRow(context.adminDb, serviceKey);
    const before = {
      default_access_mode: service.default_access_mode,
      is_active: service.is_active,
    };
    const updatePayload = {
      default_access_mode: parsed.data.defaultAccessMode,
      is_active: parsed.data.isActive,
      metadata: {
        ...(service.metadata ?? {}),
        last_updated_by: context.user.id,
        last_updated_source: 'service_control_center',
      },
    };

    const { error } = await context.adminDb.from('service_catalog').update(updatePayload).eq('id', service.id);
    if (error) return { ok: false, message: error.message };

    await logServiceControlChange({
      event: 'service_control_service_updated',
      actorUserId: context.user.id,
      serviceKey,
      before,
      after: updatePayload,
    });

    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/agencies');
    return { ok: true, message: 'Service defaults updated.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update service defaults.' };
  }
}

export async function upsertBundleServiceControl(
  _prev: ServiceControlActionState | null,
  formData: FormData
): Promise<ServiceControlActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = bundleServiceSchema.safeParse({
    bundleKey: normalizeText(formData.get('bundleKey')),
    serviceKey: normalizeText(formData.get('serviceKey')),
    enabled: parseBoolean(formData.get('enabled')),
    accessMode: normalizeText(formData.get('accessMode')),
    usageLimit: parseOptionalNumber(formData.get('usageLimit')),
    stripeProductId: normalizeText(formData.get('stripeProductId')),
    stripePriceId: normalizeText(formData.get('stripePriceId')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['bundleKey']?.[0] ??
        errors['serviceKey']?.[0] ??
        errors['enabled']?.[0] ??
        errors['accessMode']?.[0] ??
        errors['usageLimit']?.[0] ??
        errors['stripeProductId']?.[0] ??
        errors['stripePriceId']?.[0] ??
        'Check the bundle service values.',
    };
  }

  const bundleKey = parseBundleKey(parsed.data.bundleKey);
  if (!bundleKey) return { ok: false, message: 'Invalid bundle key.' };

  const serviceKey = parseServiceKey(parsed.data.serviceKey);
  if (!serviceKey) return { ok: false, message: 'Invalid service key.' };

  try {
    const service = await loadServiceRow(context.adminDb, serviceKey);
    const bundle = await loadBundleRow(context.adminDb, bundleKey);

    const { data: existing, error: existingError } = await context.adminDb
      .from('service_bundle_services')
      .select('id,enabled,access_mode,usage_limit,metadata')
      .eq('bundle_id', bundle.id)
      .eq('service_id', service.id)
      .maybeSingle();
    if (existingError) return { ok: false, message: existingError.message };

    const payload = {
      bundle_id: bundle.id,
      service_id: service.id,
      enabled: parsed.data.enabled,
      access_mode: parsed.data.accessMode ?? null,
      usage_limit: parsed.data.usageLimit ?? null,
      metadata: normalizeStripeMetadata({
        existing: (existing?.metadata as Record<string, unknown> | null) ?? {},
        stripeProductId: parsed.data.stripeProductId,
        stripePriceId: parsed.data.stripePriceId,
      }),
    };

    const { error } = existing
      ? await context.adminDb.from('service_bundle_services').update(payload).eq('id', existing.id)
      : await context.adminDb.from('service_bundle_services').insert(payload);
    if (error) return { ok: false, message: error.message };

    await logServiceControlChange({
      event: 'service_control_bundle_service_upserted',
      actorUserId: context.user.id,
      serviceKey,
      bundleKey,
      before: existing
        ? {
            enabled: existing.enabled,
            access_mode: existing.access_mode,
            usage_limit: existing.usage_limit,
            metadata: existing.metadata,
          }
        : null,
      after: payload,
    });

    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/agencies');
    return { ok: true, message: 'Bundle service mapping updated.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update bundle service mapping.' };
  }
}

function applyScopeFilter(
  query: any,
  scopeType: EntitlementScopeType,
  keys: {
    bundleId: string | null;
    agencyAccountId: string | null;
    agencyClientId: string | null;
    userId: string | null;
  }
) {
  if (scopeType === 'bundle_default') {
    return query.eq('bundle_id', keys.bundleId ?? '');
  }
  if (scopeType === 'agency_account') {
    return query.eq('agency_account_id', keys.agencyAccountId ?? '');
  }
  if (scopeType === 'agency_client') {
    return query.eq('agency_client_id', keys.agencyClientId ?? '');
  }
  if (scopeType === 'user') {
    return query.eq('user_id', keys.userId ?? '');
  }
  return query;
}

export async function upsertServiceEntitlementOverride(
  _prev: ServiceControlActionState | null,
  formData: FormData
): Promise<ServiceControlActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = entitlementOverrideSchema.safeParse({
    serviceKey: normalizeText(formData.get('serviceKey')),
    scopeType: normalizeText(formData.get('scopeType')),
    bundleKey: normalizeText(formData.get('bundleKey')),
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    agencyClientId: normalizeText(formData.get('agencyClientId')),
    userId: normalizeText(formData.get('userId')),
    enabled: parseBoolean(formData.get('enabled')),
    accessMode: normalizeText(formData.get('accessMode')),
    usageLimit: parseOptionalNumber(formData.get('usageLimit')),
    note: normalizeText(formData.get('note')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['serviceKey']?.[0] ??
        errors['scopeType']?.[0] ??
        errors['bundleKey']?.[0] ??
        errors['agencyAccountId']?.[0] ??
        errors['agencyClientId']?.[0] ??
        errors['userId']?.[0] ??
        errors['enabled']?.[0] ??
        errors['accessMode']?.[0] ??
        errors['usageLimit']?.[0] ??
        errors['note']?.[0] ??
        'Check the override values.',
    };
  }

  const serviceKey = parseServiceKey(parsed.data.serviceKey);
  if (!serviceKey) return { ok: false, message: 'Invalid service key.' };

  const bundleKey = parseBundleKey(parsed.data.bundleKey);
  if (parsed.data.scopeType === 'bundle_default' && !bundleKey) {
    return { ok: false, message: 'Invalid bundle key for bundle scope.' };
  }

  try {
    const service = await loadServiceRow(context.adminDb, serviceKey);
    const bundle = bundleKey ? await loadBundleRow(context.adminDb, bundleKey) : null;

    const existingBaseQuery = context.adminDb
      .from('service_entitlement_overrides')
      .select('id,enabled,access_mode,usage_limit,metadata')
      .eq('service_id', service.id)
      .eq('scope_type', parsed.data.scopeType);

    const scopedQuery = applyScopeFilter(existingBaseQuery, parsed.data.scopeType, {
      bundleId: bundle?.id ?? null,
      agencyAccountId: parsed.data.agencyAccountId ?? null,
      agencyClientId: parsed.data.agencyClientId ?? null,
      userId: parsed.data.userId ?? null,
    });

    const { data: existing, error: existingError } = await scopedQuery.maybeSingle();
    if (existingError) return { ok: false, message: existingError.message };

    const payload = {
      service_id: service.id,
      scope_type: parsed.data.scopeType,
      bundle_id: parsed.data.scopeType === 'bundle_default' ? (bundle?.id ?? null) : null,
      agency_account_id:
        parsed.data.scopeType === 'agency_account' ? (parsed.data.agencyAccountId ?? null) : null,
      agency_client_id:
        parsed.data.scopeType === 'agency_client' ? (parsed.data.agencyClientId ?? null) : null,
      user_id: parsed.data.scopeType === 'user' ? (parsed.data.userId ?? null) : null,
      enabled: parsed.data.enabled,
      access_mode: parsed.data.accessMode === 'inherit' ? null : parsed.data.accessMode,
      usage_limit: parsed.data.usageLimit ?? null,
      metadata: {
        source: 'service_control_center',
        note: parsed.data.note ?? null,
        updated_by: context.user.id,
      },
    };

    const { error } = existing
      ? await context.adminDb.from('service_entitlement_overrides').update(payload).eq('id', existing.id)
      : await context.adminDb.from('service_entitlement_overrides').insert(payload);
    if (error) return { ok: false, message: error.message };

    await logServiceControlChange({
      event: 'service_control_override_upserted',
      actorUserId: context.user.id,
      serviceKey,
      scopeType: parsed.data.scopeType,
      bundleKey: bundleKey ?? null,
      agencyAccountId: parsed.data.agencyAccountId ?? null,
      agencyClientId: parsed.data.agencyClientId ?? null,
      userId: parsed.data.userId ?? null,
      before: existing
        ? {
            enabled: existing.enabled,
            access_mode: existing.access_mode,
            usage_limit: existing.usage_limit,
            metadata: existing.metadata,
          }
        : null,
      after: payload,
    });

    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/agencies');
    return { ok: true, message: 'Entitlement override saved.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not save entitlement override.' };
  }
}
