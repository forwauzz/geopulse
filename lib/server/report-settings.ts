/**
 * Report contents settings — what a client-facing AI visibility report includes.
 *
 * Settings live under `metadata.report` on the owning row, a sibling of `metadata.brand`, and are
 * resolved over three levels: the shipped default, the agency (or workspace), then the individual
 * client. Each level stores ONLY the fields it explicitly changes, so improving the shipped default
 * still reaches every scope that has not overridden that field. Storing whole snapshots would
 * freeze a client at whatever the defaults were the day someone touched them.
 *
 * Two sections are deliberately not configurable: the scope statement and the methodology block.
 * They are what let a reader see the boundary of what was measured, which is what makes the
 * sections an agency *does* choose to show trustworthy. A stored `false` for either is ignored
 * rather than honoured.
 */
import { z } from 'zod';

export type ReportLayout = 'combined' | 'per_engine';

/** Engine keys mirror `AI_ENGINES` in components/ai-engines.tsx. */
export type ReportEngineKey = 'chatgpt' | 'google' | 'perplexity' | 'claude' | 'copilot';

/**
 * Section keys are stable identifiers, not display strings — renaming a heading must never
 * silently re-enable a section an agency turned off.
 */
export type ReportSectionKey =
  // site health, from the audit
  | 'readinessScore'
  | 'categoryBreakdown'
  | 'holdingScoreDown'
  | 'crawlDetail'
  // answer visibility, from the benchmark
  | 'combinedVisibility'
  | 'perEngineBreakdown'
  | 'namedVsLinked'
  | 'questionByQuestion'
  | 'averagePosition'
  // competitive
  | 'whoIsWinning'
  | 'shareOfAnswers'
  | 'trackedCompetitorSet'
  // framing
  | 'executiveSummary'
  | 'trendOverTime'
  | 'whatWeAreDoingNext'
  // always on
  | 'scopeStatement'
  | 'methodology';

/** Sections no level may disable. See the module note. */
export const LOCKED_SECTIONS: readonly ReportSectionKey[] = ['scopeStatement', 'methodology'] as const;

export function isLockedSection(key: ReportSectionKey): boolean {
  return LOCKED_SECTIONS.includes(key);
}

export type ReportSettings = {
  readonly layout: ReportLayout;
  readonly engines: Readonly<Record<ReportEngineKey, boolean>>;
  readonly sections: Readonly<Record<ReportSectionKey, boolean>>;
};

/** A sparse override: only the fields this level explicitly sets. */
export type PartialReportSettings = {
  readonly layout?: ReportLayout;
  readonly engines?: Partial<Record<ReportEngineKey, boolean>>;
  readonly sections?: Partial<Record<ReportSectionKey, boolean>>;
};

/**
 * What ships. Chosen so a brand-new agency gets a report that explains itself: the category
 * breakdown is on because it is what turns "0% visibility" into a diagnosis, and the technical
 * crawl detail is off because it reads as noise to a clinic owner.
 */
export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  layout: 'combined',
  engines: {
    chatgpt: true,
    google: true,
    perplexity: true,
    claude: true,
    copilot: true,
  },
  sections: {
    readinessScore: true,
    categoryBreakdown: true,
    holdingScoreDown: true,
    crawlDetail: false,
    combinedVisibility: true,
    perEngineBreakdown: true,
    namedVsLinked: true,
    questionByQuestion: true,
    averagePosition: false,
    whoIsWinning: true,
    shareOfAnswers: true,
    trackedCompetitorSet: false,
    executiveSummary: true,
    trendOverTime: true,
    whatWeAreDoingNext: true,
    scopeStatement: true,
    methodology: true,
  },
};

const LAYOUTS = ['combined', 'per_engine'] as const;
const ENGINE_KEYS = Object.keys(DEFAULT_REPORT_SETTINGS.engines) as ReportEngineKey[];
const SECTION_KEYS = Object.keys(DEFAULT_REPORT_SETTINGS.sections) as ReportSectionKey[];

/**
 * Keys are validated by filtering, not by the schema. A `z.record` with an enum key REJECTS an
 * unknown key rather than stripping it, which would mean one retired section name discards an
 * agency's whole configuration. Accept any string key here and drop the ones we do not know.
 */
const partialSchema = z
  .object({
    layout: z.enum(LAYOUTS).optional(),
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
    engines?: Partial<Record<ReportEngineKey, boolean>>;
    sections?: Partial<Record<ReportSectionKey, boolean>>;
  } = {};
  if (parsed.data.layout) out.layout = parsed.data.layout;

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
  const engines: Record<ReportEngineKey, boolean> = { ...DEFAULT_REPORT_SETTINGS.engines };
  const sections: Record<ReportSectionKey, boolean> = { ...DEFAULT_REPORT_SETTINGS.sections };

  for (const level of levels) {
    if (!level) continue;
    if (level.layout) layout = level.layout;
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

  return { layout, engines, sections };
}

/** Fields this scope sets, for showing "following the default" versus "set here" in the UI. */
export type OverrideMap = {
  readonly layout: boolean;
  readonly engines: Readonly<Partial<Record<ReportEngineKey, boolean>>>;
  readonly sections: Readonly<Partial<Record<ReportSectionKey, boolean>>>;
  readonly count: number;
};

export function describeOverrides(level: PartialReportSettings | null | undefined): OverrideMap {
  const engines: Partial<Record<ReportEngineKey, boolean>> = {};
  const sections: Partial<Record<ReportSectionKey, boolean>> = {};
  let count = 0;

  if (level?.layout) count += 1;
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

  return { layout: Boolean(level?.layout), engines, sections, count };
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
    engines?: Partial<Record<ReportEngineKey, boolean>>;
    sections?: Partial<Record<ReportSectionKey, boolean>>;
  } = {};

  if (desired.layout !== inherited.layout) out.layout = desired.layout;

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
 * Whether a section should render for a period. `enabled` comes from settings; `hasData` from the
 * payload. The third state matters: a section that is on but empty renders an explicit empty
 * state, because silently omitting it makes the setting look broken.
 */
export type SectionRenderState = 'render' | 'empty' | 'hidden';

export function sectionRenderState(enabled: boolean, hasData: boolean): SectionRenderState {
  if (!enabled) return 'hidden';
  return hasData ? 'render' : 'empty';
}
