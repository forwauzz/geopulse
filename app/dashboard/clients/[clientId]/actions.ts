'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getAutonomousEditorialEnv, getPaymentApiEnv, getScanApiEnv } from '@/lib/server/cf-env';
import { createBenchmarkExecutionAdapter } from '@/lib/server/benchmark-execution';
import { buildGpmEntitlementsMap } from '@/lib/server/geo-performance-entitlements';
import { executeGpmClientRun, resolveGpmPlatformModelMap } from '@/lib/server/geo-performance-schedule';

const schema = z.object({
  clientId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  configId: z.string().uuid(),
  cadence: z.enum(['monthly', 'biweekly', 'weekly']),
  reportEmail: z.string().trim().email().or(z.literal('')),
  competitorList: z.string().max(1200),
});

const activateSchema = z.object({
  clientId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  domain: z.string().trim().min(3).max(255),
  topic: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(120),
  reportEmail: z.string().trim().email(),
  prompts: z.string().max(6000),
  competitorList: z.string().max(2400),
});

const actionStatusSchema = z.object({
  clientId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  configId: z.string().uuid(),
  actionKey: z.string().trim().min(3).max(360),
  status: z.enum(['pending', 'completed']),
});

function canonicalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!;
}

function uniqueLines(raw: string, limit: number): string[] {
  return Array.from(
    new Set(raw.split(/[\r\n]+/).map((value) => value.trim()).filter(Boolean)),
  ).slice(0, limit);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'prompt';
}

async function authorizedAdmin(args: {
  readonly agencyAccountId: string;
  readonly clientId: string;
}) {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/clients');
  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: membership }, { data: client }] = await Promise.all([
    admin
      .from('agency_users')
      .select('role')
      .eq('agency_account_id', args.agencyAccountId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    admin
      .from('agency_clients')
      .select('id')
      .eq('id', args.clientId)
      .eq('agency_account_id', args.agencyAccountId)
      .eq('status', 'active')
      .maybeSingle(),
  ]);
  if (!membership || membership.role === 'viewer' || !client) return null;
  return { admin, user };
}

