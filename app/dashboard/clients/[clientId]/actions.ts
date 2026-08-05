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
import { parsePromptCsv } from '@/lib/server/prompt-csv';
import { parseReportRecipients } from '@/lib/shared/report-recipients';
import { completeAgencyClientBaseline } from '@/lib/server/agency-client-baseline';
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';
import { isClientReportSharingHeld, releaseClientReportHold } from '@/lib/server/report-quarantine';
import { syncConfirmedCompetitorCohort } from '@/lib/server/organization-context-repository';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

const schema = z.object({
  clientId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  configId: z.string().uuid(),
  cadence: z.enum(['monthly', 'biweekly', 'weekly']),
  reportEmail: z.string().trim().max(1800),
  competitorList: z.string().max(1200),
});

const activateSchema = z.object({
  clientId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  domain: z.string().trim().min(3).max(255),
  topic: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(120),
  reportEmail: z.string().trim().max(1800),
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
  return { admin, user, role: String(membership.role) };
}

/**
 * Releasing a review hold is the one action here that can make a client's report
 * publicly reachable, so it is restricted further than the rest: an editor may
 * change what is measured, but only an owner or admin may decide it can leave the
 * workspace.
 */
const SHARING_RELEASE_ROLES = new Set(['owner', 'admin']);

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
  const recipients = parseReportRecipients(parsed.data.reportEmail);
  if (parsed.data.reportEmail.trim() && recipients.length === 0) return;
  const { data: currentConfig } = await admin
    .from('client_benchmark_configs')
    .select('metadata')
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  const currentMetadata = currentConfig?.metadata && typeof currentConfig.metadata === 'object'
    ? currentConfig.metadata as Record<string, unknown>
    : {};

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
      report_email: recipients[0] ?? null,
      competitor_list: competitors,
      metadata: { ...currentMetadata, report_recipients: recipients },
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId);

  // The cohort is measurement input, but the run key is versioned by the confirmed
  // context — so a cohort saved only here is deduped away and the client keeps
  // being measured against the old set. Re-confirming moves the context version,
  // which is what lets the next baseline actually run.
  const { data: client } = await admin
    .from('agency_clients')
    .select('canonical_domain,website_domain')
    .eq('id', parsed.data.clientId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  const canonicalDomain = String(client?.canonical_domain || client?.website_domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (canonicalDomain) {
    // Best effort: the delivery settings are already saved, and a context that
    // cannot be re-confirmed should not lose the agency that change.
    await syncConfirmedCompetitorCohort({
      supabase: admin,
      ownerType: 'agency_client',
      ownerId: parsed.data.clientId,
      canonicalDomain,
      actorId: auth.user.id,
      competitorDomains: competitors,
    }).catch((error) => {
      structuredError('agency_client_cohort_context_sync_failed', {
        agency_client_id: parsed.data.clientId,
        canonical_domain: canonicalDomain,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    });
  }

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
  const recipients = parseReportRecipients(parsed.data.reportEmail);
  if (recipients.length === 0) return;
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

  const intelligence = await retrieveIntelligenceEvidence(admin, {
    tenantType: 'agency_client',
    tenantId: parsed.data.clientId,
    domainHost: canonical,
    limit: 25,
  }).catch(() => ({
    status: 'insufficient_evidence' as const,
    evidence: [] as const,
    limitations: ['Continuous intelligence is pending.'],
  }));

  const configPayload = {
      agency_account_id: parsed.data.agencyAccountId,
      benchmark_domain_id: domainRow.id,
      topic: parsed.data.topic,
      location: parsed.data.location,
      query_set_id: querySet.id,
      competitor_list: competitors,
      cadence: 'monthly',
      platforms_enabled: ['chatgpt', 'gemini'],
      report_email: recipients[0]!,
      metadata: {
        setup_source: 'agency_client_scorecard',
        setup_at: now,
        setup_by_user_id: user.id,
        prompt_source: 'customer_supplied',
        prompt_count: prompts.length,
        outcome_action_events: [],
         report_recipients: recipients,
         intelligence_status: intelligence.status,
         intelligence_evidence_ids: intelligence.evidence.map((item) => item.evidenceId),
         intelligence_limitations: intelligence.limitations,
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
          get: editorialEnv.REPORT_FILES.get
            ? (key) => editorialEnv.REPORT_FILES!.get!(key)
            : undefined,
        }
      : undefined,
  });
  const launched = summary.platformResults.filter((result) => result.status === 'launched').length;
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&visibility=${launched > 0 ? 'checked' : 'failed'}`);
}

export async function completeClientBaseline(formData: FormData): Promise<void> {
  const parsed = z.object({
    clientId: z.string().uuid(),
    agencyAccountId: z.string().uuid(),
    reportEmail: z.string().trim().email().optional(),
  }).safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    reportEmail: formData.get('reportEmail') || undefined,
  });
  if (!parsed.success) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const [env, editorialEnv] = await Promise.all([
    getPaymentApiEnv(),
    getAutonomousEditorialEnv(),
  ]);
  const result = await completeAgencyClientBaseline({
    supabase: auth.admin,
    env,
    agencyAccountId: parsed.data.agencyAccountId,
    clientId: parsed.data.clientId,
    userId: auth.user.id,
    reportEmail: parsed.data.reportEmail ?? auth.user.email ?? null,
    reportBucket: editorialEnv.REPORT_FILES
      ? {
          put: (key, value, options) =>
            editorialEnv.REPORT_FILES!.put(
              key,
              value instanceof Uint8Array ? new Uint8Array(value).slice().buffer : value,
              options ? { httpMetadata: { contentType: options.httpMetadata?.contentType } } : undefined,
            ),
          get: editorialEnv.REPORT_FILES.get
            ? (key) => editorialEnv.REPORT_FILES!.get!(key)
            : undefined,
        }
      : undefined,
  });
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  revalidatePath('/dashboard/visibility');
  redirect(
    `/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}` +
    `&baseline=${result.ok ? 'complete' : encodeURIComponent(result.reason ?? 'failed')}`,
  );
}

/**
 * Release a client's review hold so its scorecard and summary can be shared.
 *
 * Deliberately separate from creating a share link. Releasing is the judgement that
 * a report is fit to leave the workspace; creating a link is the act of sending it.
 * Keeping them apart means nothing is published as a side effect of a review.
 */
export async function releaseClientSharingHold(formData: FormData): Promise<void> {
  const parsed = z.object({
    clientId: z.string().uuid(),
    agencyAccountId: z.string().uuid(),
  }).safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
  });
  if (!parsed.success) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  if (!SHARING_RELEASE_ROLES.has(auth.role)) {
    redirect(
      `/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&release=not_permitted`
    );
  }
  const { data: client } = await auth.admin
    .from('agency_clients')
    .select('metadata')
    .eq('id', parsed.data.clientId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  const released = releaseClientReportHold(client?.metadata, {
    userId: auth.user.id,
    at: new Date().toISOString(),
  });
  // Nothing held: say so rather than reporting a release that never happened.
  if (!released) {
    redirect(
      `/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&release=not_held`
    );
  }
  const { error } = await auth.admin
    .from('agency_clients')
    .update({ metadata: released, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.clientId)
    .eq('agency_account_id', parsed.data.agencyAccountId);
  if (error) {
    redirect(
      `/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&release=failed`
    );
  }
  structuredLog('agency_client_sharing_released', {
    agency_account_id: parsed.data.agencyAccountId,
    agency_client_id: parsed.data.clientId,
    released_by_user_id: auth.user.id,
  });
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(
    `/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&release=released`
  );
}

export async function createClientShareLink(formData: FormData): Promise<void> {
  const parsed = z.object({
    clientId: z.string().uuid(),
    agencyAccountId: z.string().uuid(),
  }).safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
  });
  if (!parsed.success) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const { admin, user } = auth;
  const { data: client } = await admin
    .from('agency_clients')
    .select('metadata')
    .eq('id', parsed.data.clientId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  if (!client) return;
  const metadata = client.metadata && typeof client.metadata === 'object'
    ? client.metadata as Record<string, unknown>
    : {};
  if (isClientReportSharingHeld(metadata)) {
    redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&share=held`);
  }
  const existing = typeof metadata['client_summary_share_token'] === 'string'
    ? metadata['client_summary_share_token']
    : null;
  const token = existing || crypto.randomUUID().replaceAll('-', '');
  await admin
    .from('agency_clients')
    .update({
      metadata: {
        ...metadata,
        client_summary_share_token: token,
        client_summary_shared_at: new Date().toISOString(),
        client_summary_shared_by_user_id: user.id,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.clientId)
    .eq('agency_account_id', parsed.data.agencyAccountId);
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&share=created`);
}

export async function importClientPromptCsv(formData: FormData): Promise<void> {
  const parsed = z.object({
    clientId: z.string().uuid(),
    agencyAccountId: z.string().uuid(),
    configId: z.string().uuid(),
  }).safeParse({
    clientId: formData.get('clientId'),
    agencyAccountId: formData.get('agencyAccountId'),
    configId: formData.get('configId'),
  });
  const file = formData.get('promptCsv');
  if (!parsed.success || !(file instanceof File) || file.size <= 0 || file.size > 250_000) return;
  const auth = await authorizedAdmin(parsed.data);
  if (!auth) return;
  const { admin, user } = auth;
  const prompts = parsePromptCsv(await file.text());
  if (prompts.length === 0) {
    redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&promptImport=invalid`);
  }
  const { data: config } = await admin
    .from('client_benchmark_configs')
    .select('query_set_id')
    .eq('id', parsed.data.configId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .maybeSingle();
  if (!config?.query_set_id) return;
  const { data: existingRows } = await admin
    .from('benchmark_queries')
    .select('query_text')
    .eq('query_set_id', config.query_set_id);
  const existing = new Set(((existingRows ?? []) as Array<{ query_text: string }>).map((row) => row.query_text.trim().toLowerCase()));
  const remaining = Math.max(0, 20 - existing.size);
  const additions = prompts.filter((prompt) => !existing.has(prompt.toLowerCase())).slice(0, remaining);
  if (additions.length > 0) {
    const importedAt = new Date().toISOString();
    await admin.from('benchmark_queries').insert(additions.map((queryText, index) => ({
      query_set_id: config.query_set_id,
      query_key: `csv-${String(existing.size + index + 1).padStart(2, '0')}-${slugify(queryText)}`,
      query_text: queryText,
      intent_type: 'discovery',
      topic: 'customer_import',
      weight: 1,
      metadata: {
        source: 'agency_csv_import',
        imported_at: importedAt,
        imported_by_user_id: user.id,
        original_filename: file.name.slice(0, 120),
      },
    })));
  }
  revalidatePath(`/dashboard/clients/${parsed.data.clientId}`);
  redirect(`/dashboard/clients/${parsed.data.clientId}?agencyAccount=${parsed.data.agencyAccountId}&promptImport=imported`);
}
