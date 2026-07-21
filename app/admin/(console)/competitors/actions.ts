'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getScanApiEnv } from '@/lib/server/cf-env';
import {
  removeCohortDomain,
  scanCohortDomain,
  upsertCohortDomain,
  type CohortEnvLike,
} from '@/lib/server/competitor-cohorts';

export async function addCohortDomainAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const url = String(formData.get('url') ?? '').trim();
  const vertical = String(formData.get('vertical') ?? '').trim();
  const geoRegion = String(formData.get('geoRegion') ?? '').trim();
  if (!url || !vertical || !geoRegion) return;

  const result = await upsertCohortDomain(ctx.adminDb, {
    url,
    displayName: String(formData.get('displayName') ?? '').trim() || null,
    vertical,
    geoRegion,
    isCustomer: String(formData.get('isCustomer') ?? '') === 'on',
  });
  revalidatePath('/admin/competitors');
  if (!result.ok) {
    redirect(`/admin/competitors?addError=${encodeURIComponent(result.reason.slice(0, 200))}`);
  }
}

export async function removeCohortDomainAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('domainId') ?? '').trim();
  if (!id) return;
  await removeCohortDomain(ctx.adminDb, id);
  revalidatePath('/admin/competitors');
}

export async function scanCohortDomainNowAction(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('domainId') ?? '').trim();
  if (!id) return;

  const { data } = await ctx.adminDb
    .from('benchmark_domains')
    .select('id,domain,canonical_domain,site_url,metadata')
    .eq('id', id)
    .maybeSingle();
  if (!data) return;

  const env = (await getScanApiEnv()) as CohortEnvLike;
  await scanCohortDomain(ctx.adminDb, env, {
    id: data.id,
    domain: data.domain,
    canonical_domain: data.canonical_domain,
    site_url: data.site_url ?? null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
  });
  revalidatePath('/admin/competitors');
}
