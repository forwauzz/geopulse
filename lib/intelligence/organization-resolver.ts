import { z } from 'zod';
import { normalizeDomainIdentity } from './identity';
import {
  organizationContextContentHash,
  organizationMarketScopeSchema,
  type OrganizationContext,
} from './organization-context';

export const ORGANIZATION_RESOLVER_VERSION = 'organization-resolver-v1';
export const ORGANIZATION_GEOGRAPHIC_POLICY_VERSION = 'organization-geography-v1';

export type ResolverStatus = 'proposed' | 'needs_review' | 'conflicted';
export type ResolverReason =
  | 'requested_identity_invalid'
  | 'final_identity_invalid'
  | 'redirect_unverified'
  | 'canonical_domain_conflict'
  | 'country_missing'
  | 'country_conflict'
  | 'location_missing'
  | 'language_missing'
  | 'market_scope_missing'
  | 'category_missing'
  | 'category_conflict'
  | 'name_collision'
  | 'enrichment_evidence_missing'
  | 'competitor_identity_invalid'
  | 'competitor_market_conflict';

export type ResolverEvidence = {
  readonly evidenceId: string;
  readonly sourceUrl: string;
  readonly kind: 'redirect' | 'canonical' | 'schema_org' | 'html_contact' | 'html_language' | 'hreflang' | 'page_text';
  readonly fields: readonly string[];
  readonly confidence: number;
  readonly observedAt: string;
};

export type ResolverMarket = {
  readonly scope: z.infer<typeof organizationMarketScopeSchema> | null;
  readonly countryCode: string | null;
  readonly subdivisionCode: string | null;
  readonly locality: string | null;
  readonly serviceAreas: readonly string[];
  readonly languages: readonly string[];
  readonly timezone: string | null;
};

export type ExactDomainResolution = {
  readonly resolverVersion: typeof ORGANIZATION_RESOLVER_VERSION;
  readonly geographicPolicyVersion: typeof ORGANIZATION_GEOGRAPHIC_POLICY_VERSION;
  readonly resolvedAt: string;
  readonly status: ResolverStatus;
  readonly reasonCodes: readonly ResolverReason[];
  readonly identity: {
    readonly requestedDomain: string;
    readonly canonicalDomain: string;
    readonly approvedAliases: readonly string[];
    readonly redirectChain: readonly string[];
  };
  readonly organization: {
    readonly displayName: string | null;
    readonly category: string | null;
    readonly services: readonly string[];
    readonly buyer: string | null;
    readonly publicEmail: string | null;
    readonly publicTelephone: string | null;
  };
  readonly markets: readonly ResolverMarket[];
  readonly evidence: readonly ResolverEvidence[];
  readonly confidence: number;
  readonly limitations: readonly string[];
};

export type ExactDomainDocument = {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly redirectChain: readonly string[];
  readonly approvedAliasHosts?: readonly string[];
  readonly title: string | null;
  readonly siteName?: string | null;
  readonly canonicalHref: string | null;
  readonly jsonLdTypes: readonly string[];
  readonly jsonLdBlocks: readonly unknown[];
  readonly htmlLang: string | null;
  readonly hreflangEntries: readonly { lang: string; href: string }[];
  readonly textSample: string;
  readonly publicEmail?: string | null;
  readonly publicTelephone?: string | null;
  readonly supportingPages?: readonly {
    readonly url: string;
    readonly title: string | null;
    readonly jsonLdTypes: readonly string[];
    readonly jsonLdBlocks: readonly unknown[];
    readonly htmlLang: string | null;
    readonly hreflangEntries: readonly { lang: string; href: string }[];
    readonly textSample: string;
    readonly publicEmail?: string | null;
    readonly publicTelephone?: string | null;
  }[];
  readonly serviceLabels?: readonly string[];
  readonly observedAt: string;
};

type Address = {
  locality: string | null;
  region: string | null;
  countryCode: string | null;
};

const COUNTRY_CODES: Readonly<Record<string, string>> = {
  ca: 'CA', canada: 'CA', us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
  gb: 'GB', uk: 'GB', 'united kingdom': 'GB', england: 'GB', fr: 'FR', france: 'FR',
  de: 'DE', germany: 'DE', es: 'ES', spain: 'ES', it: 'IT', italy: 'IT',
};

