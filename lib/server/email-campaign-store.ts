/**
 * Persistence for `email_campaign_v1` (VCI-8 / ECP-2).
 *
 * The contract lives in `growth_campaign_interventions.metadata.email_campaign` as a versioned
 * payload rather than in its own table. The plan is explicit that a new table waits until
 * production query needs prove it: the coarse `growth_campaign_interventions.status` already
 * carries company-wide campaign intelligence, and a second status column would immediately
 * disagree with it. Every version is retained under `versions[N]`, so a scheduled version stays
 * readable after an edit produces N+1.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EMAIL_CAMPAIGN_CONTRACT,
  isLocked,
  validateEmailCampaignV1,
  type EmailCampaignPreparationState,
  type EmailCampaignV1,
} from './email-campaign-contract';

interface StoredEmailCampaign {
  readonly current: number;
  readonly versions: Record<string, EmailCampaignV1>;
}

export interface EmailCampaignRecord {
  readonly interventionId: string;
  readonly interventionKey: string;
  readonly interventionName: string;
  readonly interventionStatus: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignRole: string;
  readonly vertical: string;
  readonly contract: EmailCampaignV1;
  readonly allVersions: readonly EmailCampaignV1[];
}

function readStored(metadata: unknown): StoredEmailCampaign | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const stored = (metadata as Record<string, unknown>)['email_campaign'];
  if (!stored || typeof stored !== 'object') return null;
  const { current, versions } = stored as { current?: unknown; versions?: unknown };
  if (typeof current !== 'number' || !versions || typeof versions !== 'object') return null;
  const parsed = versions as Record<string, EmailCampaignV1>;
  if (!parsed[String(current)]) return null;
  return { current, versions: parsed };
}

function toRecord(row: Record<string, any>, stored: StoredEmailCampaign): EmailCampaignRecord {
  const campaign = row.growth_campaigns ?? {};
  return {
    interventionId: String(row.id),
    interventionKey: String(row.intervention_key),
    interventionName: String(row.name),
    interventionStatus: String(row.status),
    campaignId: String(row.campaign_id),
    campaignName: String(campaign.name ?? 'Unlinked campaign'),
    campaignRole: String(campaign.role ?? 'challenger'),
    vertical: String(campaign.vertical ?? 'marketing_agencies'),
    contract: stored.versions[String(stored.current)] as EmailCampaignV1,
    allVersions: Object.values(stored.versions).sort((a, b) => a.version - b.version),
  };
}

const SELECT = 'id,campaign_id,intervention_key,name,status,metadata,growth_campaigns(name,role,vertical)';

export async function listEmailCampaigns(supabase: SupabaseClient): Promise<EmailCampaignRecord[]> {
  const { data, error } = await supabase
    .from('growth_campaign_interventions')
    .select(SELECT)
    .eq('channel', 'email')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return [];

  const records: EmailCampaignRecord[] = [];
  for (const row of (data ?? []) as Record<string, any>[]) {
    const stored = readStored(row.metadata);
    if (stored) records.push(toRecord(row, stored));
  }
  return records;
}

export async function loadEmailCampaign(
  supabase: SupabaseClient,
  interventionKey: string,
): Promise<EmailCampaignRecord | null> {
  const { data } = await supabase
    .from('growth_campaign_interventions')
    .select(SELECT)
    .eq('intervention_key', interventionKey)
    .maybeSingle();
  if (!data) return null;
  const stored = readStored((data as Record<string, any>).metadata);
  return stored ? toRecord(data as Record<string, any>, stored) : null;
}

/**
 * The coarse intervention status stays authoritative for company-wide campaign intelligence, so
 * the detailed preparation state maps onto it rather than replacing it.
 */
export function interventionStatusFor(state: EmailCampaignPreparationState): string {
  if (state === 'running') return 'running';
  if (state === 'evaluating') return 'evaluating';
  if (state === 'completed') return 'completed';
  if (state === 'stopped') return 'stopped';
  return 'planned';
}

/**
 * Persist a contract version. A locked version already present in storage is never overwritten:
 * `applyContractEdit` is responsible for producing N+1, and this is the second guard in case a
 * caller tries to save over history directly.
 */
export async function saveEmailCampaign(
  supabase: SupabaseClient,
  contract: EmailCampaignV1,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (contract.contract !== EMAIL_CAMPAIGN_CONTRACT) return { ok: false, reason: 'unknown_contract' };

  const { data, error } = await supabase
    .from('growth_campaign_interventions')
    .select('id,metadata')
    .eq('id', contract.interventionId)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: error?.message ?? 'intervention_not_found' };

  const metadata = ((data as Record<string, unknown>).metadata ?? {}) as Record<string, unknown>;
  const stored = readStored(metadata);
  const existing = stored?.versions[String(contract.version)];
  if (existing && isLocked(existing) && existing.updatedAt !== contract.updatedAt) {
    return { ok: false, reason: 'version_is_locked' };
  }

  const versions = { ...(stored?.versions ?? {}), [String(contract.version)]: contract };
  const { error: updateError } = await supabase
    .from('growth_campaign_interventions')
    .update({
      status: interventionStatusFor(contract.state),
      metadata: { ...metadata, email_campaign: { current: contract.version, versions } },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contract.interventionId);
  if (updateError) return { ok: false, reason: updateError.message };
  return { ok: true };
}

/** Structural validation at the write boundary, so an invalid contract cannot reach storage. */
export async function saveValidatedEmailCampaign(
  supabase: SupabaseClient,
  contract: EmailCampaignV1,
): Promise<{ ok: true } | { ok: false; reason: string; issues: readonly string[] }> {
  // A draft is allowed to be incomplete — that is what "draft" means. Anything past qa_ready has
  // to satisfy the full contract before it can be stored in that state.
  if (contract.state !== 'draft') {
    const issues = validateEmailCampaignV1(contract);
    if (issues.length > 0) {
      return {
        ok: false,
        reason: 'contract_invalid',
        issues: issues.map((issue) => `${issue.section}.${issue.field}: ${issue.message}`),
      };
    }
  }
  const result = await saveEmailCampaign(supabase, contract);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason, issues: [] };
}
