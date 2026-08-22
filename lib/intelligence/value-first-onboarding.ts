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
  readonly services?: string | null;
  readonly buyer?: string | null;
};

export type LegacyOnboardingHints = {
  readonly category?: string | null;
  readonly location?: string | null;
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

/**
 * The IANA zone a market implies, where it implies exactly one.
 *
 * Only unambiguous cases are listed. A country that spans zones is absent unless
 * the subdivision settles it, because asking is better than reporting a client's
 * schedule in the wrong time. Canada and the United States are enumerated by
 * subdivision since those are the markets onboarding actually sees; anything else
 * still asks.
 */
const MARKET_TIME_ZONES: Readonly<Record<string, string>> = {
  // Canada
  'CA-NL': 'America/St_Johns',
  'CA-NS': 'America/Halifax', 'CA-NB': 'America/Moncton', 'CA-PE': 'America/Halifax',
  'CA-QC': 'America/Toronto', 'CA-ON': 'America/Toronto',
  'CA-MB': 'America/Winnipeg', 'CA-SK': 'America/Regina',
  'CA-AB': 'America/Edmonton', 'CA-NT': 'America/Edmonton', 'CA-NU': 'America/Iqaluit',
  'CA-BC': 'America/Vancouver', 'CA-YT': 'America/Whitehorse',
  // United States
  'US-CT': 'America/New_York', 'US-DE': 'America/New_York', 'US-DC': 'America/New_York',
  'US-FL': 'America/New_York', 'US-GA': 'America/New_York', 'US-ME': 'America/New_York',
  'US-MD': 'America/New_York', 'US-MA': 'America/New_York', 'US-MI': 'America/New_York',
  'US-NH': 'America/New_York', 'US-NJ': 'America/New_York', 'US-NY': 'America/New_York',
  'US-NC': 'America/New_York', 'US-OH': 'America/New_York', 'US-PA': 'America/New_York',
  'US-RI': 'America/New_York', 'US-SC': 'America/New_York', 'US-VT': 'America/New_York',
  'US-VA': 'America/New_York', 'US-WV': 'America/New_York',
  'US-AL': 'America/Chicago', 'US-AR': 'America/Chicago', 'US-IL': 'America/Chicago',
  'US-IA': 'America/Chicago', 'US-LA': 'America/Chicago', 'US-MN': 'America/Chicago',
  'US-MS': 'America/Chicago', 'US-MO': 'America/Chicago', 'US-OK': 'America/Chicago',
  'US-WI': 'America/Chicago',
  'US-AZ': 'America/Phoenix', 'US-CO': 'America/Denver', 'US-MT': 'America/Denver',
  'US-NM': 'America/Denver', 'US-UT': 'America/Denver', 'US-WY': 'America/Denver',
  'US-CA': 'America/Los_Angeles', 'US-NV': 'America/Los_Angeles',
  'US-OR': 'America/Los_Angeles', 'US-WA': 'America/Los_Angeles',
  'US-AK': 'America/Anchorage', 'US-HI': 'Pacific/Honolulu',
  // Single-zone countries this product already serves
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels', CH: 'Europe/Zurich', SG: 'Asia/Singapore', NZ: 'Pacific/Auckland',
};

/** The zone a confirmed market implies, or null when the market does not settle it. */
export function timeZoneForMarket(
  countryCode: string | null,
  subdivisionCode: string | null,
): string | null {
  const subdivision = subdivisionCode?.trim().toUpperCase();
  if (subdivision && MARKET_TIME_ZONES[subdivision]) return MARKET_TIME_ZONES[subdivision]!;
  const country = countryCode?.trim().toUpperCase();
  if (country && MARKET_TIME_ZONES[country]) return MARKET_TIME_ZONES[country]!;
  return null;
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

/**
 * Fill exact-site gaps from the client record the agency already curated.
 *
 * These are hints, not a second resolver: exact-site facts always win, and a
 * legacy location is kept as a service area instead of being promoted to a
 * locality, country, or timezone that the stored data never proved.
 */
export function proposalWithLegacyHints(
  proposal: OrganizationOnboardingProposal,
  hints: LegacyOnboardingHints,
): OrganizationOnboardingProposal {
  const category = proposal.category ?? clean(hints.category);
  const legacyLocation = clean(hints.location);
  const serviceAreas = proposal.serviceAreas.length > 0
    ? [...proposal.serviceAreas]
    : legacyLocation ? [legacyLocation] : [];
  const base = {
    ...proposal,
    category,
    serviceAreas,
  } satisfies Omit<OrganizationOnboardingProposal, 'missingFields'>;
  return { ...base, missingFields: proposalMissingFields(base) };
}

/**
 * Re-render a confirmation from what the person typed rather than from what was
 * originally detected, so a retry keeps their corrections.
 */
export function proposalWithCorrections(
  proposal: OrganizationOnboardingProposal,
  failure: {
    readonly missingFields: readonly OnboardingMissingField[];
    readonly submitted: Partial<Record<OnboardingMissingField, string>>;
  },
): OrganizationOnboardingProposal {
  const { submitted } = failure;
  const scope = submitted.market_scope;
  return {
    ...proposal,
    displayName: submitted.display_name ?? proposal.displayName,
    category: submitted.category ?? proposal.category,
    countryCode: submitted.country_code ?? proposal.countryCode,
    subdivisionCode: submitted.subdivision_code ?? proposal.subdivisionCode,
    locality: submitted.locality ?? proposal.locality,
    marketScope: scope && MARKET_SCOPES.has(scope as OnboardingMarketScope)
      ? scope as OnboardingMarketScope
      : proposal.marketScope,
    languages: submitted.languages
      ? unique(submitted.languages.split(',').map((value) => value.trim()).filter(Boolean))
      : proposal.languages,
    timezone: submitted.timezone ?? proposal.timezone,
    missingFields: failure.missingFields,
  };
}

/** Actionable guidance for a field the person answered with something unusable. */
export function onboardingCorrectionMessage(
  invalidFields: readonly OnboardingMissingField[],
): string | null {
  if (invalidFields.includes('timezone')) {
    return 'That time zone is not one GEO-Pulse recognizes. Use an IANA name such as America/Toronto or America/Los_Angeles.';
  }
  return null;
}

export function confirmOrganizationOnboarding(
  proposal: OrganizationOnboardingProposal,
  input: OnboardingConfirmationInput,
): { readonly ok: true; readonly value: ConfirmedOrganizationOnboarding }
  | {
      readonly ok: false;
      readonly missingFields: readonly OnboardingMissingField[];
      /**
       * What the person actually typed, so a second attempt starts from their
       * corrections. Returning only the failing fields meant the form fell back to
       * the originally detected proposal and silently discarded every other answer,
       * which is what made a single bad time zone look like an unbreakable loop.
       */
      readonly submitted: Partial<Record<OnboardingMissingField, string>>;
      /** Fields the person answered with something unusable, as opposed to left blank. */
      readonly invalidFields: readonly OnboardingMissingField[];
    } {
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
  const services = input.services === undefined || input.services === null
    ? proposal.services
    : unique(input.services.split(/[\r\n,]+/).map((value) => value.trim()).filter(Boolean));
  const buyer = clean(input.buyer) ?? proposal.buyer;

  // A blank time zone the market already settles is not a question worth asking.
  // A wrong one is: silently replacing it would report a client's schedule in a
  // time they did not choose.
  const typedTimezone = clean(input.timezone);
  const timezone = typedTimezone ?? clean(proposal.timezone) ?? timeZoneForMarket(countryCode, subdivisionCode);
  // Only what the person typed can be called invalid. A detected value that fails
  // is our problem to re-ask, not their mistake to correct.
  const timezoneInvalid = Boolean(typedTimezone) && !isValidTimeZone(typedTimezone);
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
  if (missingFields.length > 0) {
    // Everything the person typed goes back, not just what failed, so a retry does
    // not cost them the answers that were already right.
    const submitted: Partial<Record<OnboardingMissingField, string>> = {};
    const keep = (field: OnboardingMissingField, value: string | null | undefined) => {
      if (value) submitted[field] = value;
    };
    keep('display_name', clean(input.displayName));
    keep('category', clean(input.category));
    keep('country_code', clean(input.countryCode));
    keep('subdivision_code', clean(input.subdivisionCode));
    keep('locality', clean(input.locality));
    keep('market_scope', clean(input.marketScope));
    keep('languages', clean(input.languages));
    keep('timezone', clean(input.timezone));
    return {
      ok: false,
      missingFields,
      submitted,
      invalidFields: timezoneInvalid ? ['timezone'] : [],
    };
  }

  return {
    ok: true,
    value: {
      intent: proposal.intent,
      submittedName: proposal.submittedName,
      submittedWebsite: proposal.submittedWebsite,
      canonicalDomain: proposal.canonicalDomain,
      displayName: displayName!,
      category: category!,
      services,
      buyer,
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