const REGION_CODES: Readonly<Record<string, string>> = {
  qc: 'CA-QC', quebec: 'CA-QC', ontario: 'CA-ON', on: 'CA-ON', bc: 'CA-BC', 'british columbia': 'CA-BC',
  alberta: 'CA-AB', ab: 'CA-AB', california: 'US-CA', ca: 'US-CA', texas: 'US-TX', tx: 'US-TX',
  'new york': 'US-NY', ny: 'US-NY', florida: 'US-FL', fl: 'US-FL',
};

const LANGUAGE_TAGS: Readonly<Record<string, string>> = {
  en: 'en', english: 'en', fr: 'fr', french: 'fr', français: 'fr', de: 'de', german: 'de',
  es: 'es', spanish: 'es', español: 'es', it: 'it', italian: 'it',
};

const ORGANIZATION_TYPES = new Set([
  'organization', 'localbusiness', 'medicalbusiness', 'medicalclinic', 'physician', 'hospital',
  'professionalservice', 'corporation', 'softwareapplication', 'onlinebusiness', 'service',
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(strings))].sort();
  const item = clean(value);
  return item ? [item] : [];
}

function schemaTypes(node: Record<string, unknown>): string[] {
  return strings(node['@type']).map((value) => value.toLowerCase().replace(/[^a-z]/g, ''));
}

function flattenSchemaNodes(values: readonly unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || !value) return;
    if (Array.isArray(value)) {
      value.slice(0, 24).forEach((item) => visit(item, depth + 1));
      return;
    }
    const node = record(value);
    if (Object.keys(node).length === 0) return;
    out.push(node);
    visit(node['@graph'], depth + 1);
  };
  values.slice(0, 24).forEach((value) => visit(value, 0));
  return out;
}

function domain(value: string): string | null {
  const normalized = normalizeDomainIdentity(value);
  return normalized.ok ? normalized.value.normalizedHost : null;
}

function emailDomain(value: string | null): string | null {
  const match = value?.toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return match?.[1] ? domain(match[1]) : null;
}

function evidence(args: Omit<ResolverEvidence, 'evidenceId'>): ResolverEvidence {
  return { ...args, evidenceId: `ore:${organizationContextContentHash(args).slice('fnv1a32:'.length)}` };
}

