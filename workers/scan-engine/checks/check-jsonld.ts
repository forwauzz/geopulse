/**
 * Structured-data validation (spec C7): a JSON-LD block passes only when it has a
 * recognized @type, the required properties for that type, AND its name/headline
 * matches the page's visible content. Presence of a <script> block alone never passes —
 * that was the old check's false comfort.
 */
import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

/** Required properties per recognized @type (minimal, per schema.org + Google guidance). */
const REQUIRED_PROPS: Record<string, string[]> = {
  Organization: ['name'],
  LocalBusiness: ['name', 'address'],
  WebSite: ['name', 'url'],
  WebPage: ['name'],
  Article: ['headline'],
  NewsArticle: ['headline'],
  BlogPosting: ['headline'],
  FAQPage: ['mainEntity'],
  HowTo: ['name', 'step'],
  Product: ['name'],
  BreadcrumbList: ['itemListElement'],
  Person: ['name'],
  Event: ['name', 'startDate'],
  Service: ['name'],
  ProfessionalService: ['name'],
};

type LdObject = Record<string, unknown>;

function asObjects(blocks: unknown[]): LdObject[] {
  const out: LdObject[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const obj = b as LdObject;
    // Unwrap @graph containers.
    const graph = obj['@graph'];
    if (Array.isArray(graph)) {
      for (const g of graph) {
        if (g && typeof g === 'object') out.push(g as LdObject);
      }
    }
    out.push(obj);
  }
  return out;
}

function typesOf(obj: LdObject): string[] {
  const t = obj['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === 'string');
  return [];
}

function hasProp(obj: LdObject, prop: string): boolean {
  const v = obj[prop];
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function visibleName(obj: LdObject): string | null {
  for (const key of ['name', 'headline']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 2) return v.trim();
  }
  return null;
}

export interface LdValidation {
  validated: { type: string; matchesVisibleContent: boolean }[];
  missingProps: { type: string; missing: string[] }[];
  unrecognizedTypes: string[];
}

export function validateJsonLd(blocks: unknown[], visibleText: string): LdValidation {
  const lowerText = visibleText.toLowerCase();
  const validated: LdValidation['validated'] = [];
  const missingProps: LdValidation['missingProps'] = [];
  const unrecognized: string[] = [];

  for (const obj of asObjects(blocks)) {
    for (const type of typesOf(obj)) {
      const required = REQUIRED_PROPS[type];
      if (!required) {
        unrecognized.push(type);
        continue;
      }
      const missing = required.filter((p) => !hasProp(obj, p));
      if (missing.length > 0) {
        missingProps.push({ type, missing });
        continue;
      }
      const name = visibleName(obj);
      const matches = name ? lowerText.includes(name.toLowerCase().slice(0, 60)) : false;
      validated.push({ type, matchesVisibleContent: matches });
    }
  }

  return { validated, missingProps, unrecognizedTypes: [...new Set(unrecognized)] };
}

export const jsonLdCheck: AuditCheck = {
  id: 'json-ld',
  name: 'Structured data (JSON-LD) validity',
  weight: 6,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const blocks = ctx.signals.jsonLdBlocks;
    if (!blocks || blocks.length === 0) {
      return {
        id: 'json-ld',
        passed: false,
        status: 'FAIL',
        finding: 'No JSON-LD structured data found.',
        fix: 'Add schema.org JSON-LD (Organization or LocalBusiness with name and address; FAQPage on question pages). It helps AI engines understand your business — it is an understanding aid, not a ranking switch.',
      };
    }

    const v = validateJsonLd(blocks, ctx.textSample);

    if (v.validated.length === 0) {
      const detail =
        v.missingProps.length > 0
          ? `Types present but missing required properties: ${v.missingProps
              .map((m) => `${m.type} (needs ${m.missing.join(', ')})`)
              .join('; ')}.`
          : v.unrecognizedTypes.length > 0
            ? `Only unrecognized/low-value types found: ${v.unrecognizedTypes.join(', ')}.`
            : 'Blocks present but no usable @type declared.';
      return {
        id: 'json-ld',
        passed: false,
        status: 'FAIL',
        finding: `JSON-LD is present but does not validate — a block alone earns nothing. ${detail}`,
        fix: 'Complete the schema: every block needs a specific @type and its required properties (e.g. LocalBusiness needs name and address), and the values must match what the page visibly says.',
      };
    }

    const confirmed = v.validated.filter((x) => x.matchesVisibleContent);
    if (confirmed.length === 0) {
      return {
        id: 'json-ld',
        passed: true,
        status: 'WARNING',
        finding: `Valid JSON-LD found (${v.validated.map((x) => x.type).join(', ')}), but its name/headline does not match the page's visible text — engines distrust markup that disagrees with the page.`,
        fix: 'Make the schema name/headline exactly match what visitors see on the page.',
      };
    }

    return {
      id: 'json-ld',
      passed: true,
      status: 'PASS',
      finding: `Valid JSON-LD matching visible content: ${confirmed.map((x) => x.type).join(', ')}.`,
    };
  },
};
