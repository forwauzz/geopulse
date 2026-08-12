import { z } from 'zod';
import { contactProjectionSchema, type ContactProjection } from '../crm-contract';

export const BREVO_SCOPE = 'contacts:read';
export const BREVO_SOURCE_VERSION = 'brevo-contact-v1';
export const BREVO_AUTHORIZE_URL = 'https://oauth.brevo.com/realms/partner/oauth/authorize';
export const BREVO_TOKEN_URL = 'https://oauth.brevo.com/realms/partner/oauth/token';
const API_BASE = 'https://api.brevo.com/v3';

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  token_type: z.string().min(1),
  scope: z.string().min(1),
}).passthrough();

const listSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  totalSubscribers: z.number().int().nonnegative().optional(),
  uniqueSubscribers: z.number().int().nonnegative().optional(),
}).passthrough();

const contactSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email().optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).optional().default({}),
  listIds: z.array(z.union([z.string(), z.number()])).optional().default([]),
  emailBlacklisted: z.boolean().optional().default(false),
  listUnsubscribed: z.array(z.union([z.string(), z.number()])).optional().default([]),
  createdAt: z.string().optional(),
  modifiedAt: z.string().optional(),
}).passthrough();

export type BrevoToken = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number;
  readonly scopes: readonly string[];
  readonly subject: string;
};

export type BrevoList = {
  readonly id: string;
  readonly name: string;
  readonly contactCount: number | null;
};

export type BrevoContactCandidate = {
  readonly providerContactId: string;
  readonly firstName: string | null;
  readonly companyName: string | null;
  readonly canonicalDomain: string | null;
  readonly email: string | null;
  readonly listIds: readonly string[];
  readonly suppressionState: ContactProjection['suppressionState'];
  readonly observedAt: string;
  readonly selectionBlockReason: string | null;
};

type Fetcher = typeof fetch;

function scopes(raw: string): string[] {
  return Array.from(new Set(raw.split(/\s+/).map((value) => value.trim()).filter(Boolean)));
}

function decodeJwtSubject(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (!payload) return '';
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const parsed = JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))) as Record<string, unknown>;
    return typeof parsed['sub'] === 'string' ? parsed['sub'].trim() : '';
  } catch {
    return '';
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > 2_000_000) throw new Error('brevo_response_too_large');
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('brevo_response_too_large');
  return JSON.parse(body) as unknown;
}

async function exchange(body: URLSearchParams, fetcher: Fetcher): Promise<BrevoToken> {
  const response = await fetcher(BREVO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`brevo_token_http_${response.status}`);
  const parsed = tokenSchema.parse(await readJson(response));
  const granted = scopes(parsed.scope);
  if (!granted.includes(BREVO_SCOPE)) throw new Error('brevo_scope_missing');
  const subject = decodeJwtSubject(parsed.access_token);
  if (!subject) throw new Error('brevo_token_subject_missing');
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresIn: parsed.expires_in,
    scopes: granted,
    subject,
  };
}