function countryCode(value: unknown): string | null {
  const raw = clean(record(value)['name'] ?? value)?.toLowerCase();
  if (!raw) return null;
  if (/^[a-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_CODES[raw] ?? null;
}

function subdivisionCode(value: unknown, country: string | null): string | null {
  const raw = clean(value);
  if (!raw) return null;
  if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(raw.toUpperCase())) return raw.toUpperCase();
  const mapped = REGION_CODES[raw.toLowerCase()] ?? null;
  return mapped?.startsWith(`${country ?? ''}-`) ? mapped : null;
}

function languageTag(value: string, country: string | null): string | null {
  const raw = value.trim().replace('_', '-');
  if (!raw || raw.toLowerCase() === 'x-default') return null;
  const pieces = raw.split('-');
  const base = LANGUAGE_TAGS[pieces[0]!.toLowerCase()] ?? pieces[0]!.toLowerCase();
  if (!/^[a-z]{2,3}$/.test(base)) return null;
  const region = pieces[1]?.toUpperCase() ?? country;
  return region && /^[A-Z]{2}$/.test(region) ? `${base}-${region}` : base;
}

function marketLanguages(values: readonly string[], country: string | null): { languages: string[]; normalized: boolean } {
  if (!country) return { languages: [...new Set(values)].sort(), normalized: false };
  const byBase = new Map<string, string[]>();
  for (const value of values) {
    const base = value.split('-')[0]!;
    byBase.set(base, [...(byBase.get(base) ?? []), value]);
  }
  let normalized = false;
  const languages = [...byBase].map(([base, variants]) => {
    const marketVariant = `${base}-${country}`;
    if (variants.includes(marketVariant)) {
      if (variants.some((variant) => variant !== marketVariant && variant.includes('-'))) normalized = true;
      return marketVariant;
    }
    if (variants.some((variant) => variant.includes('-'))) normalized = true;
    return marketVariant;
  });
  return { languages: languages.sort(), normalized };
}

function addressFrom(value: unknown): Address | null {
  const item = record(value);
  const locality = clean(item['addressLocality']);
  const region = clean(item['addressRegion']);
  const country = countryCode(item['addressCountry']);
  if (!locality && !region && !country) return null;
  return { locality, region, countryCode: country };
}

function addressesFrom(nodes: readonly Record<string, unknown>[]): Address[] {
  const found = nodes.flatMap((node) => {
    const values = Array.isArray(node['address']) ? node['address'] : [node['address']];
    return values.flatMap((value) => {
      const parsed = addressFrom(value);
      return parsed ? [parsed] : [];
    });
  });
  const seen = new Set<string>();
  return found.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addressesFromText(text: string): Address[] {
  const out: Address[] = [];
  const canadian = /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,60}),\s*(QC|ON|BC|AB|MB|NB|NL|NS|NT|NU|PE|SK|YT)\s+[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/gi;
  let match: RegExpExecArray | null;
  while ((match = canadian.exec(text)) !== null) {
    out.push({ locality: match[1]?.trim() ?? null, region: match[2]?.toUpperCase() ?? null, countryCode: 'CA' });
  }
  const american = /\b([A-Za-z][A-Za-z .'-]{1,60}),\s*(CA|TX|NY|FL)\s+\d{5}(?:-\d{4})?\b/gi;
  while ((match = american.exec(text)) !== null) {
    out.push({ locality: match[1]?.trim() ?? null, region: match[2]?.toUpperCase() ?? null, countryCode: 'US' });
  }
  return out;
}

function areaServedFrom(nodes: readonly Record<string, unknown>[]): string[] {
  return [...new Set(nodes.flatMap((node) => {
    const values = Array.isArray(node['areaServed']) ? node['areaServed'] : [node['areaServed']];
    return values.flatMap((value) => {
      const item = record(value);
      return strings(item['name'] ?? value);
    });
  }))].sort();
}

function servicesFrom(nodes: readonly Record<string, unknown>[]): string[] {
  const services = nodes.flatMap((node) => [
    ...strings(node['serviceType']),
    ...strings(record(node['makesOffer'])['name']),
    ...strings(record(node['hasOfferCatalog'])['name']),
  ]);
  return [...new Set(services)].sort().slice(0, 12);
}

function inferredCategory(nodes: readonly Record<string, unknown>[], types: readonly string[]): string | null {
  const selected = nodes.find((node) => schemaTypes(node).some((type) => ORGANIZATION_TYPES.has(type)));
  const additional = clean(selected?.['additionalType']);
  if (additional) return additional;
  return types.find((type) => !['organization', 'localbusiness', 'webpage', 'website'].includes(type.toLowerCase())) ?? null;
}

function categoryFromText(text: string): string | null {
  const value = text.toLowerCase();
  const policies: readonly [string, readonly string[]][] = [
    ['private medical clinic', ['private medical clinic', 'clinique médicale privée', 'clinique privee', 'médecine privée']],
    ['medical clinic', ['medical clinic', 'clinique médicale', 'soins médicaux']],
    ['managed IT services', ['managed it', 'managed service provider', 'it support', 'cybersecurity services']],
    ['law firm', ['law firm', 'cabinet juridique', 'legal services']],
    ['software company', ['software platform', 'saas platform', 'logiciel en ligne']],
  ];
  return policies.find(([, phrases]) => phrases.some((phrase) => value.includes(phrase)))?.[0] ?? null;
}

function displayNameFromTitle(title: string | null): string | null {
  const segments = (title ?? '').split(/[|–—]/).map((value) => value.trim()).filter(Boolean);
  return segments.sort((left, right) => left.length - right.length || left.localeCompare(right))[0] ?? null;
}

export function supportingPageUrls(html: string, finalUrl: string, limit = 3): string[] {
  const finalHost = domain(finalUrl);
  if (!finalHost) return [];
  const candidates = new Map<string, number>();
  const hrefs = html.matchAll(/href=["']([^"'#]+)["']/gi);
  for (const match of hrefs) {
    try {
      const url = new URL(match[1]!, finalUrl);
      if (domain(url.toString()) !== finalHost) continue;
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const priority = /\/(contact|locations?|nous-joindre)$/i.test(path) ? 0
        : /\/(about|about-us|a-propos|qui-sommes-nous)$/i.test(path) ? 1
          : /\/(services?|departments?|departements?)$/i.test(path) ? 2 : null;
      if (priority === null) continue;
      url.hash = '';
      url.search = '';
      candidates.set(url.toString(), Math.min(candidates.get(url.toString()) ?? 99, priority));
    } catch {
      // Ignore malformed links; the network layer still revalidates selected URLs.
    }
  }
  return [...candidates].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([url]) => url);
}

export function serviceLabelsFromHtml(html: string, finalUrl: string): string[] {
  const finalHost = domain(finalUrl);
  if (!finalHost) return [];
  const values: string[] = [];
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1]!, finalUrl);
      if (domain(url.toString()) !== finalHost || !/\/services?\//i.test(url.pathname)) continue;
      const slug = url.pathname.split('/').filter(Boolean).at(-1);
      if (!slug || /^(services?|departments?|departements?)$/i.test(slug)) continue;
      values.push(slug.replace(/[-_]+/g, ' ').trim());
    } catch {
      // Ignore malformed service links.
    }
  }
  return [...new Set(values)].sort().slice(0, 12);
}

