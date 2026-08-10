const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';
const FREE_EMAIL_DOMAINS = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com']);
const MSP_TEXT_RE = /managed\s+(?:it|services)|managed service provider|\bmsp\b|it services|information technology|cybersecurity|cloud services|technical support/i;

export type ApolloSearchCandidate = {
  readonly personId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly title: string;
  readonly linkedinUrl: string | null;
  readonly company: string;
  readonly domain: string;
  readonly companyLinkedinUrl: string | null;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly industry: string;
  readonly keywords: string;
  readonly employeeCount: number | null;
};

export type ApolloEnrichedContact = ApolloSearchCandidate & {
  readonly email: string;
  readonly emailStatus: 'verified';
};

type FetchLike = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function domain(value: unknown): string {
  const raw = string(value).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) ? raw : '';
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

export function parseApolloSearchCandidates(payload: unknown): ApolloSearchCandidate[] {
  const root = object(payload);
  const people = Array.isArray(root['people']) ? root['people'] : [];
  const out: ApolloSearchCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of people) {
    const person = object(raw);
    const org = object(person['organization']);
    const personId = string(person['id'] || person['person_id']);
    const orgDomain = domain(org['primary_domain'] || org['website_url'] || person['organization_domain']);
    const company = string(org['name'] || person['organization_name']);
    const firstName = string(person['first_name']);
    const lastName = string(person['last_name']);
    const title = string(person['title']);
    const industry = string(org['industry']);
    const keywordsValue = Array.isArray(org['keywords']) ? org['keywords'].map(string).filter(Boolean).join(', ') : string(org['keywords']);
    const state = string(org['state'] || person['state']);
    const country = string(org['country'] || person['country']);
    if (!personId || !orgDomain || !company || !firstName || !title) continue;
    if (!/^(quebec|québec)$/i.test(state) || country.toLowerCase() !== 'canada') continue;
    if (!MSP_TEXT_RE.test(`${industry} ${keywordsValue} ${company}`)) continue;
    if (seen.has(personId) || seen.has(orgDomain)) continue;
    seen.add(personId);
    seen.add(orgDomain);
    out.push({
      personId,
      firstName,
      lastName,
      title,
      linkedinUrl: string(person['linkedin_url']) || null,
      company,
      domain: orgDomain,
      companyLinkedinUrl: string(org['linkedin_url']) || null,
      city: string(org['city'] || person['city']),
      state,
      country,
      industry,
      keywords: keywordsValue,
      employeeCount: numberOrNull(org['estimated_num_employees'] || org['num_employees']),
    });
  }
  return out;
}

export function parseApolloEnrichedContact(candidate: ApolloSearchCandidate, payload: unknown): ApolloEnrichedContact | null {
  const root = object(payload);
  const person = object(root['person'] || root['match']);
  const email = string(person['email']).toLowerCase();
  const emailStatus = string(person['email_status']).toLowerCase();
  const emailDomain = email.split('@')[1] ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || emailStatus !== 'verified') return null;
  if (FREE_EMAIL_DOMAINS.has(emailDomain)) return null;
  if (emailDomain !== candidate.domain && !emailDomain.endsWith(`.${candidate.domain}`)) return null;
  return { ...candidate, email, emailStatus: 'verified' };
}

async function apolloJson(fetcher: FetchLike, url: string, apiKey: string, body?: unknown): Promise<unknown> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'cache-control': 'no-cache', 'x-api-key': apiKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`apollo_http_${String(response.status)}`);
  return response.json();
}

export async function searchApolloQuebecMspCandidates(args: {
  readonly apiKey: string;
  readonly fetcher?: FetchLike;
  readonly perPage?: number;
}): Promise<ApolloSearchCandidate[]> {
  if (!args.apiKey.trim()) throw new Error('apollo_api_key_missing');
  const payload = await apolloJson(args.fetcher ?? fetch, `${APOLLO_BASE_URL}/mixed_people/api_search`, args.apiKey, {
    person_titles: ['owner', 'founder', 'president', 'chief executive officer', 'managing partner', 'principal'],
    person_seniorities: ['owner', 'founder', 'c_suite', 'partner'],
    organization_locations: ['Quebec, Canada'],
    organization_num_employees_ranges: ['2,20', '21,50', '51,200'],
    contact_email_status: ['verified'],
    q_keywords: 'managed IT services cybersecurity cloud services',
    include_similar_titles: true,
    page: 1,
    per_page: Math.max(1, Math.min(args.perPage ?? 50, 100)),
  });
  return parseApolloSearchCandidates(payload);
}

export async function enrichApolloCandidates(args: {
  readonly apiKey: string;
  readonly candidates: readonly ApolloSearchCandidate[];
  readonly maxCredits: number;
  readonly fetcher?: FetchLike;
}): Promise<{ contacts: ApolloEnrichedContact[]; attempted: number }> {
  if (!args.apiKey.trim()) throw new Error('apollo_api_key_missing');
  const max = Math.max(0, Math.min(Math.trunc(args.maxCredits), 10));
  const contacts: ApolloEnrichedContact[] = [];
  let attempted = 0;
  for (const candidate of args.candidates.slice(0, max)) {
    attempted += 1;
    const url = new URL(`${APOLLO_BASE_URL}/people/match`);
    url.searchParams.set('id', candidate.personId);
    url.searchParams.set('reveal_personal_emails', 'false');
    url.searchParams.set('reveal_phone_number', 'false');
    const payload = await apolloJson(args.fetcher ?? fetch, url.toString(), args.apiKey);
    const contact = parseApolloEnrichedContact(candidate, payload);
    if (contact) contacts.push(contact);
  }
  return { contacts, attempted };
}
