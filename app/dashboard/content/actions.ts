'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';

export async function updateContentDestinationConfig(formData: FormData) {
  const actionContext = await loadAdminActionContext();
  if (!actionContext.ok) {
    throw new Error(actionContext.message);
  }

  const destinationId = String(formData.get('destinationId') ?? '').trim();
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  const availabilityStatus = String(formData.get('availabilityStatus') ?? '').trim();
  const availabilityReason = String(formData.get('availabilityReason') ?? '').trim();

  if (!destinationId) {
    throw new Error('Missing destination id.');
  }

  const allowedAvailabilityStatuses = new Set([
    'available',
    'not_configured',
    'plan_blocked',
    'api_unavailable',
    'disabled',
  ]);

  if (!allowedAvailabilityStatuses.has(availabilityStatus)) {
    throw new Error('Invalid availability status.');
  }

  const { error } = await actionContext.adminDb
    .from('content_distribution_destinations')
    .update({
      enabled,
      availability_status: availabilityStatus,
      availability_reason: availabilityReason || null,
      is_default: false,
    })
    .eq('id', destinationId);

  if (error) {
    throw error;
  }

  revalidatePath('/dashboard/content');
}