function timezoneFor(country: string | null, subdivision: string | null): string | null {
  if (subdivision === 'CA-QC' || subdivision === 'CA-ON' || subdivision === 'US-NY' || subdivision === 'US-FL') return 'America/Toronto';
  if (subdivision === 'CA-BC') return 'America/Vancouver';
  if (subdivision === 'CA-AB') return 'America/Edmonton';
  if (subdivision === 'US-CA') return 'America/Los_Angeles';
  if (subdivision === 'US-TX') return 'America/Chicago';
  if (country === 'GB') return 'Europe/London';
  if (country === 'FR' || country === 'DE' || country === 'ES' || country === 'IT') return 'Europe/Paris';
  return null;
}

function marketScope(areas: readonly string[], addressCount: number): z.infer<typeof organizationMarketScopeSchema> | null {
  const normalized = areas.map((area) => area.toLowerCase());
  if (normalized.some((area) => /\b(online|remote-only|digital-only)\b/.test(area))) return 'online';
  if (normalized.some((area) => /\b(worldwide|global)\b/.test(area))) return 'global';
  const countryAreas = new Set(['canada', 'united states', 'usa', 'united kingdom', 'uk', 'france', 'germany', 'spain', 'italy']);
  if (normalized.some((area) => countryAreas.has(area))) return 'national';
  if (addressCount > 1 || areas.length > 0) return 'regional';
  if (addressCount === 1) return 'local';
  return null;
}