export function buildBrevoAuthorizeUrl(args: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
}): string {
  const url = new URL(BREVO_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', args.clientId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('scope', BREVO_SCOPE);
  url.searchParams.set('state', args.state);
  return url.toString();
}

export function exchangeBrevoCode(args: {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly fetcher?: Fetcher;
}): Promise<BrevoToken> {
  return exchange(new URLSearchParams({
    grant_type: 'authorization_code', client_id: args.clientId,
    client_secret: args.clientSecret, code: args.code, redirect_uri: args.redirectUri,
  }), args.fetcher ?? fetch);
}

export function refreshBrevoToken(args: {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fetcher?: Fetcher;
}): Promise<BrevoToken> {
  return exchange(new URLSearchParams({
    grant_type: 'refresh_token', client_id: args.clientId,
    client_secret: args.clientSecret, refresh_token: args.refreshToken,
  }), args.fetcher ?? fetch);
}

async function brevoGet(path: string, accessToken: string, fetcher: Fetcher): Promise<unknown> {
  const response = await fetcher(`${API_BASE}${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`brevo_api_http_${response.status}`);
  return readJson(response);
}

export async function listBrevoLists(args: {
  readonly accessToken: string;
  readonly offset?: number;
  readonly fetcher?: Fetcher;
}): Promise<{ readonly lists: readonly BrevoList[]; readonly count: number }> {
  const params = new URLSearchParams({ limit: '50', offset: String(Math.max(0, args.offset ?? 0)), sort: 'desc' });
  const raw = z.object({ lists: z.array(listSchema), count: z.number().int().nonnegative() })
    .parse(await brevoGet(`/contacts/lists?${params}`, args.accessToken, args.fetcher ?? fetch));
  return {
    lists: raw.lists.map((list) => ({
      id: String(list.id), name: list.name,
      contactCount: list.uniqueSubscribers ?? list.totalSubscribers ?? null,
    })),
    count: raw.count,
  };
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com',
]);

function textAttribute(attributes: Record<string, unknown>, names: readonly string[]): string | null {
  const normalized = new Map(Object.entries(attributes).map(([key, value]) => [key.toUpperCase(), value]));
  for (const name of names) {
    const value = normalized.get(name);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function canonicalDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const host = new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

function toCandidate(raw: z.infer<typeof contactSchema>, selectedListId: string, now: string): BrevoContactCandidate {
  const email = raw.email?.trim().toLowerCase() || null;
  const explicitDomain = canonicalDomain(textAttribute(raw.attributes, ['WEBSITE', 'DOMAIN', 'COMPANY_WEBSITE', 'URL']));
  const emailDomain = email?.split('@')[1] ?? null;
  const domain = explicitDomain ?? (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain) ? canonicalDomain(emailDomain) : null);
  const company = textAttribute(raw.attributes, ['COMPANY', 'COMPANY_NAME', 'ORGANIZATION', 'ORGANISATION']);
  const firstName = textAttribute(raw.attributes, ['FIRSTNAME', 'FNAME', 'FIRST_NAME']);
  const listIds = raw.listIds.map(String);
  const unsubscribed = raw.listUnsubscribed.map(String).includes(selectedListId) || raw.listUnsubscribed.length > 0;
  const suppressionState: ContactProjection['suppressionState'] = unsubscribed
    ? 'unsubscribed'
    : raw.emailBlacklisted ? 'suppressed' : 'eligible';
  const selectionBlockReason = suppressionState !== 'eligible' ? 'Unsubscribed or blocked in Brevo'
    : !email ? 'Email is missing'
    : !company ? 'Company name is missing'
    : !domain ? 'Company website is missing'
    : null;
  return {
    providerContactId: String(raw.id), firstName, companyName: company,
    canonicalDomain: domain, email, listIds, suppressionState,
    observedAt: raw.modifiedAt ?? raw.createdAt ?? now, selectionBlockReason,
  };
}

export async function listBrevoContacts(args: {
  readonly accessToken: string;
  readonly listId: string;
  readonly offset?: number;
  readonly fetcher?: Fetcher;
  readonly now?: string;
}): Promise<{ readonly contacts: readonly BrevoContactCandidate[]; readonly count: number }> {
  const offset = Math.max(0, args.offset ?? 0);
  const params = new URLSearchParams({ limit: '50', offset: String(offset), sort: 'desc' });
  const raw = z.object({ contacts: z.array(contactSchema), count: z.number().int().nonnegative() })
    .parse(await brevoGet(`/contacts/lists/${encodeURIComponent(args.listId)}/contacts?${params}`, args.accessToken, args.fetcher ?? fetch));
  const now = args.now ?? new Date().toISOString();
  return { contacts: raw.contacts.map((contact) => toCandidate(contact, args.listId, now)), count: raw.count };
}

export function toContactProjection(args: {
  readonly accountId: string;
  readonly agencyAccountId: string;
  readonly candidate: BrevoContactCandidate;
}): ContactProjection {
  const candidate = args.candidate;
  if (candidate.selectionBlockReason || !candidate.companyName || !candidate.canonicalDomain || !candidate.email) {
    throw new Error('brevo_contact_not_selectable');
  }
  return contactProjectionSchema.parse({
    contractVersion: 'crm-contact-projection-v1',
    accountId: args.accountId,
    tenant: { type: 'agency_account', id: args.agencyAccountId },
    provider: 'brevo', providerContactId: candidate.providerContactId,
    firstName: candidate.firstName, companyName: candidate.companyName,
    canonicalDomain: candidate.canonicalDomain, email: candidate.email,
    listIds: [...candidate.listIds], suppressionState: candidate.suppressionState,
    sourceVersion: BREVO_SOURCE_VERSION, observedAt: candidate.observedAt,
  });
}
