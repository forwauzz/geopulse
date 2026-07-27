import type { SupabaseClient } from '@supabase/supabase-js';

export const QA_BUYER_TOKEN_TTL_SECONDS = 15 * 60;
const QA_TOKEN_PREFIX = 'qa:buyer:pending:';
const QA_RESULT_PREFIX = 'qa:buyer:result:';

export type QaBuyerPersona = 'business' | 'agency';
export type QaBuyerBundleKey = 'startup_dev' | 'agency_core' | 'agency_pro';

export type QaBuyerJourneyClaim = {
  readonly version: 1;
  readonly token: string;
  readonly email: string;
  readonly persona: QaBuyerPersona;
  readonly bundleKey: QaBuyerBundleKey;
  readonly organizationName: string;
  readonly websiteUrl: string | null;
  readonly issuedByUserId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
};

export type QaBuyerJourneyResult = {
  readonly token: string;
  readonly userId: string;
  readonly email: string;
  readonly bundleKey: QaBuyerBundleKey;
  readonly subscriptionId: string;
  readonly completedAt: string;
};

function pendingKey(token: string): string {
  return `${QA_TOKEN_PREFIX}${token}`;
}

function resultKey(token: string): string {
  return `${QA_RESULT_PREFIX}${token}`;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isQaClaim(value: unknown): value is QaBuyerJourneyClaim {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Partial<QaBuyerJourneyClaim>;
  return (
    claim.version === 1 &&
    typeof claim.token === 'string' &&
    typeof claim.email === 'string' &&
    (claim.persona === 'business' || claim.persona === 'agency') &&
    (claim.bundleKey === 'startup_dev' ||
      claim.bundleKey === 'agency_core' ||
      claim.bundleKey === 'agency_pro') &&
    typeof claim.organizationName === 'string' &&
    (claim.websiteUrl === null || typeof claim.websiteUrl === 'string') &&
    typeof claim.issuedByUserId === 'string' &&
    typeof claim.issuedAt === 'string' &&
    typeof claim.expiresAt === 'string'
  );
}

async function loadQaBuyerJourneyClaim(
  kv: KVNamespace,
  token: string,
): Promise<QaBuyerJourneyClaim | null> {
  const raw = await kv.get(pendingKey(token));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isQaClaim(parsed) && parsed.token === token ? parsed : null;
  } catch {
    return null;
  }
}

export async function issueQaBuyerJourney(args: {
  readonly kv: KVNamespace;
  readonly persona: QaBuyerPersona;
  readonly bundleKey: QaBuyerBundleKey;
  readonly issuedByUserId: string;
  readonly now?: Date;
}): Promise<QaBuyerJourneyClaim> {
  const now = args.now ?? new Date();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const suffix = token.slice(0, 10);
  const email = `geopulse.qa.${args.persona}.${now.getTime()}.${suffix}@example.com`;
  const claim: QaBuyerJourneyClaim = {
    version: 1,
    token,
    email,
    persona: args.persona,
    bundleKey: args.bundleKey,
    organizationName:
      args.persona === 'agency' ? `Northstar Agency QA ${suffix}` : `Harbour Business QA ${suffix}`,
    websiteUrl: args.persona === 'business' ? 'https://example.com' : null,
    issuedByUserId: args.issuedByUserId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + QA_BUYER_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
  await args.kv.put(pendingKey(token), JSON.stringify(claim), {
    expirationTtl: QA_BUYER_TOKEN_TTL_SECONDS,
  });
  return claim;
}

export async function validateQaBuyerJourney(args: {
  readonly kv: KVNamespace;
  readonly token: string;
  readonly email: string;
  readonly bundleKey: string;
  readonly now?: Date;
}): Promise<
  | { readonly ok: true; readonly claim: QaBuyerJourneyClaim }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'email_mismatch' | 'bundle_mismatch' }
