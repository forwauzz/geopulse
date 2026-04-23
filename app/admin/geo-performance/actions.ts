'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createBenchmarkRepository } from '@/lib/server/benchmark-repository';
import { structuredLog } from '@/lib/server/structured-log';

const REVALIDATE_PATH = '/admin/geo-performance';

function parseCompetitorList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parsePlatforms(formData: FormData): string[] {
  const all = ['chatgpt', 'gemini', 'perplexity'];
  return all.filter((p) => formData.get(`platform_${p}`) === 'on');
}

export async function createClientBenchmarkConfig(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const startupWorkspaceId = (formData.get('startup_workspace_id') as string | null)?.trim() || null;
  const agencyAccountId = (formData.get('agency_account_id') as string | null)?.trim() || null;
  const benchmarkDomainId = (formData.get('benchmark_domain_id') as string | null)?.trim();
  const topic = (formData.get('topic') as string | null)?.trim();
  const location = (formData.get('location') as string | null)?.trim();
  const querySetId = (formData.get('query_set_id') as string | null)?.trim() || null;
  const cadence = (formData.get('cadence') as string | null)?.trim();
  const reportEmail = (formData.get('report_email') as string | null)?.trim() || null;
  const competitorList = parseCompetitorList(formData.get('competitor_list') as string | null);
  const platformsEnabled = parsePlatforms(formData);

  if (!benchmarkDomainId) throw new Error('benchmark_domain_id is required.');
  if (!topic) throw new Error('topic is required.');
  if (!location) throw new Error('location is required.');
  if (!cadence || !['monthly', 'biweekly', 'weekly'].includes(cadence)) {
    throw new Error('cadence must be monthly, biweekly, or weekly.');
  }
  if (!startupWorkspaceId && !agencyAccountId) {
    throw new Error('Either startup_workspace_id or agency_account_id is required.');
  }
  if (startupWorkspaceId && agencyAccountId) {
    throw new Error('Provide startup_workspace_id OR agency_account_id, not both.');
  }
  if (platformsEnabled.length === 0) throw new Error('At least one platform must be enabled.');

  const repo = createBenchmarkRepository(ctx.adminDb);
  const config = await repo.insertClientBenchmarkConfig({
    startupWorkspaceId,
    agencyAccountId,
    benchmarkDomainId,
    topic,
    location,
    querySetId,
    competitorList,
    cadence: cadence as 'monthly' | 'biweekly' | 'weekly',
    platformsEnabled,
    reportEmail,
  });

  structuredLog('admin_create_client_benchmark_config', {
    adminId: ctx.user.id,
    configId: config.id,
    benchmarkDomainId,
    topic,
    location,
    cadence,
  }, 'info');

  revalidatePath(REVALIDATE_PATH);
}

export async function updateClientBenchmarkConfig(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const id = (formData.get('id') as string | null)?.trim();
  if (!id) throw new Error('id is required.');

  const topic = (formData.get('topic') as string | null)?.trim();
  const location = (formData.get('location') as string | null)?.trim();
  const querySetId = (formData.get('query_set_id') as string | null)?.trim() || null;
  const cadence = (formData.get('cadence') as string | null)?.trim();
  const reportEmail = (formData.get('report_email') as string | null)?.trim() || null;
  const competitorList = parseCompetitorList(formData.get('competitor_list') as string | null);
  const platformsEnabled = parsePlatforms(formData);

  if (cadence && !['monthly', 'biweekly', 'weekly'].includes(cadence)) {
    throw new Error('cadence must be monthly, biweekly, or weekly.');
  }
  if (platformsEnabled.length === 0) throw new Error('At least one platform must be enabled.');

  const repo = createBenchmarkRepository(ctx.adminDb);
  await repo.updateClientBenchmarkConfig(id, {
    ...(topic ? { topic } : {}),
    ...(location ? { location } : {}),
    querySetId,
    competitorList,
    ...(cadence ? { cadence: cadence as 'monthly' | 'biweekly' | 'weekly' } : {}),
    platformsEnabled,
    reportEmail,
  });

  structuredLog('admin_update_client_benchmark_config', {
    adminId: ctx.user.id,
    configId: id,
  }, 'info');

  revalidatePath(REVALIDATE_PATH);
}

export async function deleteClientBenchmarkConfig(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const id = (formData.get('id') as string | null)?.trim();
  if (!id) throw new Error('id is required.');

  const repo = createBenchmarkRepository(ctx.adminDb);
  await repo.deleteClientBenchmarkConfig(id);

  structuredLog('admin_delete_client_benchmark_config', {
    adminId: ctx.user.id,
    configId: id,
  }, 'info');

  revalidatePath(REVALIDATE_PATH);
}
