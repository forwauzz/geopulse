/**
 * Report contents settings — what a client-facing AI visibility report includes.
 *
 * Settings live under `metadata.report` on the owning row, a sibling of `metadata.brand`, and are
 * resolved over three levels: the shipped default, the agency (or workspace), then the individual
 * client. Each level stores ONLY the fields it explicitly changes, so improving the shipped default
 * still reaches every scope that has not overridden that field. Storing whole snapshots would
 * freeze a client at whatever the defaults were the day someone touched them.
 *
 * THE SECTION LIST IS GROUNDED, NOT ASPIRATIONAL. Every key below gates something that renders
 * today, verified 2026-08-01 against both delivered artifacts rather than against the source:
 *   - the signed-out summary at /client-summary/[clientId], read from the live DOM
 *   - a delivered GPM PDF pulled from R2 and parsed page by page
 * Sections we intend to add later live in PLANNED_SECTIONS and are deliberately NOT settings —
 * a switch that silently does nothing is worse than no switch.
 */
import { z } from 'zod';

export type ReportLayout = 'combined' | 'per_engine';
export type ReportWindowMonths = 1 | 3 | 6 | 12;

/** Engine keys mirror `AI_ENGINES` in components/ai-engines.tsx. */
export type ReportEngineKey = 'chatgpt' | 'google' | 'perplexity';

/** Which delivered artifact a section appears in. The two surfaces genuinely differ. */
export type ReportSurface = 'summary' | 'pdf';

/**
 * Section keys are stable identifiers, not display strings — renaming a heading must never
 * silently re-enable a section an agency turned off.
 */
export type ReportSectionKey =
  | 'headlineStats'
  | 'executiveSummary'
  | 'visibilityByEngine'
  | 'trendOverTime'
  | 'competitorsTracked'
  | 'buyerQuestions'
  | 'priorityActionPlan'
  | 'measurementReceipts'
  | 'promptPerformance'
  | 'opportunities'
  | 'competitorCoCitations'
  | 'scopeStatement'
  | 'methodology';

export type SectionDescriptor = {
  readonly key: ReportSectionKey;
  readonly label: string;
  readonly help: string;
  readonly source: string;
  readonly surfaces: readonly ReportSurface[];
  /** Cannot be disabled at any level. */
  readonly locked?: boolean;
  /**
   * Renders only when the period produced the underlying data, so the toggle is an upper bound
   * rather than a guarantee. Verified: Competitor Co-citations is present in the Sanomed PDF and
   * absent from the Stability Lab one for the same month.
   */
  readonly conditional?: boolean;
};

export const SECTION_DESCRIPTORS: readonly SectionDescriptor[] = [
  {
    key: 'headlineStats',
    label: 'Headline figures',
    help: 'Readiness, AI visibility and tracked-question count as three tiles.',
    source: 'scans.score / citation_rate',
    surfaces: ['summary'],
  },
  {
    key: 'executiveSummary',
    label: 'Executive summary',
    help: 'The written opening that states the finding.',
    source: 'narrative',
    surfaces: ['summary', 'pdf'],
  },
  {
    key: 'visibilityByEngine',
    label: 'Visibility by AI platform',
    help: 'Per-engine visibility. Shown beside the competitor list.',
    source: '*_visibility_pct',
    surfaces: ['summary', 'pdf'],
  },
  {
    key: 'trendOverTime',
    label: 'Visibility trend',
    help: 'Comparable monthly visibility using the same versioned prompt, engine and competitor profile.',
    source: 'prior combined report snapshots with the same profile_version',
    surfaces: ['summary', 'pdf'],
  },
  {
    key: 'competitorsTracked',
    label: 'Competitors tracked',
    help: 'Names the competitors being measured against.',
    source: 'competitor_list',
    surfaces: ['summary'],
  },
  {
    key: 'buyerQuestions',
    label: 'What buyers are asking AI',
    help: 'Every tracked question with its per-engine result.',
    source: 'prompts[]',
    surfaces: ['summary'],
  },
  {
    key: 'priorityActionPlan',
    label: 'Priority action plan',
    help: 'Recommended next steps with impact and effort.',
    source: 'outcome actions',
    surfaces: ['summary'],
  },
  {
    key: 'measurementReceipts',
    label: 'What the AI answers actually showed',
    help: 'Per-engine cited counts and who was named instead.',
    source: 'prompts[] / competitors[]',
    surfaces: ['summary'],
  },
  {
    key: 'promptPerformance',
    label: 'Prompt performance table',
    help: 'Query, cited, rank and top competitor, as a table.',
    source: 'prompts[]',
    surfaces: ['pdf'],
  },
  {
    key: 'opportunities',
    label: 'Opportunities',
    help: 'Queries that did not cite the client, and who appeared instead.',
    source: 'opportunities[]',
    surfaces: ['pdf'],
  },
  {
    key: 'competitorCoCitations',
    label: 'Competitor co-citations',
    help: 'Domains appearing alongside the client. Only renders when co-citations were recorded.',
    source: 'competitors[]',
    surfaces: ['pdf'],
    conditional: true,
  },
  {
    key: 'scopeStatement',
    label: 'Scope statement',
    help: 'Which engines, how many questions, and the period measured.',
    source: 'config',
    surfaces: ['summary', 'pdf'],
    locked: true,
  },
  {
    key: 'methodology',
    label: 'Methodology and definitions',
    help: 'How each figure is measured, and the session-variance caveat.',
    source: 'static',
    surfaces: ['summary', 'pdf'],
    locked: true,
  },
];