export function resolveExactDomain(document: ExactDomainDocument): ExactDomainResolution | { readonly error: ResolverReason } {
  const requestedDomain = domain(document.requestedUrl);
  if (!requestedDomain) return { error: 'requested_identity_invalid' };
  const finalDomain = domain(document.finalUrl);
  if (!finalDomain) return { error: 'final_identity_invalid' };
  const aliases = [...new Set((document.approvedAliasHosts ?? []).flatMap((host) => domain(host) ? [domain(host)!] : []))].sort();
  const reasons = new Set<ResolverReason>();
  const limitations = new Set<string>();
  const evidenceRows: ResolverEvidence[] = [];

  if (requestedDomain !== finalDomain) {
    evidenceRows.push(evidence({ sourceUrl: document.finalUrl, kind: 'redirect', fields: ['canonical_domain'], confidence: 0.95, observedAt: document.observedAt }));
    if (!aliases.includes(requestedDomain) && !aliases.includes(finalDomain)) reasons.add('redirect_unverified');
  }

  let canonicalDomain: string | null = finalDomain;
  if (document.canonicalHref) {
    try {
      canonicalDomain = domain(new URL(document.canonicalHref, document.finalUrl).toString());
    } catch {
      canonicalDomain = null;
    }
  }
  if (!canonicalDomain || (canonicalDomain !== finalDomain && !aliases.includes(canonicalDomain))) reasons.add('canonical_domain_conflict');
  if (document.canonicalHref) {
    evidenceRows.push(evidence({ sourceUrl: document.finalUrl, kind: 'canonical', fields: ['canonical_domain'], confidence: 0.95, observedAt: document.observedAt }));
  }

  const siteDocuments = [{
    url: document.finalUrl,
    title: document.title,
    jsonLdTypes: document.jsonLdTypes,
    jsonLdBlocks: document.jsonLdBlocks,
    htmlLang: document.htmlLang,
    hreflangEntries: document.hreflangEntries,
    textSample: document.textSample,
    publicEmail: document.publicEmail,
    publicTelephone: document.publicTelephone,
  }, ...(document.supportingPages ?? [])];
  const nodes = flattenSchemaNodes(siteDocuments.flatMap((page) => page.jsonLdBlocks));
  const organizationNodes = nodes.filter((node) => schemaTypes(node).some((type) => ORGANIZATION_TYPES.has(type)));
  const primary = organizationNodes[0] ?? nodes[0] ?? {};
  const addresses = [...addressesFrom(organizationNodes.length > 0 ? organizationNodes : nodes), ...siteDocuments.flatMap((page) => addressesFromText(page.textSample))];
  const uniqueAddresses = addresses.filter((address, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(address)) === index);
  const countries = [...new Set(uniqueAddresses.flatMap((address) => address.countryCode ? [address.countryCode] : []))];
  const areas = areaServedFrom(organizationNodes.length > 0 ? organizationNodes : nodes);
  const scope = marketScope(areas, uniqueAddresses.length);
  const country = countries[0] ?? null;
  const detectedLanguages = [...new Set([
    ...siteDocuments.flatMap((page) => page.htmlLang ? [languageTag(page.htmlLang, country)] : []),
    ...siteDocuments.flatMap((page) => page.hreflangEntries.map((entry) => languageTag(entry.lang, country))),
    ...organizationNodes.flatMap((node) => strings(node['inLanguage'] ?? node['knowsLanguage']).map((lang) => languageTag(lang, country))),
  ].filter((value): value is string => Boolean(value)))].sort();
  const normalizedLanguages = marketLanguages(
    detectedLanguages,
    scope === 'local' || scope === 'regional' || scope === 'national' ? country : null,
  );
  const languages = normalizedLanguages.languages;
  const allText = siteDocuments.map((page) => page.textSample).join(' ');
  const category = inferredCategory(primary ? [primary] : [], siteDocuments.flatMap((page) => page.jsonLdTypes)) ?? categoryFromText(allText);
  const services = [...new Set([...servicesFrom(organizationNodes), ...(document.serviceLabels ?? [])])].sort().slice(0, 12);
  const displayName = clean(primary['name']) ?? clean(document.siteName) ?? displayNameFromTitle(document.title);
  const buyer = clean(primary['audience'] && record(primary['audience'])['name']);
  const schemaEmail = clean(primary['email']);
  const schemaTelephone = clean(primary['telephone']);
  const publicEmail = schemaEmail ?? siteDocuments.map((page) => clean(page.publicEmail)).find(Boolean) ?? null;
  const publicTelephone = schemaTelephone ?? siteDocuments.map((page) => clean(page.publicTelephone)).find(Boolean) ?? null;
  const contactSourceUrl = schemaEmail || schemaTelephone
    ? document.finalUrl
    : siteDocuments.find((page) => clean(page.publicEmail) === publicEmail || clean(page.publicTelephone) === publicTelephone)?.url ?? document.finalUrl;
  const publicEmailDomain = emailDomain(publicEmail);

  if (organizationNodes.length > 0) {
    evidenceRows.push(evidence({ sourceUrl: document.finalUrl, kind: 'schema_org', fields: ['display_name', 'category', 'services', 'market'], confidence: 0.9, observedAt: document.observedAt }));
  }
  if (document.htmlLang) evidenceRows.push(evidence({ sourceUrl: document.finalUrl, kind: 'html_language', fields: ['languages'], confidence: 0.8, observedAt: document.observedAt }));
  if (document.hreflangEntries.length > 0) evidenceRows.push(evidence({ sourceUrl: document.finalUrl, kind: 'hreflang', fields: ['languages'], confidence: 0.85, observedAt: document.observedAt }));
  if (document.textSample.trim()) evidenceRows.push(evidence({ sourceUrl: document.finalUrl, kind: 'page_text', fields: ['category', 'services', 'buyer'], confidence: 0.6, observedAt: document.observedAt }));
  for (const page of document.supportingPages ?? []) {
    if (!page.textSample.trim()) continue;
    evidenceRows.push(evidence({
      sourceUrl: page.url,
      kind: 'page_text',
      fields: ['category', 'services', 'buyer', 'market', 'public_contacts'],
      confidence: 0.7,
      observedAt: document.observedAt,
    }));
  }
  if (publicEmail || publicTelephone) {
    evidenceRows.push(evidence({
      sourceUrl: contactSourceUrl,
      kind: schemaEmail || schemaTelephone ? 'schema_org' : 'html_contact',
      fields: ['public_contacts'], confidence: 0.8, observedAt: document.observedAt,
    }));
  }

  if (!category) reasons.add('category_missing');
  if (uniqueAddresses.length === 0) {
    reasons.add('location_missing');
    limitations.add('No structured physical address was found on the exact official page.');
  }
  if (!country) reasons.add('country_missing');
  if (countries.length > 1 && scope !== 'global') reasons.add('country_conflict');
  if (languages.length === 0) reasons.add('language_missing');
  if (!scope) reasons.add('market_scope_missing');
  if (uniqueAddresses.length > 1) limitations.add('Multiple locations require separate confirmed Market Contexts before measurement.');
  if (services.length === 0) limitations.add('No structured service list was found; service confirmation is required.');
  if (normalizedLanguages.normalized) {
    limitations.add('Language metadata used a different regional locale and was normalized to the detected market country for confirmation.');
  }
  if (publicEmailDomain && publicEmailDomain !== canonicalDomain && !aliases.includes(publicEmailDomain)) {
    limitations.add('The public email domain differs from the canonical website and is not treated as identity evidence.');
  }

  const markets: ResolverMarket[] = (uniqueAddresses.length > 0 ? uniqueAddresses : [{ locality: null, region: null, countryCode: country }]).map((address) => {
    const addressCountry = address.countryCode ?? country;
    const subdivision = subdivisionCode(address.region, addressCountry);
    return {
      scope,
      countryCode: addressCountry,
      subdivisionCode: subdivision,
      locality: address.locality,
      serviceAreas: areas,
      languages,
      timezone: timezoneFor(addressCountry, subdivision),
    };
  });
  const reasonCodes = [...reasons].sort();
  const conflictReasons: readonly ResolverReason[] = ['redirect_unverified', 'canonical_domain_conflict', 'country_conflict', 'category_conflict', 'name_collision'];
  const status: ResolverStatus = reasonCodes.some((reason) => conflictReasons.includes(reason))
    ? 'conflicted'
    : reasonCodes.length > 0 ? 'needs_review' : 'proposed';
  const confidence = Math.max(0, Math.min(1, 0.35
    + (organizationNodes.length > 0 ? 0.25 : 0)
    + (country ? 0.15 : 0)
    + (languages.length > 0 ? 0.1 : 0)
    + (scope ? 0.1 : 0)
    + (services.length > 0 ? 0.05 : 0)
    - (status === 'conflicted' ? 0.25 : 0)));
  return {
    resolverVersion: ORGANIZATION_RESOLVER_VERSION,
    geographicPolicyVersion: ORGANIZATION_GEOGRAPHIC_POLICY_VERSION,
    resolvedAt: new Date(document.observedAt).toISOString(),
    status,
    reasonCodes,
    identity: {
      requestedDomain,
      canonicalDomain: canonicalDomain ?? finalDomain,
      approvedAliases: aliases,
      redirectChain: [...document.redirectChain],
    },
    organization: { displayName, category, services, buyer, publicEmail, publicTelephone },
    markets,
    evidence: evidenceRows.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    confidence,
    limitations: [...limitations].sort(),
  };
}

