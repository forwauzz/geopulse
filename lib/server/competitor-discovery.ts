/**
 * Local competitor auto-discovery (OSS-REFACTOR-PLAN.md "Loop 4").
 *
 * Pipeline: detect (business type + city from the scanned page) → confirm (user edits)
 * → discover (local competitors). This module is the pure, network-free core:
 *   - `detectBusinessProfile()` — deterministic heuristic detection (no LLM, no billing).
 *   - `resolveDiscoveryMode()` — 'mock' by default; 'gemini' only when explicitly enabled.
 *   - `mockCompetitors()` — deterministic, clearly-labelled sample competitors so the full
 *     detect→confirm→discover→compare UI ships and demos end-to-end with NO Gemini cost.
 *   - `buildDiscoveryPrompt()` / `parseDiscoveryResponse()` — the live Google-Search-grounded
 *     path, dormant until Gemini billing is enabled (the only remaining blocker).
 *
 * The network side (the live Gemini `google_search` call) lives in
 * `competitor-discovery-gemini.ts` so this file stays unit-testable.
 */
import { z } from 'zod';

export type DetectionSource = 'schema_org' | 'heuristic' | 'unknown';
export type DiscoveryMode = 'mock' | 'gemini';

export type BusinessProfile = {
  /** Human-readable industry, e.g. "law firm", "dental practice", "IT services". '' when unknown. */
  businessType: string;
  /** City / locality if detectable, else null (the confirm step lets the user supply it). */
  city: string | null;
  /** State / province / region if detectable, else null. */
  region: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: DetectionSource;
};

export type CompetitorSampleSummary = {
  score: number;
  letterGrade: string;
  categoryScores: { category: string; score: number; letterGrade: string; checkCount: number }[];
};

export type CompetitorCandidate = {
  name: string;
  url: string;
  domain: string;
  reason?: string;
  /** Present ONLY in mock mode — a deterministic, clearly-labelled sample score. */
  sample?: CompetitorSampleSummary;
};

// ── Detection: schema.org @type → readable industry label ──────────────────────
// Keys are lowercased schema.org type names (see workers/scan-engine/parse-signals.ts
// `jsonLdTypes`). A LocalBusiness subtype is the strongest possible signal.
const SCHEMA_TYPE_LABELS: Record<string, string> = {
  dentist: 'dental practice',
  physician: 'medical practice',
  medicalclinic: 'medical clinic',
  medicalbusiness: 'healthcare provider',
  hospital: 'healthcare provider',
  optician: 'optometry practice',
  attorney: 'law firm',
  legalservice: 'law firm',
  lawfirm: 'law firm',
  accountingservice: 'accounting firm',
  financialservice: 'financial services firm',
  insuranceagency: 'insurance agency',
  realestateagent: 'real estate agency',
  realestateagency: 'real estate agency',
  restaurant: 'restaurant',
  cafeorcoffeeshop: 'cafe',
  bakery: 'bakery',
  bar: 'bar',
  hairsalon: 'hair salon',
  beautysalon: 'beauty salon',
  dayspa: 'spa',
  spa: 'spa',
  healthclub: 'fitness studio',
  gym: 'gym',
  autorepair: 'auto repair shop',
  automotivebusiness: 'automotive business',
  plumber: 'plumbing company',
  electrician: 'electrical contractor',
  hvacbusiness: 'HVAC company',
  roofingcontractor: 'roofing contractor',
  generalcontractor: 'general contractor',
  homeandconstructionbusiness: 'home services company',
  movingcompany: 'moving company',
  cleaningservice: 'cleaning service',
  veterinarycare: 'veterinary clinic',
  childcare: 'childcare center',
  school: 'school',
  store: 'retail store',
  clothingstore: 'clothing store',
  furniturestore: 'furniture store',
  jewelrystore: 'jewelry store',
  petstore: 'pet store',
  florist: 'florist',
  travelagency: 'travel agency',
  lodgingbusiness: 'hotel',
  hotel: 'hotel',
  professionalservice: 'professional services firm',
  localbusiness: 'local business',
};