/**
 * Wanted, but not rendered by either surface today. Kept here so the UI can show them as coming
 * rather than as switches that do nothing, and so we do not re-derive the list from mockups again.
 */
export const PLANNED_SECTIONS: readonly { readonly label: string; readonly blockedBy: string }[] = [
  { label: 'Category breakdown', blockedBy: 'Not rendered by either surface; needs categoryScores wired in.' },
  { label: 'Named vs linked', blockedBy: 'brand_mention / url_citation are collected but never rendered.' },
  { label: 'Average position when cited', blockedBy: 'industry_rank is null on every row; bundled into the PDF visibility card.' },
  { label: 'Share of answers', blockedBy: 'share_of_voice is collected but not rendered as its own section.' },
  { label: 'Crawl and access detail', blockedBy: 'coverageSummary is collected but never rendered.' },
];

export const LOCKED_SECTIONS: readonly ReportSectionKey[] = SECTION_DESCRIPTORS.filter(
  (section) => section.locked
).map((section) => section.key);

export function isLockedSection(key: ReportSectionKey): boolean {
  return LOCKED_SECTIONS.includes(key);
}

export function sectionsForSurface(surface: ReportSurface): readonly SectionDescriptor[] {
  return SECTION_DESCRIPTORS.filter((section) => section.surfaces.includes(surface));
}

export type ReportSettings = {
  readonly layout: ReportLayout;
  readonly comparisonMonths: ReportWindowMonths;
  readonly promptKeys: readonly string[];
  readonly competitors: readonly string[];
  readonly engines: Readonly<Record<ReportEngineKey, boolean>>;
  readonly sections: Readonly<Record<ReportSectionKey, boolean>>;
};

/** A sparse override: only the fields this level explicitly sets. */
export type PartialReportSettings = {
  readonly layout?: ReportLayout;
  readonly comparisonMonths?: ReportWindowMonths;
  readonly promptKeys?: readonly string[];
  readonly competitors?: readonly string[];
  readonly engines?: Partial<Record<ReportEngineKey, boolean>>;
  readonly sections?: Partial<Record<ReportSectionKey, boolean>>;
};

/**
 * What ships. Everything on by default: each section is already rendered today, so defaulting one
 * to off would silently remove content agencies currently receive.
 */
export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  layout: 'combined',
  comparisonMonths: 12,
  promptKeys: [],
  competitors: [],
  engines: { chatgpt: true, google: true, perplexity: true },
  sections: SECTION_DESCRIPTORS.reduce(
    (acc, section) => ({ ...acc, [section.key]: true }),
    {} as Record<ReportSectionKey, boolean>
  ),
};

const LAYOUTS = ['combined', 'per_engine'] as const;
const COMPARISON_MONTHS = [1, 3, 6, 12] as const;
const ENGINE_KEYS = Object.keys(DEFAULT_REPORT_SETTINGS.engines) as ReportEngineKey[];
const SECTION_KEYS = SECTION_DESCRIPTORS.map((section) => section.key);

/**
 * Keys are validated by filtering, not by the schema. A `z.record` with an enum key REJECTS an
 * unknown key rather than stripping it, which would mean one retired section name discards an
 * agency's whole configuration.
 */
