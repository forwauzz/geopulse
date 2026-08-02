import type { ExactDomainResolution } from './organization-resolver';
import type { OrganizationContext } from './organization-context';

export const VALUE_FIRST_ONBOARDING_VERSION = 'value-first-onboarding-v1';

export type OnboardingIntent = 'business' | 'agency';
export type OnboardingMarketScope = OrganizationContext['market']['scope'];
export type OnboardingMissingField =
  | 'display_name'
  | 'category'
  | 'country_code'
  | 'subdivision_code'
  | 'locality'
  | 'market_scope'
  | 'languages'
  | 'timezone';

export type OrganizationOnboardingProposal = {
  readonly version: typeof VALUE_FIRST_ONBOARDING_VERSION;
  readonly intent: OnboardingIntent;
  readonly submittedName: string;
  readonly submittedWebsite: string;
  readonly displayName: string;
  readonly canonicalDomain: string;
  readonly category: string | null;
  readonly services: readonly string[];
  readonly buyer: string | null;
  readonly marketScope: OnboardingMarketScope | null;
  readonly countryCode: string | null;
  readonly subdivisionCode: string | null;
  readonly locality: string | null;
  readonly serviceAreas: readonly string[];
  readonly languages: readonly string[];
  readonly timezone: string | null;
  readonly confidence: number;
  readonly resolverStatus: ExactDomainResolution['status'];
  readonly reasonCodes: ExactDomainResolution['reasonCodes'];
  readonly limitations: ExactDomainResolution['limitations'];
  readonly missingFields: readonly OnboardingMissingField[];
};

export type ConfirmedOrganizationOnboarding = {
  readonly intent: OnboardingIntent;
  readonly submittedName: string;
  readonly submittedWebsite: string;
  readonly canonicalDomain: string;
  readonly displayName: string;
  readonly category: string;
  readonly services: readonly string[];
  readonly buyer: string | null;
  readonly marketScope: OnboardingMarketScope;
  readonly countryCode: string;
  readonly subdivisionCode: string | null;
  readonly locality: string | null;
  readonly serviceAreas: readonly string[];
  readonly languages: readonly string[];
  readonly timezone: string;
  readonly confidence: number;
  readonly resolverStatus: ExactDomainResolution['status'];
  readonly reasonCodes: ExactDomainResolution['reasonCodes'];
  readonly limitations: ExactDomainResolution['limitations'];
};

export type OnboardingConfirmationInput = {
  readonly displayName?: string | null;
  readonly category?: string | null;
  readonly countryCode?: string | null;
  readonly subdivisionCode?: string | null;
  readonly locality?: string | null;
  readonly marketScope?: string | null;
  readonly languages?: string | null;
  readonly timezone?: string | null;
};

export type ValueFirstOnboardingActionState =
  | {
      readonly status: 'needs_confirmation';
      readonly proposal: OrganizationOnboardingProposal;
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly draft?: {
        readonly intent: OnboardingIntent;
        readonly name: string;
        readonly website: string;
      };
    };

const FIELD_ORDER: readonly OnboardingMissingField[] = [
  'display_name',
  'country_code',
  'subdivision_code',
  'locality',
  'market_scope',
  'languages',
  'timezone',
  'category',
];

const MARKET_SCOPES = new Set<OnboardingMarketScope>([
  'local',
  'regional',
  'national',
  'global',
  'online',
]);

function clean(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeCountryCode(raw: string | null | undefined): string | null {
  const value = clean(raw);
  if (!value) return null;
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  const names = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;
  if (!names) return null;
  const wanted = value.toLocaleLowerCase('en');
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = names.of(code);
      if (name && name !== code && name.toLocaleLowerCase('en') === wanted) return code;
    }
  }
  return null;
}

function isValidTimeZone(value: string | null): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeLanguages(raw: string | null | undefined, countryCode: string): string[] {
  const values = clean(raw)?.split(',') ?? [];
  return unique(values.map((value) => {
    const normalized = value.trim().replace('_', '-');
    const [base, region] = normalized.split('-');
    if (!base || !/^[a-z]{2,3}$/i.test(base)) return '';
    return `${base.toLowerCase()}-${(region || countryCode).toUpperCase()}`;
  }));
}

function proposalMissingFields(proposal: Omit<OrganizationOnboardingProposal, 'missingFields'>): OnboardingMissingField[] {
  const fields = new Set<OnboardingMissingField>();
  if (!clean(proposal.displayName)) fields.add('display_name');
  if (!clean(proposal.category)) fields.add('category');
  if (!clean(proposal.countryCode)) fields.add('country_code');
  if (!proposal.marketScope) fields.add('market_scope');
  if (proposal.languages.length === 0) fields.add('languages');
  if (!clean(proposal.timezone)) fields.add('timezone');
  if ((proposal.marketScope === 'local' || proposal.marketScope === 'regional')
    && !clean(proposal.locality)
    && proposal.serviceAreas.length === 0) {
    fields.add('locality');
  }
  return FIELD_ORDER.filter((field) => fields.has(field));
}

