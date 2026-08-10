import type { AudienceEvidence } from './campaign-audience';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
]);

const GENERIC_LOCAL_PART = /^(admin|billing|contact|hello|help|info|office|sales|service|support|team)$/i;
const DECISION_MAKER_TITLE = /(owner|founder|co-?founder|president|chief executive|ceo|managing (director|partner)|partner|principal)/i;

export type SavedApolloContact = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly url: string;
  readonly companyDomain: string | null;
  readonly contactTitle: string | null;
  readonly eligibilityStatus: string;
  readonly tags: readonly string[];
};

export type SavedApolloRejectionReason =
  | 'invalid_email'
  | 'free_email'
  | 'generic_inbox'
  | 'missing_identity'
  | 'domain_mismatch'
  | 'terminal_status'
  | 'unsubscribed'
  | 'converted'
  | 'suppressed'
  | 'conflicting_active_sequence'
  | 'already_enrolled'
  | 'duplicate_company'
  | 'over_limit';

export type SavedApolloSelection = {
  readonly selected: readonly SavedApolloContact[];
  readonly rejectedCounts: Readonly<Partial<Record<SavedApolloRejectionReason, number>>>;
};

function normalizedDomain(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function reject(
  counts: Partial<Record<SavedApolloRejectionReason, number>>,
  reason: SavedApolloRejectionReason,
): false {
  counts[reason] = (counts[reason] ?? 0) + 1;
  return false;
}

function strength(contact: SavedApolloContact): number {
  let score = 0;
  if ((contact.name ?? '').trim().split(/\s+/).length >= 2) score += 3;
  if (DECISION_MAKER_TITLE.test(contact.contactTitle ?? '')) score += 3;
  if (contact.company?.trim()) score += 1;
  if (/^[a-z]+(?:\.[a-z]+)?$/i.test(contact.email.split('@')[0] ?? '')) score += 1;
  return score;
}

/**
 * Select a bounded cohort from a founder-provided Apollo export without calling Apollo again.
 * Provider verification is not re-run, but objective identity and suppression gates remain closed.
 */
export function selectSavedApolloContacts(args: {
  readonly contacts: readonly SavedApolloContact[];
  readonly evidence: AudienceEvidence;
  readonly limit: number;
}): SavedApolloSelection {
  const rejectedCounts: Partial<Record<SavedApolloRejectionReason, number>> = {};
  const survivors = args.contacts.filter((contact) => {
    const email = contact.email.trim().toLowerCase();
    const [local = '', emailDomain = ''] = email.split('@');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reject(rejectedCounts, 'invalid_email');
    if (FREE_EMAIL_DOMAINS.has(emailDomain)) return reject(rejectedCounts, 'free_email');
    if (GENERIC_LOCAL_PART.test(local)) return reject(rejectedCounts, 'generic_inbox');
    if (!contact.name?.trim() || !contact.company?.trim()) return reject(rejectedCounts, 'missing_identity');
    const websiteDomain = normalizedDomain(contact.companyDomain || contact.url);
    if (!websiteDomain || (emailDomain !== websiteDomain && !emailDomain.endsWith(`.${websiteDomain}`))) {
      return reject(rejectedCounts, 'domain_mismatch');
    }
    if (['suppressed', 'rejected', 'converted'].includes(contact.eligibilityStatus)) {
      return reject(rejectedCounts, 'terminal_status');
    }
    if (args.evidence.unsubscribedEmails.has(email)) return reject(rejectedCounts, 'unsubscribed');
    if (args.evidence.convertedEmails.has(email)) return reject(rejectedCounts, 'converted');
    if (args.evidence.suppressedEmails.has(email)) return reject(rejectedCounts, 'suppressed');
    if (args.evidence.activeSequenceEmails.has(email)) return reject(rejectedCounts, 'conflicting_active_sequence');
    if (args.evidence.enrolledContactIds.has(contact.id)) return reject(rejectedCounts, 'already_enrolled');
    return true;
  });

  const ranked = [...survivors].sort((left, right) => strength(right) - strength(left) || left.email.localeCompare(right.email));
  const distinctCompanies: SavedApolloContact[] = [];
  const seenDomains = new Set<string>();
  for (const contact of ranked) {
    const companyDomain = normalizedDomain(contact.companyDomain || contact.url);
    if (seenDomains.has(companyDomain)) {
      reject(rejectedCounts, 'duplicate_company');
      continue;
    }
    seenDomains.add(companyDomain);
    distinctCompanies.push(contact);
  }

  const limit = Math.max(0, Math.min(Math.trunc(args.limit), 25));
  if (distinctCompanies.length > limit) rejectedCounts.over_limit = distinctCompanies.length - limit;
  return { selected: distinctCompanies.slice(0, limit), rejectedCounts };
}
