'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createBenchmarkExecutionAdapter } from '@/lib/server/benchmark-execution';
import { isAdminEmail } from '@/lib/server/require-admin';
import { runBenchmarkGroupSkeleton } from '@/lib/server/benchmark-runner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

const triggerSchema = z.object({
  domainId: z.string().uuid('Choose a valid domain.'),
  querySetId: z.string().uuid('Choose a valid query set.'),
  modelId: z.string().min(1, 'Enter a model lane.').max(160, 'Model lane is too long.'),
  runLabel: z.string().max(160, 'Run label is too long.').optional(),
  notes: z.string().max(2000, 'Notes are too long.').optional(),
});

export type BenchmarkTriggerState =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type BenchmarkDomainState =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type BenchmarkQuerySetState =
  | { ok: true; message: string }
  | { ok: false; message: string };

const domainSchema = z.object({
  siteUrl: z.string().url('Enter a valid site URL, including https://'),
  displayName: z.string().max(120, 'Display name is too long.').optional(),
});

const querySetSchema = z.object({
  name: z.string().min(1, 'Enter a query set name.').max(120, 'Name is too long.'),
  version: z.string().min(1, 'Enter a version.').max(40, 'Version is too long.'),
  vertical: z.string().max(80, 'Vertical is too long.').optional(),
  description: z.string().max(500, 'Description is too long.').optional(),
  queriesText: z.string().min(1, 'Add at least one query.'),
});

function normalizeText(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

async function requireAdminForBenchmarkAction(): Promise<
  | { ok: true }
  | { ok: false; message: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return { ok: false, message: 'Admin access required.' };
  }

  return { ok: true };
}

function parseQueryLines(raw: string): Array<{
  queryKey: string;
  queryText: string;
  intentType: 'direct';
  weight: number;
  metadata: Record<string, unknown>;
}> {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('Add at least one query.');
  }

  return lines.map((queryText, index) => ({
    queryKey: `query-${index + 1}`,
    queryText,
    intentType: 'direct',
    weight: 1,
    metadata: { source: 'admin_manual' },
  }));
}

export async function createBenchmarkDomain(
  _prev: BenchmarkDomainState | null,
  formData: FormData
): Promise<BenchmarkDomainState> {
  const auth = await requireAdminForBenchmarkAction();
  if (!auth.ok) return auth;

  const parsed = domainSchema.safeParse({
    siteUrl: normalizeText(formData.get('siteUrl')),
    displayName: normalizeText(formData.get('displayName')),
  });

  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first['siteUrl']?.[0] ??
      first['displayName']?.[0] ??
      'Check the benchmark domain values.';
    return { ok: false, message: msg };
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: 'Server misconfigured for benchmark writes.' };
  }

  try {
    const adminDb = createServiceRoleClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { createBenchmarkRepository } = await import('@/lib/server/benchmark-repository');
    const repo = createBenchmarkRepository(adminDb);
    const domain = await repo.upsertDomain({
      siteUrl: parsed.data.siteUrl,
      displayName: parsed.data.displayName,
      isCustomer: true,
      isCompetitor: false,
      metadata: { source: 'admin_manual' },
    });

    redirect(`/dashboard/benchmarks?domain=${domain.id}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not create benchmark domain.';
    return { ok: false, message };
  }
}

export async function createBenchmarkQuerySet(
  _prev: BenchmarkQuerySetState | null,
  formData: FormData
): Promise<BenchmarkQuerySetState> {
  const auth = await requireAdminForBenchmarkAction();
  if (!auth.ok) return auth;

  const parsed = querySetSchema.safeParse({
    name: normalizeText(formData.get('name')),
    version: normalizeText(formData.get('version')),
    vertical: normalizeText(formData.get('vertical')),
    description: normalizeText(formData.get('description')),
    queriesText: normalizeText(formData.get('queriesText')),
  });

  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first['name']?.[0] ??
      first['version']?.[0] ??
      first['vertical']?.[0] ??
      first['description']?.[0] ??
      first['queriesText']?.[0] ??
      'Check the benchmark query set values.';
    return { ok: false, message: msg };
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: 'Server misconfigured for benchmark writes.' };
  }

  try {
    const adminDb = createServiceRoleClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { createBenchmarkRepository } = await import('@/lib/server/benchmark-repository');
    const repo = createBenchmarkRepository(adminDb);
    const querySet = await repo.upsertQuerySet({
      name: parsed.data.name,
      version: parsed.data.version,
      vertical: parsed.data.vertical,
      description: parsed.data.description,
      status: 'active',
      metadata: { source: 'admin_manual' },
    });
    await repo.replaceQueries(querySet.id, parseQueryLines(parsed.data.queriesText));

    redirect(`/dashboard/benchmarks?querySet=${querySet.id}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not create benchmark query set.';
    return { ok: false, message };
  }
}

export async function triggerBenchmarkRun(
  _prev: BenchmarkTriggerState | null,
  formData: FormData
): Promise<BenchmarkTriggerState> {
  const auth = await requireAdminForBenchmarkAction();
  if (!auth.ok) return auth;

  const parsed = triggerSchema.safeParse({
    domainId: formData.get('domainId'),
    querySetId: formData.get('querySetId'),
    modelId: normalizeText(formData.get('modelId')),
    runLabel: normalizeText(formData.get('runLabel')),
    notes: normalizeText(formData.get('notes')),
  });

  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first['domainId']?.[0] ??
      first['querySetId']?.[0] ??
      first['modelId']?.[0] ??
      first['runLabel']?.[0] ??
      first['notes']?.[0] ??
      'Check the benchmark form values.';
    return { ok: false, message: msg };
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: 'Server misconfigured for benchmark writes.' };
  }

  try {
    const adminDb = createServiceRoleClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const adapter = createBenchmarkExecutionAdapter(env);
    const result = await runBenchmarkGroupSkeleton(adminDb, parsed.data, adapter);
    redirect(`/dashboard/benchmarks/${result.runGroupId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not trigger benchmark run.';
    return { ok: false, message };
  }
}