> {
  const parsed = await loadQaBuyerJourneyClaim(args.kv, args.token);
  if (!parsed) return { ok: false, reason: 'invalid' };
  if (new Date(parsed.expiresAt).getTime() <= (args.now ?? new Date()).getTime()) {
    return { ok: false, reason: 'expired' };
  }
  if (normalizeEmail(parsed.email) !== normalizeEmail(args.email)) {
    return { ok: false, reason: 'email_mismatch' };
  }
  if (parsed.bundleKey !== args.bundleKey) {
    return { ok: false, reason: 'bundle_mismatch' };
  }
  return { ok: true, claim: parsed };
}

export async function completeQaBuyerJourney(args: {
  readonly kv: KVNamespace;
  readonly result: QaBuyerJourneyResult;
}): Promise<void> {
  await args.kv.put(resultKey(args.result.token), JSON.stringify(args.result), {
    expirationTtl: 24 * 60 * 60,
  });
  await args.kv.delete(pendingKey(args.result.token));
}

export async function loadQaBuyerJourneyResult(
  kv: KVNamespace,
  token: string,
): Promise<QaBuyerJourneyResult | null> {
  const raw = await kv.get(resultKey(token));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<QaBuyerJourneyResult>;
    return parsed.token === token &&
      typeof parsed.userId === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.subscriptionId === 'string'
      ? (parsed as QaBuyerJourneyResult)
      : null;
  } catch {
    return null;
  }
}

export async function cleanupQaBuyerJourney(args: {
  readonly kv: KVNamespace;
  readonly supabase: SupabaseClient;
  readonly token: string;
}): Promise<{ readonly deleted: boolean; readonly email: string | null }> {
  const result = await loadQaBuyerJourneyResult(args.kv, args.token);
  const pendingClaim = result ? null : await loadQaBuyerJourneyClaim(args.kv, args.token);
  if (!result && !pendingClaim) return { deleted: false, email: null };

  const email = result?.email ?? pendingClaim!.email;
  let userId = result?.userId ?? null;
  if (!userId) {
    const { data: userRow, error: userLookupError } = await args.supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (userLookupError) throw userLookupError;
    userId = userRow?.id ?? null;
  }

  if (!userId) {
    await args.kv.delete(pendingKey(args.token));
    await args.kv.delete(resultKey(args.token));
    return { deleted: true, email };
  }

  let subscriptionQuery = args.supabase
    .from('user_subscriptions')
    .select('stripe_subscription_id, startup_workspace_id, agency_account_id, metadata')
    .eq('user_id', userId);
  if (result) {
    subscriptionQuery = subscriptionQuery.eq('stripe_subscription_id', result.subscriptionId);
  }
  const { data: subscription, error: subscriptionLookupError } =
    await subscriptionQuery.maybeSingle();
  if (subscriptionLookupError) throw subscriptionLookupError;

  if (subscription) {
    const metadata = (subscription.metadata ?? {}) as Record<string, unknown>;
    if (
      metadata['qa_simulation'] !== true ||
      !String(subscription.stripe_subscription_id ?? '').startsWith('sub_qa_')
    ) {
      throw new Error('Refusing to clean a non-QA subscription.');
    }
  }

  if (subscription?.startup_workspace_id) {
    const { error } = await args.supabase
      .from('startup_workspaces')
      .delete()
      .eq('id', subscription.startup_workspace_id);
    if (error) throw error;
  }
  if (subscription?.agency_account_id) {
    const { error } = await args.supabase
      .from('agency_accounts')
      .delete()
      .eq('id', subscription.agency_account_id);
    if (error) throw error;
  }
  const subscriptionDelete = args.supabase
    .from('user_subscriptions')
    .delete()
    .eq('user_id', userId);
  const exactSubscriptionDelete = result
    ? subscriptionDelete.eq('stripe_subscription_id', result.subscriptionId)
    : subscriptionDelete;
  const { error: subscriptionDeleteError } = await exactSubscriptionDelete;
  if (subscriptionDeleteError) throw subscriptionDeleteError;
  const { error } = await args.supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
  await args.kv.delete(pendingKey(args.token));
  await args.kv.delete(resultKey(args.token));
  return { deleted: true, email };
}