function comparable(value: string | null): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Preserve an existing confirmed context when new exact-site evidence points at another entity or market. */
export function guardConfirmedOrganizationContext(
  resolution: ExactDomainResolution,
  confirmed: Pick<OrganizationContext, 'organization' | 'market' | 'status'>,
): ExactDomainResolution {
  if (confirmed.status !== 'confirmed') return resolution;
  const allowedDomains = new Set([
    confirmed.organization.canonicalDomain,
    ...confirmed.organization.aliases.map((alias) => alias.host),
  ].map((host) => domain(host)).filter((host): host is string => Boolean(host)));
  const reasons = new Set(resolution.reasonCodes);
  if (!allowedDomains.has(resolution.identity.canonicalDomain)) {
    reasons.add('canonical_domain_conflict');
    if (comparable(resolution.organization.displayName) === comparable(confirmed.organization.displayName)) {
      reasons.add('name_collision');
    }
  }
  const countries = new Set(resolution.markets.flatMap((market) => market.countryCode ? [market.countryCode] : []));
  if (countries.size > 0 && !countries.has(confirmed.market.countryCode)) reasons.add('country_conflict');
  if (resolution.organization.category && confirmed.organization.category
    && comparable(resolution.organization.category) !== comparable(confirmed.organization.category)) {
    reasons.add('category_conflict');
  }
  if (reasons.size === resolution.reasonCodes.length) return resolution;
  return { ...resolution, status: 'conflicted', reasonCodes: [...reasons].sort() };
}