export async function saveClientMonitoring(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    configId: formData.get('configId'),
    cadence: formData.get('cadence'),
    reportEmail: formData.get('reportEmail'),
    competitorList: formData.get('competitorList') ?? '',
  });
  if (!parsed.success) return;

  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const { admin } = auth;

  const competitors = Array.from(
    new Set(
      parsed.data.competitorList
        .split(/[\r\n,]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 20);
  await admin
    .from('client_benchmark_configs')
    .update({
      cadence: parsed.data.cadence,
      report_email: parsed.data.reportEmail || null,
      competitor_list: competitors,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId);

  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&monitoring=saved`);
}

export async function activateClientMonitoring(formData: FormData): Promise<void> {
  const parsed = activateSchema.safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    domain: formData.get('domain'),
    topic: formData.get('topic'),
    location: formData.get('location'),
    reportEmail: formData.get('reportEmail'),
    prompts: formData.get('prompts') ?? '',
    competitorList: formData.get('competitorList') ?? '',
  });
  if (!parsed.success) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const { admin, user } = auth;
  const canonical = canonicalizeDomain(parsed.data.domain);
  const prompts = uniqueLines(parsed.data.prompts, 20);
  if (!canonical || prompts.length === 0) return;
  const competitors = uniqueLines(parsed.data.competitorList, 20);
  const now = new Date().toISOString();

  const { data: domainRow, error: domainError } = await admin
    .from('benchmark_domains')
    .upsert({
      domain: canonical,
      canonical_domain: canonical,
      site_url: `https://${canonical}`,
      display_name: canonical,
      vertical: parsed.data.topic,
      geo_region: parsed.data.location,
      is_customer: true,
      metadata: { source: 'agency_client_setup', schedule_enabled: true, updated_at: now },
    }, { onConflict: 'canonical_domain' })
    .select('id,metadata')
    .single();
  if (domainError || !domainRow?.id) return;

  const setName = `client-prompts-${canonical}`;
  const { data: querySet, error: querySetError } = await admin
    .from('benchmark_query_sets')
    .upsert({
      name: setName,
      version: 'v1',
      vertical: parsed.data.topic,
      description: `Buyer questions tracked for ${canonical}.`,
      status: 'active',
      metadata: {
        source: 'agency_client_setup',
        canonical_domain: canonical,
        imported_at: now,
        imported_by_user_id: user.id,
      },
    }, { onConflict: 'name,version' })
    .select('id')
    .single();
  if (querySetError || !querySet?.id) return;

  const queryRows = prompts.map((queryText, index) => ({
    query_set_id: querySet.id,
    query_key: `${String(index + 1).padStart(2, '0')}-${slugify(queryText)}`,
    query_text: queryText,
    intent_type: 'discovery',
    topic: parsed.data.topic,
    weight: 1,
    metadata: {
      source: 'agency_client_setup',
      source_row: index + 1,
      imported_at: now,
    },
  }));
  const { error: queryError } = await admin
    .from('benchmark_queries')
    .upsert(queryRows, { onConflict: 'query_set_id,query_key' });
  if (queryError) return;

  const configPayload = {
      agency_account_id: parsed.data.agencyAccountId,
      benchmark_domain_id: domainRow.id,
      topic: parsed.data.topic,
      location: parsed.data.location,
      query_set_id: querySet.id,
      competitor_list: competitors,
      cadence: 'monthly',
      platforms_enabled: ['chatgpt', 'gemini'],
      report_email: parsed.data.reportEmail,
      metadata: {
        setup_source: 'agency_client_scorecard',
        setup_at: now,
        setup_by_user_id: user.id,
        prompt_source: 'customer_supplied',
        prompt_count: prompts.length,
        outcome_action_events: [],
      },
    };
  const { data: existingConfig } = await admin
    .from('client_benchmark_configs')
    .select('id')
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('benchmark_domain_id', domainRow.id)
    .maybeSingle();
  const { error: configError } = existingConfig?.id
    ? await admin.from('client_benchmark_configs').update(configPayload).eq('id', existingConfig.id)
    : await admin.from('client_benchmark_configs').insert(configPayload);
  if (configError) return;

  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&monitoring=activated`);
}

export async function updateOutcomeActionStatus(formData: FormData): Promise<void> {
  const parsed = actionStatusSchema.safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    configId: formData.get('configId'),
    actionKey: formData.get('actionKey'),
    status: formData.get('status'),
  });
  if (!parsed.success) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const { admin, user } = auth;
  const { data: config } = await admin
    .from('client_benchmark_configs')
    .select('metadata')
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  if (!config) return;
  const metadata = (config.metadata && typeof config.metadata === 'object')
    ? config.metadata as Record<string, unknown>
    : {};
  const existing = Array.isArray(metadata['outcome_action_events'])
    ? metadata['outcome_action_events']
    : [];
  const event = {
    actionKey: parsed.data.actionKey,
    status: parsed.data.status,
    at: new Date().toISOString(),
    byUserId: user.id,
  };
  await admin
    .from('client_benchmark_configs')
    .update({
      metadata: { ...metadata, outcome_action_events: [...existing, event].slice(-100) },
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId);

  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}#actions`);
}

export async function runClientVisibilityCheck(formData: FormData): Promise<void> {
  const parsed = z.object({
    clientId: z.string().uuid(),
    agencyAccountId: z.string().uuid(),
    configId: z.string().uuid(),
  }).safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    configId: formData.get('configId'),
  });
  if (!parsed.success) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const { admin } = auth;
  const { data: config } = await admin
    .from('client_benchmark_configs')
    .select('id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at')
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  if (!config) return;
  const entitlements = await buildGpmEntitlementsMap(admin, [config]);
  const entitlement = entitlements.get(config.id);
  if (!entitlement?.enabled) {
    redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&visibility=not_enabled`);
  }
  const [env, paymentEnv, editorialEnv] = await Promise.all([
    getScanApiEnv(),
    getPaymentApiEnv(),
    getAutonomousEditorialEnv(),
  ]);
  const summary = await executeGpmClientRun({
    supabase: admin,
    config,
    entitlement,
    platformModelMap: resolveGpmPlatformModelMap({
      GPM_CHATGPT_MODEL_ID: 'gpt-4o-mini',
      GPM_GEMINI_MODEL_ID: env.BENCHMARK_EXECUTION_MODEL || env.GEMINI_MODEL,
    }),
    adapter: createBenchmarkExecutionAdapter(env),
    triggerSource: 'customer_recheck',
    runVersion: crypto.randomUUID(),
    reportEnv: paymentEnv,
    reportBucket: editorialEnv.REPORT_FILES
      ? {
          put: (key, value, options) =>
            editorialEnv.REPORT_FILES!.put(
              key,
              new Uint8Array(value).buffer,
              options ? { httpMetadata: { contentType: options.httpMetadata?.contentType } } : undefined,
            ),
        }
      : undefined,
  });
  const launched = summary.platformResults.filter((result) => result.status === 'launched').length;
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&visibility=${launched > 0 ? 'checked' : 'failed'}`);
}
