'use server';

import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createGpmAdminData } from '@/lib/server/geo-performance-admin-data';
import { validateClientBenchmarkConfigInput } from '@/lib/server/geo-performance-entitlements';

export type GpmConfigActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

// ── Parse helpers ─────────────────────────────────────────────────────────────

function normalizeText(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  return v.length > 0 ? v : undefined;
}

function parseCompetitorListText(raw: string): string[] {
  return raw
    .split(/[\r\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

// ── Create config ─────────────────────────────────────────────────────────────

const createSchema = z.object({
  benchmarkDomainId: z.string().uuid('Choose a valid domain.'),
  topic: z.string().min(1, 'Topic is required.').max(200, 'Topic is too long.'),
  location: z.string().min(1, 'Location is required.').max(200, 'Location is too long.'),
  cadence: z.enum(['monthly', 'biweekly', 'weekly']),
  platforms: z
    .string()
    .min(1, 'Choose at least one platform.')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  querySetId: z.string().uuid().optional(),
  reportEmail: z.string().email('Enter a valid email.').optional(),
  competitorListText: z.string().optional(),
  startupWorkspaceId: z.string().uuid().optional(),
  agencyAccountId: z.string().uuid().optional(),
});

export async function createGpmConfigAction(
  _prev: GpmConfigActionState | null,
  formData: FormData
): Promise<GpmConfigActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = createSchema.safeParse({
    benchmarkDomainId: normalizeText(formData.get('benchmarkDomainId')),
    topic: normalizeText(formData.get('topic')),
    location: normalizeText(formData.get('location')),
    cadence: normalizeText(formData.get('cadence')) ?? 'monthly',
    platforms: normalizeText(formData.get('platforms')) ?? '',
    querySetId: normalizeText(formData.get('querySetId')),
    reportEmail: normalizeText(formData.get('reportEmail')),
    competitorListText: normalizeText(formData.get('competitorListText')),
    startupWorkspaceId: normalizeText(formData.get('startupWorkspaceId')),
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
  });

  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, message: first ?? 'Check the form values.' };
  }

  const { data } = parsed;
  const competitorList = data.competitorListText
    ? parseCompetitorListText(data.competitorListText)
    : [];

  const validation = validateClientBenchmarkConfigInput({
    topic: data.topic,
    location: data.location,
    benchmarkDomainId: data.benchmarkDomainId,
    cadence: data.cadence,
    platformsEnabled: data.platforms,
    startupWorkspaceId: data.startupWorkspaceId ?? null,
    agencyAccountId: data.agencyAccountId ?? null,
    competitorList,
  });

  if (!validation.valid) {
    return { ok: false, message: validation.errors[0] ?? 'Validation failed.' };
  }

  try {
    const gpmData = createGpmAdminData(context.adminDb);
    await gpmData.createConfig({
      benchmarkDomainId: data.benchmarkDomainId,
      topic: data.topic,
      location: data.location,
      cadence: data.cadence,
      platformsEnabled: data.platforms,
      querySetId: data.querySetId ?? null,
      reportEmail: data.reportEmail ?? null,
      competitorList,
      startupWorkspaceId: data.startupWorkspaceId ?? null,
      agencyAccountId: data.agencyAccountId ?? null,
    });
    return { ok: true, message: 'GPM config created.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not create config.',
    };
  }
}

// ── Update full config (topic, location, cadence, platforms) ─────────────────

const updateSchema = z.object({
  configId: z.string().uuid('Invalid configId.'),
  topic: z.string().min(1, 'Topic is required.').max(200, 'Topic is too long.'),
  location: z.string().min(1, 'Location is required.').max(200, 'Location is too long.'),
  cadence: z.enum(['monthly', 'biweekly', 'weekly']),
  platforms: z
    .string()
    .min(1, 'Choose at least one platform.')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  querySetId: z.string().uuid().optional(),
  reportEmail: z.string().email('Enter a valid email.').optional(),
});

export async function updateGpmConfigAction(
  _prev: GpmConfigActionState | null,
  formData: FormData
): Promise<GpmConfigActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const parsed = updateSchema.safeParse({
    configId: normalizeText(formData.get('configId')),
    topic: normalizeText(formData.get('topic')),
    location: normalizeText(formData.get('location')),
    cadence: normalizeText(formData.get('cadence')) ?? 'monthly',
    platforms: normalizeText(formData.get('platforms')) ?? '',
    querySetId: normalizeText(formData.get('querySetId')),
    reportEmail: normalizeText(formData.get('reportEmail')),
  });

  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, message: first ?? 'Check the form values.' };
  }

  const { data } = parsed;
  const validation = validateClientBenchmarkConfigInput({
    topic: data.topic,
    location: data.location,
    cadence: data.cadence,
    platformsEnabled: data.platforms,
    // required fields — pass dummy values since we're updating, not creating
    benchmarkDomainId: 'valid-for-update',
    startupWorkspaceId: 'valid-for-update',
  });

  // Only check topic/location/cadence/platforms errors (not domain/owner which we don't change)
  const relevantErrors = validation.errors.filter(
    (e) => !e.includes('benchmarkDomainId') && !e.includes('startupWorkspaceId') && !e.includes('agencyAccountId')
  );
  if (relevantErrors.length > 0) {
    return { ok: false, message: relevantErrors[0]! };
  }

  try {
    const gpmData = createGpmAdminData(context.adminDb);
    await gpmData.updateConfig(data.configId, {
      topic: data.topic,
      location: data.location,
      cadence: data.cadence,
      platformsEnabled: data.platforms,
      querySetId: data.querySetId ?? null,
      reportEmail: data.reportEmail ?? null,
    });
    return { ok: true, message: 'Config updated.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not update config.',
    };
  }
}

// ── Update competitor list ─────────────────────────────────────────────────────

export async function updateGpmCompetitorListAction(
  _prev: GpmConfigActionState | null,
  formData: FormData
): Promise<GpmConfigActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const configId = normalizeText(formData.get('configId'));
  if (!configId) return { ok: false, message: 'configId is required.' };

  const rawText = typeof formData.get('competitorListText') === 'string'
    ? (formData.get('competitorListText') as string)
    : '';
  const competitors = parseCompetitorListText(rawText);

  if (competitors.length > 50) {
    return { ok: false, message: 'Competitor list may not exceed 50 entries.' };
  }

  try {
    const gpmData = createGpmAdminData(context.adminDb);
    await gpmData.updateCompetitorList(configId, competitors);
    return { ok: true, message: `Competitor list updated (${competitors.length} entries).` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not update competitor list.',
    };
  }
}

// ── Delete config ─────────────────────────────────────────────────────────────

export async function deleteGpmConfigAction(
  _prev: GpmConfigActionState | null,
  formData: FormData
): Promise<GpmConfigActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return context;

  const configId = normalizeText(formData.get('configId'));
  if (!configId) return { ok: false, message: 'configId is required.' };

  try {
    const gpmData = createGpmAdminData(context.adminDb);
    await gpmData.deleteConfig(configId);
    return { ok: true, message: 'Config deleted.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not delete config.',
    };
  }
}