export function buildOrganizationEnrichmentPrompt(resolution: ExactDomainResolution): string {
  const exactEvidence = resolution.evidence.map((item) => ({
    evidenceId: item.evidenceId, sourceUrl: item.sourceUrl, fields: item.fields, confidence: item.confidence,
  }));
  return [
    'Use the exact official-site evidence below as the identity anchor. Search/model results may suggest additions but must never replace it silently.',
    JSON.stringify({
      canonicalDomain: resolution.identity.canonicalDomain,
      organization: resolution.organization,
      markets: resolution.markets,
      exactEvidence,
    }),
    'Return only JSON: {"context": {"canonicalDomain":"...","displayName":"...","category":"...","services":[],"buyer":"...","countryCode":"XX","evidenceIds":[],"confidence":0.0},"competitors":[{"name":"...","url":"https://...","countryCodes":["XX"],"evidenceIds":[],"confidence":0.0,"reason":"..."}]}',
  ].join('\n');
}

const enrichmentSchema = z.object({
  context: z.object({
    canonicalDomain: z.string().min(1), displayName: z.string().min(1).max(160),
    category: z.string().min(1).max(160), services: z.array(z.string().min(1).max(160)).max(16),
    buyer: z.string().min(1).max(240).nullable(), countryCode: z.string().regex(/^[A-Z]{2}$/),
    evidenceIds: z.array(z.string().min(1)).min(1), confidence: z.number().min(0).max(1),
  }),
  competitors: z.array(z.object({
    name: z.string().min(1).max(160), url: z.string().url(), countryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    evidenceIds: z.array(z.string().min(1)).min(1), confidence: z.number().min(0).max(1), reason: z.string().min(1).max(300),
  })).max(8),
});

export type ValidatedEnrichment = {
  readonly resolverVersion: typeof ORGANIZATION_RESOLVER_VERSION;
  readonly validatedAt: string;
  readonly status: 'accepted' | 'needs_review' | 'invalid';
  readonly reasonCodes: readonly ResolverReason[];
  readonly context: z.infer<typeof enrichmentSchema>['context'] | null;
  readonly competitors: readonly (z.infer<typeof enrichmentSchema>['competitors'][number] & { readonly domain: string })[];
  readonly evidenceIds: readonly string[];
  readonly confidence: number;
  readonly limitations: readonly string[];
};

