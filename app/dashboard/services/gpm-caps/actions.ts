'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createGpmAdminData } from '@/lib/server/geo-performance-admin-data';
import { structuredLog } from '@/lib/server/structured-log';
import type { GeoPerformanceCadence, GeoPerformanceDeliverySurface } from '@/lib/server/geo-performance-entitlements';

export type GpmCapsActionState = { ok: true; message: string } | { ok: false; message: string };

const VALID_BUNDLE_KEYS = ['startup_dev', 'agency_core', 'agency_pro'] as const;
const VALID_CADENCES: readonly GeoPerformanceCadence[] = ['monthly', 'biweekly', 'weekly'];
const VALID_DELIVERY_SURFACES: readonly GeoPerformanceDeliverySurface[] = ['email', 'slack', 'portal'];

const updateBundleCapsSchema = z.object({
  bundleKey: z.enum(VALID_BUNDLE_KEYS),
  maxPromptsPerRun: z
    .union([z.literal('unlimited'), z.coerce.number().int().min(1).max(9999)])
    .optional(),
  allowedCadences: z.array(z.enum(['monthly', 'biweekly', 'weekly'])).min(1),
  deliverySurfaces: z.array(z.enum(['email', 'slack', 'portal'])).min(1),
});

export async function updateGpmBundleCapsAction(
  _prev: GpmCapsActionState | null,
  formData: FormData
): Promise<GpmCapsActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const rawMaxPrompts = formData.get('maxPromptsPerRun');
  const maxPromptsRaw =
    rawMaxPrompts === 'unlimited' || rawMaxPrompts === ''
      ? 'unlimited'
      : rawMaxPrompts;

  const parsed = updateBundleCapsSchema.safeParse({
    bundleKey: formData.get('bundleKey'),
    maxPromptsPerRun: maxPromptsRaw,
    allowedCadences: formData.getAll('allowedCadences'),
    deliverySurfaces: formData.getAll('deliverySurfaces'),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['bundleKey']?.[0] ??
        errors['maxPromptsPerRun']?.[0] ??
        errors['allowedCadences']?.[0] ??
        errors['deliverySurfaces']?.[0] ??
        'Check the bundle cap values.',
    };
  }

  const maxPromptsPerRun =
    parsed.data.maxPromptsPerRun === 'unlimited' || parsed.data.maxPromptsPerRun === undefined
      ? null
      : (parsed.data.maxPromptsPerRun as number);

  try {
    const gpmData = createGpmAdminData(context.adminDb);
    await gpmData.updateBundleCaps(parsed.data.bundleKey, {
      maxPromptsPerRun,
      allowedCadences: parsed.data.allowedCadences as GeoPerformanceCadence[],
      deliverySurfaces: parsed.data.deliverySurfaces as GeoPerformanceDeliverySurface[],
    });

    structuredLog('gpm_bundle_caps_updated', {
      actorUserId: context.user.id,
      bundleKey: parsed.data.bundleKey,
      maxPromptsPerRun: maxPromptsPerRun ?? 'unlimited',
      allowedCadences: parsed.data.allowedCadences.join(','),
      deliverySurfaces: parsed.data.deliverySurfaces.join(','),
    });

    revalidatePath('/dashboard/services');
    return { ok: true, message: `Caps updated for ${parsed.data.bundleKey}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not update bundle caps.',
    };
  }
}