// Heuristic keyword → industry fallback when there's no useful schema type.
const KEYWORD_INDUSTRIES: { type: string; keywords: string[] }[] = [
  { type: 'IT services', keywords: ['managed it', 'msp', 'it support', 'helpdesk', 'help desk', 'cybersecurity', 'network security', 'cloud services', 'managed services'] },
  { type: 'law firm', keywords: ['law firm', 'attorney', 'lawyer', 'legal services', 'litigation', 'counsel at law', 'personal injury'] },
  { type: 'dental practice', keywords: ['dentist', 'dental', 'orthodontic', 'teeth whitening', 'dental implants'] },
  { type: 'medical practice', keywords: ['clinic', 'physician', 'family medicine', 'urgent care', 'primary care'] },
  { type: 'accounting firm', keywords: ['accounting', 'bookkeeping', 'cpa', 'tax preparation', 'payroll services'] },
  { type: 'real estate agency', keywords: ['real estate', 'realtor', 'homes for sale', 'listings', 'property management'] },
  { type: 'restaurant', keywords: ['restaurant', 'menu', 'reservations', 'dine-in', 'takeout', 'catering'] },
  { type: 'marketing agency', keywords: ['marketing agency', 'seo services', 'digital marketing', 'branding agency', 'ad campaigns'] },
  { type: 'plumbing company', keywords: ['plumbing', 'plumber', 'drain cleaning', 'water heater'] },
  { type: 'HVAC company', keywords: ['hvac', 'air conditioning', 'furnace repair', 'heating and cooling'] },
  { type: 'roofing contractor', keywords: ['roofing', 'roof repair', 'roof replacement', 'shingles'] },
  { type: 'auto repair shop', keywords: ['auto repair', 'mechanic', 'oil change', 'brake service', 'tire'] },
  { type: 'fitness studio', keywords: ['gym', 'personal training', 'fitness', 'yoga studio', 'crossfit'] },
  { type: 'salon', keywords: ['salon', 'haircut', 'hair color', 'barber', 'nail salon'] },
  { type: 'landscaping company', keywords: ['landscaping', 'lawn care', 'lawn maintenance', 'hardscaping'] },
  { type: 'veterinary clinic', keywords: ['veterinary', 'veterinarian', 'animal hospital', 'pet care'] },
  { type: 'construction company', keywords: ['construction', 'general contractor', 'remodeling', 'home builder'] },
  { type: 'software company', keywords: ['saas', 'software platform', 'api', 'developers', 'app for'] },
];

