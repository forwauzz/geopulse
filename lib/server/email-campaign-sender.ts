/**
 * Campaign sender identity (VCI-8 / ECP-2, enforced in ECP-3).
 *
 * The one expected founder/credential-holder boundary in VCI-8. Inspection of the current
 * provider found only Teche Health Services and ALIE sender identities; GEO-Pulse outreach must
 * not borrow either. Until someone with DNS access authenticates a GEO-Pulse sending domain and
 * sets the configuration below, this resolver returns `authenticated: false` and every downstream
 * gate refuses — that is the intended state, not a bug.
 *
 * Resolution is fail-closed on purpose: a missing variable, a non-GEO-Pulse domain, or an
 * unverified flag all produce "unauthenticated". Nothing here can invent an address.
 */
import type { EmailCampaignSender } from './email-campaign-contract';

export const CAMPAIGN_FROM_ENV_KEY = 'GEOPULSE_CAMPAIGN_FROM_EMAIL';
export const CAMPAIGN_REPLY_TO_ENV_KEY = 'GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL';
export const CAMPAIGN_SENDER_VERIFIED_ENV_KEY = 'GEOPULSE_CAMPAIGN_SENDER_VERIFIED';

/** Identities belonging to other businesses. Using one would misrepresent who is writing. */
const FORBIDDEN_SENDER_DOMAINS = ['techehealth', 'teche-health', 'techeconsulting', 'alie'];

const APPROVED_SENDER_DOMAIN_SUFFIXES = ['getgeopulse.com', 'geopulse.com'];

export type SenderEnvLike = Readonly<Record<string, string | undefined>>;

export interface SenderResolution extends EmailCampaignSender {
  /** Present only for the admin UI's "who would this come from" line; never persisted. */
  readonly resolvedFromAddress: string | null;
  readonly resolvedReplyToAddress: string | null;
  readonly blockingReason: string | null;
}

export function resolveCampaignSender(env: SenderEnvLike, displayName = 'Elena at GEO-Pulse'): SenderResolution {
  const from = env[CAMPAIGN_FROM_ENV_KEY]?.trim().toLowerCase() ?? '';
  const replyTo = env[CAMPAIGN_REPLY_TO_ENV_KEY]?.trim().toLowerCase() ?? '';
  const verified = env[CAMPAIGN_SENDER_VERIFIED_ENV_KEY]?.trim().toLowerCase() === 'true';

  const base: Omit<SenderResolution, 'authenticated' | 'authenticationEvidence' | 'blockingReason' | 'resolvedFromAddress' | 'resolvedReplyToAddress'> = {
    displayName,
    fromAddressRef: CAMPAIGN_FROM_ENV_KEY,
    replyToRef: CAMPAIGN_REPLY_TO_ENV_KEY,
  };

  const unauthenticated = (reason: string): SenderResolution => ({
    ...base,
    authenticated: false,
    authenticationEvidence: null,
    resolvedFromAddress: null,
    resolvedReplyToAddress: null,
    blockingReason: reason,
  });

  if (!from || !replyTo) {
    return unauthenticated(
      `${CAMPAIGN_FROM_ENV_KEY} and ${CAMPAIGN_REPLY_TO_ENV_KEY} are not configured. A credential holder must authenticate a GEO-Pulse sending domain first.`,
    );
  }

  const domain = from.slice(from.indexOf('@') + 1);
  if (FORBIDDEN_SENDER_DOMAINS.some((forbidden) => domain.includes(forbidden))) {
    return unauthenticated(`${from} belongs to another business. GEO-Pulse outreach must send from a GEO-Pulse identity.`);
  }
  if (!APPROVED_SENDER_DOMAIN_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) {
    return unauthenticated(`${domain} is not an approved GEO-Pulse sending domain.`);
  }
  if (!verified) {
    return unauthenticated(
      `${CAMPAIGN_SENDER_VERIFIED_ENV_KEY} is not "true". Set it only after SPF, DKIM, and DMARC are verified for ${domain}.`,
    );
  }

  return {
    ...base,
    authenticated: true,
    authenticationEvidence: `${domain} verified via ${CAMPAIGN_SENDER_VERIFIED_ENV_KEY}`,
    resolvedFromAddress: from,
    resolvedReplyToAddress: replyTo,
    blockingReason: null,
  };
}

/** Internal test recipients are configuration, never operator free-text (ECP-3). */
export function resolveTestRecipients(env: SenderEnvLike): string[] {
  return (env['GEOPULSE_CAMPAIGN_TEST_RECIPIENTS'] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    .slice(0, 5);
}
