export type RevenueIdentityMetadata = Record<string, unknown> | null;

/**
 * Canonical identities that must never be counted as external revenue proof.
 * Keep this service-side: public analytics must not expose the underlying emails.
 */
export const INTERNAL_REVENUE_EMAILS = new Set([
  'tamonuzziel@gmail.com',
  'uzzielt@techehealthservices.com',
]);

export const INTERNAL_REVENUE_DOMAINS = new Set([
  'alie.app',
  'getgeopulse.com',
  'techehealthservices.com',
  'lifter.ca',
  'example.com',
]);

export function normalizedRevenueDomain(value: string | null | undefined): string {
  if (!value) return '';
  const candidate = value.trim().toLowerCase();
  if (!candidate) return '';
  try {
    return new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname
      .replace(/^www\./, '');
  } catch {
    return candidate.replace(/^www\./, '').split('/')[0] ?? '';
  }
}

export function isExcludedRevenueIdentity(args: {
  readonly email?: string | null;
  readonly domain?: string | null;
  readonly metadata?: RevenueIdentityMetadata;
}): boolean {
  const email = args.email?.trim().toLowerCase() ?? '';
  const emailDomain = email.split('@')[1] ?? '';
  const siteDomain = normalizedRevenueDomain(args.domain);
  const metadata = args.metadata ?? {};
  const explicitInternal = [
    metadata['internal'],
    metadata['is_internal'],
    metadata['test'],
    metadata['is_test'],
  ].some((value) => value === true || value === 'true');
  const classification = [
    metadata['account_type'],
    metadata['revenue_classification'],
    metadata['environment'],
  ].map((value) => String(value ?? '').toLowerCase());
  const source = String(metadata['source'] ?? '').trim().toLowerCase();
  const subscriptionId = String(metadata['subscription_id'] ?? '').trim().toLowerCase();

  return (!email && !siteDomain)
    || INTERNAL_REVENUE_EMAILS.has(email)
    || INTERNAL_REVENUE_DOMAINS.has(emailDomain)
    || INTERNAL_REVENUE_DOMAINS.has(siteDomain)
    || email.startsWith('test@')
    || email.includes('+test@')
    || explicitInternal
    || ['admin_assign_plan', 'admin_comp'].includes(source)
    || subscriptionId.startsWith('admin_comp:')
    || classification.some((value) => ['internal', 'test', 'sandbox'].includes(value));
}

export function isPaidCheckoutMetadata(metadata: RevenueIdentityMetadata | undefined): boolean {
  const value = metadata ?? {};
  if (String(value['mode'] ?? '').toLowerCase() === 'free') return false;
  if (String(value['commerce_kind'] ?? '').toLowerCase() === 'paid_checkout') return true;
  if (String(value['kind'] ?? '').toLowerCase() === 'monitor') return true;
  const stripeSessionId = String(value['stripe_session_id'] ?? '');
  return /^cs_[A-Za-z0-9_]+$/.test(stripeSessionId);
}

export function isExternalPaidCheckout(args: {
  readonly email?: string | null;
  readonly domain?: string | null;
  readonly metadata?: RevenueIdentityMetadata;
}): boolean {
  return isPaidCheckoutMetadata(args.metadata)
    && !isExcludedRevenueIdentity(args);
}

export function isVerifiedStripeSubscriptionId(value: string | null | undefined): boolean {
  return /^sub_[A-Za-z0-9]+$/.test(value?.trim() ?? '');
}