function normalizeSchemaType(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** Map any of the page's JSON-LD @type strings to a readable industry, best signal first. */
export function labelFromSchemaTypes(jsonLdTypes: readonly string[]): string | null {
  for (const t of jsonLdTypes) {
    const label = SCHEMA_TYPE_LABELS[normalizeSchemaType(t)];
    if (label && label !== 'local business') return label;
  }
  // Only fall back to the generic label if that's genuinely all we have.
  for (const t of jsonLdTypes) {
    if (normalizeSchemaType(t) === 'localbusiness') return 'local business';
  }
  return null;
}

/** Score industry keywords over the page text; returns the best match or null. */
export function detectBusinessTypeFromText(text: string): string | null {
  const hay = text.toLowerCase();
  let best: { type: string; score: number } | null = null;
  for (const { type, keywords } of KEYWORD_INDUSTRIES) {
    let score = 0;
    for (const kw of keywords) {
      if (hay.includes(kw)) score += kw.includes(' ') ? 2 : 1; // multi-word hits are stronger
    }
    if (score > 0 && (!best || score > best.score)) best = { type, score };
  }
  return best?.type ?? null;
}

const LOCALITY_RE = /"addressLocality"\s*:\s*"([^"]{2,80})"/i;
const REGION_RE = /"addressRegion"\s*:\s*"([^"]{2,80})"/i;
const OG_LOCALITY_RE = /<meta[^>]+property=["']og:locality["'][^>]+content=["']([^"']{2,80})["']/i;

/** Pull locality/region from raw JSON-LD PostalAddress (or og:locality) in the page HTML. */
export function extractSchemaAddress(html: string): { city: string | null; region: string | null } {
  const scan = html.slice(0, 512_000);
  const city =
    (scan.match(LOCALITY_RE)?.[1] ?? scan.match(OG_LOCALITY_RE)?.[1] ?? '').trim() || null;
  const region = (scan.match(REGION_RE)?.[1] ?? '').trim() || null;
  return { city, region };
}

export function detectBusinessProfile(input: {
  title: string | null;
  metaDescription: string | null;
  textSample: string;
  jsonLdTypes: readonly string[];
  html: string;
}): BusinessProfile {
  const schemaLabel = labelFromSchemaTypes(input.jsonLdTypes);
  const text = [input.title ?? '', input.metaDescription ?? '', input.textSample].join('  ');
  const keywordLabel = detectBusinessTypeFromText(text);
  const { city, region } = extractSchemaAddress(input.html);

  const businessType = schemaLabel && schemaLabel !== 'local business'
    ? schemaLabel
    : keywordLabel ?? (schemaLabel ?? '');

  const source: DetectionSource =
    schemaLabel && schemaLabel !== 'local business' ? 'schema_org' : businessType ? 'heuristic' : 'unknown';

  // High: strong industry signal AND a city. Medium: one of the two. Low: neither.
  const hasStrongType = Boolean(schemaLabel && schemaLabel !== 'local business') || Boolean(keywordLabel);
  const confidence: BusinessProfile['confidence'] =
    hasStrongType && city ? 'high' : hasStrongType || city ? 'medium' : 'low';

  return { businessType, city, region, confidence, source };
}

// ── Discovery mode ─────────────────────────────────────────────────────────────
export type DiscoveryEnvLike = {
  COMPETITOR_DISCOVERY_MODE?: string;
  GEMINI_API_KEY?: string;
};

/**
 * 'gemini' (live Google-Search grounding) only when explicitly enabled AND a key is present.
 * Everything else — including OSS default — is 'mock'. Live discovery is blocked on Gemini
 * billing (free-tier 429s immediately on grounded search), so mock is the shipped default.
 */
export function resolveDiscoveryMode(env: DiscoveryEnvLike | undefined): DiscoveryMode {
  const flag = env?.COMPETITOR_DISCOVERY_MODE?.trim().toLowerCase();
  if (flag === 'live' || flag === 'gemini') {
    return env?.GEMINI_API_KEY?.trim() ? 'gemini' : 'mock';
  }
  return 'mock';
}

// ── Mock discovery (deterministic, no network, no cost) ─────────────────────────
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'competitor';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Small deterministic hash → stable pseudo-scores (no Date.now / Math.random).
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function letterFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function sampleSummaryFor(seed: string): CompetitorSampleSummary {
  const h = hash32(seed);
  // Unsigned shifts (`>>>`): a signed `>>` on a hash above 2^31 goes negative and `% n`
  // then yields negative scores. Keep everything in a sane 0–100 band.
  const overall = 42 + (h % 44); // 42–85
  const ai = 40 + ((h >>> 3) % 50);
  const ext = 38 + ((h >>> 7) % 52);
  const trust = 30 + ((h >>> 11) % 55);
  return {
    score: overall,
    letterGrade: letterFor(overall),
    categoryScores: [
      { category: 'ai_readiness', score: ai, letterGrade: letterFor(ai), checkCount: 8 },
      { category: 'extractability', score: ext, letterGrade: letterFor(ext), checkCount: 11 },
      { category: 'trust', score: trust, letterGrade: letterFor(trust), checkCount: 3 },
    ],
  };
}

/**
 * Deterministic, clearly-labelled SAMPLE competitors for the mock pipeline. URLs use the
 * reserved `.example` TLD (RFC 2606) so they never resolve to a real business — these are
 * illustrative, not scraped. The live Gemini path returns real local competitors instead.
 */
export function mockCompetitors(profile: BusinessProfile, selfDomain: string): CompetitorCandidate[] {
  const type = profile.businessType || 'local business';
  const cityPart = profile.city ? `${profile.city} ` : '';
  const cityTag = profile.city ? profile.city : 'your area';
  const bases = [
    `${cityPart}${titleCase(type)} Group`,
    `${titleCase(type)} of ${profile.city ?? 'the Region'}`,
    `Premier ${titleCase(type)}`,
  ];
  return bases.map((name, i) => {
    const domain = `${slugify(name)}.example`;
    return {
      name,
      domain,
      url: `https://${domain}/`,
      reason: `Illustrative ${type} that could compete with you in ${cityTag}.`,
      sample: sampleSummaryFor(`${selfDomain}|${name}|${i}`),
    };
  });
}

// ── Live discovery (Gemini google_search grounding) — dormant until billing ─────
export function buildDiscoveryPrompt(profile: BusinessProfile, selfDomain: string): string {
  const where = profile.city
    ? `in or near ${profile.city}${profile.region ? `, ${profile.region}` : ''}`
    : 'in the same local market';
  return [
    `Use Google Search to find real, currently-operating local competitors of the business at ${selfDomain}.`,
    `The business is a ${profile.businessType || 'local business'} ${where}.`,
    'Return 3 to 5 direct competitors: other businesses of the same type serving the same local area.',
    `Exclude ${selfDomain} itself, directories, aggregators (Yelp, Google, Facebook, etc.), and national chains.`,
    'Respond with ONLY a JSON object of this exact shape, no prose, no markdown fences:',
    '{ "competitors": [ { "name": "Business Name", "url": "https://their-site.com/", "reason": "one short phrase" } ] }',
  ].join('\n');
}

const candidateSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  reason: z.string().max(200).optional(),
});
const discoveryResponseSchema = z.object({
  competitors: z.array(candidateSchema).min(1).max(8),
});

/** Parse + validate the live Gemini discovery JSON into candidates (self-domain excluded). */
export function parseDiscoveryResponse(raw: string, selfDomain: string): CompetitorCandidate[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }

  const result = discoveryResponseSchema.safeParse(parsed);
  if (!result.success) return [];

  const self = selfDomain.replace(/^www\./i, '').toLowerCase();
  const seen = new Set<string>();
  const out: CompetitorCandidate[] = [];
  for (const c of result.data.competitors) {
    let domain: string;
    try {
      domain = new URL(c.url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      continue;
    }
    if (!domain || domain === self || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ name: c.name, url: c.url, domain, reason: c.reason });
    if (out.length >= 5) break;
  }
  return out;
}