/** Convert the exact-site resolver into one small, user-confirmable proposal. */
export function buildOrganizationOnboardingProposal(args: {
  readonly intent: OnboardingIntent;
  readonly submittedName: string;
  readonly submittedWebsite: string;
  readonly resolution: ExactDomainResolution;
}): OrganizationOnboardingProposal {
  const market = args.resolution.markets[0] ?? null;
  const base = {
    version: VALUE_FIRST_ONBOARDING_VERSION,
    intent: args.intent,
    submittedName: args.submittedName.trim(),
    submittedWebsite: args.submittedWebsite.trim(),
    displayName: clean(args.resolution.organization.displayName) ?? args.submittedName.trim(),
    canonicalDomain: args.resolution.identity.canonicalDomain,
    category: clean(args.resolution.organization.category),
    services: unique(args.resolution.organization.services),
    buyer: clean(args.resolution.organization.buyer),
    marketScope: market?.scope ?? null,
    countryCode: clean(market?.countryCode)?.toUpperCase() ?? null,
    subdivisionCode: clean(market?.subdivisionCode)?.toUpperCase() ?? null,
    locality: clean(market?.locality),
    serviceAreas: unique(market?.serviceAreas ?? []),
    languages: unique(market?.languages ?? []),
    timezone: clean(market?.timezone),
    confidence: args.resolution.confidence,
    resolverStatus: args.resolution.status,
    reasonCodes: [...args.resolution.reasonCodes],
    limitations: [...args.resolution.limitations],
  } satisfies Omit<OrganizationOnboardingProposal, 'missingFields'>;
  return { ...base, missingFields: proposalMissingFields(base) };
}

export function confirmOrganizationOnboarding(
  proposal: OrganizationOnboardingProposal,
  input: OnboardingConfirmationInput,
): { readonly ok: true; readonly value: ConfirmedOrganizationOnboarding }
  | { readonly ok: false; readonly missingFields: readonly OnboardingMissingField[] } {
  const displayName = clean(input.displayName) ?? clean(proposal.displayName);
  const category = clean(input.category) ?? clean(proposal.category);
  const countryCode = normalizeCountryCode(input.countryCode ?? proposal.countryCode);
  const subdivisionCode = (clean(input.subdivisionCode) ?? clean(proposal.subdivisionCode))?.toUpperCase() ?? null;
  const locality = clean(input.locality) ?? clean(proposal.locality);
  const rawScope = clean(input.marketScope) ?? proposal.marketScope;
  const marketScope = rawScope && MARKET_SCOPES.has(rawScope as OnboardingMarketScope)
    ? rawScope as OnboardingMarketScope
    : null;
  const languages = normalizeLanguages(input.languages ?? proposal.languages.join(', '), countryCode ?? '');
  const timezone = clean(input.timezone) ?? clean(proposal.timezone);
  const missing = new Set<OnboardingMissingField>();
  if (!displayName) missing.add('display_name');
  if (!category) missing.add('category');
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) missing.add('country_code');
  if (!marketScope) missing.add('market_scope');
  if (languages.length === 0) missing.add('languages');
  if (subdivisionCode && !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(subdivisionCode)) missing.add('subdivision_code');
  if (!isValidTimeZone(timezone)) missing.add('timezone');
  if ((marketScope === 'local' || marketScope === 'regional')
    && !locality
    && proposal.serviceAreas.length === 0) {
    missing.add('locality');
  }
  const missingFields = FIELD_ORDER.filter((field) => missing.has(field));
  if (missingFields.length > 0) return { ok: false, missingFields };

  return {
    ok: true,
    value: {
      intent: proposal.intent,
      submittedName: proposal.submittedName,
      submittedWebsite: proposal.submittedWebsite,
      canonicalDomain: proposal.canonicalDomain,
      displayName: displayName!,
      category: category!,
      services: proposal.services,
      buyer: proposal.buyer,
      marketScope: marketScope!,
      countryCode: countryCode!,
      subdivisionCode,
      locality,
      serviceAreas: unique([...(locality ? [locality] : []), ...proposal.serviceAreas]),
      languages,
      timezone: timezone!,
      confidence: proposal.confidence,
      resolverStatus: proposal.resolverStatus,
      reasonCodes: proposal.reasonCodes,
      limitations: proposal.limitations,
    },
  };
}

export function formatOnboardingMarket(proposal: Pick<OrganizationOnboardingProposal, 'locality' | 'subdivisionCode' | 'countryCode' | 'marketScope'>): string {
  const places = unique([
    proposal.locality ?? '',
    proposal.subdivisionCode ?? '',
    proposal.countryCode ?? '',
  ]);
  const location = places.length > 0 ? places.join(', ') : 'Market needs confirmation';
  return proposal.marketScope ? `${location} · ${proposal.marketScope}` : location;
}

export function onboardingQuestion(field: OnboardingMissingField): string {
  switch (field) {
    case 'display_name': return 'What business name should appear in the workspace and reports?';
    case 'category': return 'What kind of business is this?';
    case 'country_code': return 'Which country does this business primarily serve?';
    case 'subdivision_code': return 'Which province or state code applies?';
    case 'locality': return 'Which city or local area should the first baseline use?';
    case 'market_scope': return 'Is the business local, regional, national, online, or global?';
    case 'languages': return 'Which customer languages should the baseline use?';
    case 'timezone': return 'Which time zone should reporting and monitoring follow?';
  }
}