function enrichmentResult(
  exact: ExactDomainResolution,
  result: Omit<ValidatedEnrichment, 'resolverVersion' | 'validatedAt' | 'evidenceIds' | 'confidence' | 'limitations'>,
): ValidatedEnrichment {
  const evidenceIds = [...new Set([
    ...(result.context?.evidenceIds ?? []),
    ...result.competitors.flatMap((candidate) => candidate.evidenceIds),
  ])].sort();
  const confidences = [
    ...(result.context ? [result.context.confidence] : []),
    ...result.competitors.map((candidate) => candidate.confidence),
  ];
  return {
    resolverVersion: ORGANIZATION_RESOLVER_VERSION,
    validatedAt: exact.resolvedAt,
    ...result,
    evidenceIds,
    confidence: confidences.length > 0 ? Math.min(...confidences) : 0,
    limitations: result.reasonCodes.map((reason) => `Suggestion requires review: ${reason}.`),
  };
}

export function parseOrganizationEnrichment(
  raw: string,
  exact: ExactDomainResolution,
  additionalEvidenceIds: readonly string[] = [],
): ValidatedEnrichment {
  let json: unknown;
  try {
    const cleanJson = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    json = JSON.parse(cleanJson.slice(cleanJson.indexOf('{'), cleanJson.lastIndexOf('}') + 1));
  } catch {
    return enrichmentResult(exact, { status: 'invalid', reasonCodes: ['enrichment_evidence_missing'], context: null, competitors: [] });
  }
  const parsed = enrichmentSchema.safeParse(json);
  if (!parsed.success) {
    return enrichmentResult(exact, { status: 'invalid', reasonCodes: ['enrichment_evidence_missing'], context: null, competitors: [] });
  }
  const allowedEvidence = new Set([...exact.evidence.map((item) => item.evidenceId), ...additionalEvidenceIds]);
  const reasons = new Set<ResolverReason>();
  const contextEvidenceValid = parsed.data.context.evidenceIds.every((id) => allowedEvidence.has(id));
  if (!contextEvidenceValid) reasons.add('enrichment_evidence_missing');
  const proposedDomain = domain(parsed.data.context.canonicalDomain);
  if (!proposedDomain || (proposedDomain !== exact.identity.canonicalDomain && !exact.identity.approvedAliases.includes(proposedDomain))) {
    reasons.add('canonical_domain_conflict');
  }
  const exactCountries = new Set(exact.markets.flatMap((market) => market.countryCode ? [market.countryCode] : []));
  if (exactCountries.size > 0 && !exactCountries.has(parsed.data.context.countryCode)) reasons.add('country_conflict');
  if (exact.organization.category && comparable(exact.organization.category) !== comparable(parsed.data.context.category)) {
    reasons.add('category_conflict');
  }
  const competitors = parsed.data.competitors.flatMap((candidate) => {
    const candidateDomain = domain(candidate.url);
    if (!candidateDomain || candidateDomain === exact.identity.canonicalDomain || exact.identity.approvedAliases.includes(candidateDomain)) {
      reasons.add('competitor_identity_invalid');
      return [];
    }
    if (!candidate.evidenceIds.every((id) => allowedEvidence.has(id))) {
      reasons.add('enrichment_evidence_missing');
      return [];
    }
    const scope = exact.markets[0]?.scope;
    if ((scope === 'local' || scope === 'regional') && exactCountries.size > 0
      && !candidate.countryCodes.some((code) => exactCountries.has(code))) {
      reasons.add('competitor_market_conflict');
      return [];
    }
    if (exact.organization.displayName && candidate.name.trim().toLowerCase() === exact.organization.displayName.trim().toLowerCase()) {
      reasons.add('name_collision');
      return [];
    }
    return [{ ...candidate, domain: candidateDomain }];
  });
  return enrichmentResult(exact, {
    status: reasons.size > 0 ? 'needs_review' : 'accepted',
    reasonCodes: [...reasons].sort(),
    context: contextEvidenceValid ? parsed.data.context : null,
    competitors,
  });
}
