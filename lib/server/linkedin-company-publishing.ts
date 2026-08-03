export const LINKEDIN_COMPANY_REQUIRED_SCOPES = [
  'rw_organization_admin',
  'w_organization_social',
] as const;

export const DEFAULT_LINKEDIN_API_VERSION = '202607';

export type LinkedInOrganizationProfile = {
  readonly id: string;
  readonly organizationUrn: string;
  readonly localizedName: string;
  readonly localizedWebsite: string | null;
  readonly vanityName: string | null;
};

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function websiteHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return null;
  }
}

export function isLinkedInOrganizationUrn(value: string | null | undefined): boolean {
  return /^urn:li:organization:\d+$/.test(value?.trim() ?? '');
}

export function resolveLinkedInApiVersion(value?: string | null): string {
  const candidate = value?.trim() || DEFAULT_LINKEDIN_API_VERSION;
  if (!/^\d{6}$/.test(candidate)) {
    throw new Error('LINKEDIN_API_VERSION must use YYYYMM format.');
  }
  return candidate;
}

export function buildLinkedInRestHeaders(args: {
  readonly accessToken: string;
  readonly apiVersion?: string | null;
  readonly contentType?: boolean;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${args.accessToken}`,
    'Linkedin-Version': resolveLinkedInApiVersion(args.apiVersion),
    'X-Restli-Protocol-Version': '2.0.0',
    ...(args.contentType === false ? {} : { 'Content-Type': 'application/json' }),
  };
}

export function assertLinkedInCompanyScopes(scopeList: ReadonlyArray<string>): void {
  const granted = new Set(scopeList);
  const missing = LINKEDIN_COMPANY_REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
  const unexpected = [...granted].filter(
    (scope) =>
      !LINKEDIN_COMPANY_REQUIRED_SCOPES.includes(
        scope as (typeof LINKEDIN_COMPANY_REQUIRED_SCOPES)[number]
      )
  );
  if (missing.length > 0) {
    throw new Error(`LinkedIn OAuth grant is missing required scopes: ${missing.join(', ')}`);
  }
  if (unexpected.length > 0) {
    throw new Error(`LinkedIn OAuth grant contains unapproved scopes: ${unexpected.join(', ')}`);
  }
}

function readOrganizationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^urn:li:organization:(\d+)$/);
  return match?.[1] ?? null;
}

export async function resolveApprovedLinkedInOrganization(args: {
  readonly accessToken: string;
  readonly expectedName: string;
  readonly expectedWebsiteHost: string;
  readonly expectedVanityNames: ReadonlyArray<string>;
  readonly apiBaseUrl?: string | null;
  readonly apiVersion?: string | null;
  readonly fetchImpl?: typeof fetch;
}): Promise<LinkedInOrganizationProfile> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiBase = (args.apiBaseUrl?.trim() || 'https://api.linkedin.com').replace(/\/+$/, '');
  const headers = buildLinkedInRestHeaders({
    accessToken: args.accessToken,
    apiVersion: args.apiVersion,
    contentType: false,
  });
  const aclResponse = await fetchImpl(
    `${apiBase}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
    { headers }
  );
  if (!aclResponse.ok) {
    throw new Error(`LinkedIn organization access verification failed (${aclResponse.status}).`);
  }
  const aclPayload = (await aclResponse.json()) as {
    elements?: Array<{ organization?: unknown; organizationTarget?: unknown }>;
  };
  const organizationIds = [
    ...new Set(
      (aclPayload.elements ?? [])
        .map((element) =>
          readOrganizationId(element.organization) ?? readOrganizationId(element.organizationTarget)
        )
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (organizationIds.length === 0) {
    throw new Error('LinkedIn account has no approved Company Page administrator access.');
  }

  const profiles: LinkedInOrganizationProfile[] = [];
  for (const id of organizationIds) {
    const response = await fetchImpl(`${apiBase}/rest/organizations/${id}`, { headers });
    if (!response.ok) continue;
    const raw = (await response.json()) as Record<string, unknown>;
    const localizedName = typeof raw['localizedName'] === 'string' ? raw['localizedName'].trim() : '';
    if (!localizedName) continue;
    profiles.push({
      id,
      organizationUrn: `urn:li:organization:${id}`,
      localizedName,
      localizedWebsite:
        typeof raw['localizedWebsite'] === 'string' ? raw['localizedWebsite'].trim() || null : null,
      vanityName: typeof raw['vanityName'] === 'string' ? raw['vanityName'].trim() || null : null,
    });
  }

  const expectedHost = normalized(args.expectedWebsiteHost).replace(/^www\./, '');
  const expectedVanities = new Set(args.expectedVanityNames.map(normalized));
  const matches = profiles.filter(
    (profile) =>
      normalized(profile.localizedName) === normalized(args.expectedName) &&
      (websiteHost(profile.localizedWebsite) === expectedHost ||
        (profile.vanityName ? expectedVanities.has(normalized(profile.vanityName)) : false))
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? 'LinkedIn authorization did not match the GEO-Pulse Company Page.'
        : 'LinkedIn authorization matched more than one Company Page; connection was refused.'
    );
  }
  return matches[0]!;
}

export function buildLinkedInTextPostPayload(args: {
  readonly authorUrn: string;
  readonly commentary: string;
  readonly imageUrn?: string | null;
  readonly imageAltText?: string | null;
}) {
  if (!isLinkedInOrganizationUrn(args.authorUrn)) {
    throw new Error('LinkedIn post author must be a verified Company Page organization URN.');
  }
  return {
    author: args.authorUrn,
    commentary: args.commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    ...(args.imageUrn
      ? {
          content: {
            media: {
              id: args.imageUrn,
              ...(args.imageAltText?.trim() ? { altText: args.imageAltText.trim() } : {}),
            },
          },
        }
      : {}),
  };
}

export function linkedInPostDestinationUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}`;
}