const partialSchema = z
  .object({
    layout: z.enum(LAYOUTS).optional(),
    comparisonMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
    promptKeys: z.array(z.string()).max(100).optional(),
    competitors: z.array(z.string()).max(50).optional(),
    engines: z.record(z.string(), z.boolean()).optional(),
    sections: z.record(z.string(), z.boolean()).optional(),
  })
  .strip();

function pickKnown<K extends string>(
  source: Record<string, boolean> | undefined,
  known: readonly K[]
): Partial<Record<K, boolean>> | undefined {
  if (!source) return undefined;
  const out: Partial<Record<K, boolean>> = {};
  for (const key of known) {
    const value = source[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Read an untrusted stored value into a sparse override. Anything unrecognised — a malformed blob,
 * an engine key we retired, a section renamed in a later version — is dropped rather than throwing,
 * so one bad row cannot stop a report rendering.
 */
export function parseReportSettings(stored: unknown): PartialReportSettings {
  if (!stored || typeof stored !== 'object') return {};
  const parsed = partialSchema.safeParse(stored);
  if (!parsed.success) return {};

  const out: {
    layout?: ReportLayout;
    comparisonMonths?: ReportWindowMonths;
    promptKeys?: readonly string[];
    competitors?: readonly string[];
    engines?: Partial<Record<ReportEngineKey, boolean>>;
    sections?: Partial<Record<ReportSectionKey, boolean>>;
  } = {};
  if (parsed.data.layout) out.layout = parsed.data.layout;
  if (parsed.data.comparisonMonths) out.comparisonMonths = parsed.data.comparisonMonths;

  const promptKeys = cleanSelection(parsed.data.promptKeys);
  if (promptKeys) out.promptKeys = promptKeys;

  const competitors = cleanSelection(parsed.data.competitors);
  if (competitors) out.competitors = competitors;

  const engines = pickKnown(parsed.data.engines, ENGINE_KEYS);
  if (engines) out.engines = engines;

  const sections = pickKnown(parsed.data.sections, SECTION_KEYS);
  if (sections) out.sections = sections;

  return out;
}

/**
 * Merge levels from broadest to narrowest. A level that omits a field leaves the level above
 * untouched — that is the whole point of storing sparse overrides.
 */
export function resolveReportSettings(
  ...levels: readonly (PartialReportSettings | null | undefined)[]
): ReportSettings {
  let layout: ReportLayout = DEFAULT_REPORT_SETTINGS.layout;
  let comparisonMonths: ReportWindowMonths = DEFAULT_REPORT_SETTINGS.comparisonMonths;
  let promptKeys: readonly string[] = DEFAULT_REPORT_SETTINGS.promptKeys;
  let competitors: readonly string[] = DEFAULT_REPORT_SETTINGS.competitors;
  const engines: Record<ReportEngineKey, boolean> = { ...DEFAULT_REPORT_SETTINGS.engines };
  const sections: Record<ReportSectionKey, boolean> = { ...DEFAULT_REPORT_SETTINGS.sections };

  for (const level of levels) {
    if (!level) continue;
    if (level.layout) layout = level.layout;
    if (level.comparisonMonths && COMPARISON_MONTHS.includes(level.comparisonMonths)) {
      comparisonMonths = level.comparisonMonths;
    }
    if (level.promptKeys) promptKeys = cleanSelection(level.promptKeys) ?? [];
    if (level.competitors) competitors = cleanSelection(level.competitors) ?? [];
    for (const key of ENGINE_KEYS) {
      const value = level.engines?.[key];
      if (typeof value === 'boolean') engines[key] = value;
    }
    for (const key of SECTION_KEYS) {
      const value = level.sections?.[key];
      if (typeof value === 'boolean') sections[key] = value;
    }
  }

  // Locked sections win over anything any level stored.
  for (const key of LOCKED_SECTIONS) sections[key] = true;

  return { layout, comparisonMonths, promptKeys, competitors, engines, sections };
}

function cleanSelection(values: readonly string[] | undefined): readonly string[] | undefined {
  if (!values) return undefined;
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

/** Fields this scope sets, for showing "following the default" versus "set here" in the UI. */
export type OverrideMap = {
  readonly layout: boolean;
  readonly comparisonMonths: boolean;
  readonly promptKeys: boolean;
  readonly competitors: boolean;
  readonly engines: Readonly<Partial<Record<ReportEngineKey, boolean>>>;
  readonly sections: Readonly<Partial<Record<ReportSectionKey, boolean>>>;
  readonly count: number;
};

export function describeOverrides(level: PartialReportSettings | null | undefined): OverrideMap {
  const engines: Partial<Record<ReportEngineKey, boolean>> = {};
  const sections: Partial<Record<ReportSectionKey, boolean>> = {};
  let count = 0;

  if (level?.layout) count += 1;
  if (level?.comparisonMonths) count += 1;
  if (level?.promptKeys) count += 1;
  if (level?.competitors) count += 1;
  for (const key of ENGINE_KEYS) {
    if (typeof level?.engines?.[key] === 'boolean') {
      engines[key] = true;
      count += 1;
    }
  }
  for (const key of SECTION_KEYS) {
    if (typeof level?.sections?.[key] === 'boolean') {
      sections[key] = true;
      count += 1;
    }
  }

  return {
    layout: Boolean(level?.layout),
    comparisonMonths: Boolean(level?.comparisonMonths),
    promptKeys: Boolean(level?.promptKeys),
    competitors: Boolean(level?.competitors),
    engines,
    sections,
    count,
  };
}

/**
 * Reduce a desired end-state to the keys that actually differ from the level above, so saving a
 * screen where nothing was touched writes nothing. Locked sections are never stored.
 */
export function diffAgainstInherited(
  desired: ReportSettings,
  inherited: ReportSettings
): PartialReportSettings {
  const out: {
    layout?: ReportLayout;
    comparisonMonths?: ReportWindowMonths;
    promptKeys?: readonly string[];
    competitors?: readonly string[];
    engines?: Partial<Record<ReportEngineKey, boolean>>;
    sections?: Partial<Record<ReportSectionKey, boolean>>;
  } = {};

  if (desired.layout !== inherited.layout) out.layout = desired.layout;
  if (desired.comparisonMonths !== inherited.comparisonMonths) {
    out.comparisonMonths = desired.comparisonMonths;
  }
  if (JSON.stringify(desired.promptKeys) !== JSON.stringify(inherited.promptKeys)) {
    out.promptKeys = cleanSelection(desired.promptKeys) ?? [];
  }
  if (JSON.stringify(desired.competitors) !== JSON.stringify(inherited.competitors)) {
    out.competitors = cleanSelection(desired.competitors) ?? [];
  }

  const engines: Partial<Record<ReportEngineKey, boolean>> = {};
  for (const key of ENGINE_KEYS) {
    if (desired.engines[key] !== inherited.engines[key]) engines[key] = desired.engines[key];
  }
  if (Object.keys(engines).length > 0) out.engines = engines;

  const sections: Partial<Record<ReportSectionKey, boolean>> = {};
  for (const key of SECTION_KEYS) {
    if (isLockedSection(key)) continue;
    if (desired.sections[key] !== inherited.sections[key]) sections[key] = desired.sections[key];
  }
  if (Object.keys(sections).length > 0) out.sections = sections;

  return out;
}

/**
 * Whether a section should render. `enabled` comes from settings; `hasData` from the payload. The
 * third state matters: a section that is on but empty renders an explicit empty state, because
 * silently omitting it makes the setting look broken.
 */
export type SectionRenderState = 'render' | 'empty' | 'hidden';

export function sectionRenderState(enabled: boolean, hasData: boolean): SectionRenderState {
  if (!enabled) return 'hidden';
  return hasData ? 'render' : 'empty';
}

/** Stable, non-secret identity for the exact report profile used to create an artifact. */
export function reportProfileVersion(settings: ReportSettings): string {
  const serialized = JSON.stringify({
    layout: settings.layout,
    comparisonMonths: settings.comparisonMonths,
    promptKeys: [...settings.promptKeys],
    competitors: [...settings.competitors],
    engines: ENGINE_KEYS.map((key) => [key, settings.engines[key]]),
    sections: SECTION_KEYS.map((key) => [key, settings.sections[key]]),
  });
  let checksum = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    checksum ^= serialized.charCodeAt(index);
    checksum = Math.imul(checksum, 0x01000193);
  }
  return `rp2-${(checksum >>> 0).toString(16).padStart(8, '0')}`;
}
