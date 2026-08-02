import type { GpmPromptRow, GpmReportPayload } from './geo-performance-report-payload';
import {
  reportProfileVersion,
  type ReportEngineKey,
  type ReportSettings,
} from './report-settings';

export type GpmReportPlatform = 'chatgpt' | 'gemini' | 'perplexity';

export type AgencyReportEngine = {
  readonly key: GpmReportPlatform;
  readonly label: string;
  readonly queriesTracked: number;
  readonly queriesCited: number;
  /** Fraction from 0 to 1, computed from the prompt rows included in this exact snapshot. */
  readonly visibilityPct: number;
  readonly sourceRunGroupId: string;
};

export type AgencyReportQuestion = {
  readonly queryKey: string;
  readonly queryText: string;
  readonly citedByEngines: number;
  readonly enginesMeasured: number;
  readonly results: Readonly<Partial<Record<GpmReportPlatform, GpmPromptRow>>>;
};

export type AgencyReportCompetitor = {
  readonly name: string;
  readonly appearedInsteadCount: number;
  readonly totalEvaluations: number;
};

export type AgencyReportTrendPoint = {
  readonly windowDate: string;
  readonly reportedAt: string;
  readonly visibilityPct: number;
  readonly evaluationsTracked: number;
  readonly evaluationsCited: number;
};

export type AgencyReportSnapshotV2 = {
  readonly version: '2';
  readonly profileVersion: string;
  readonly configId: string;
  readonly clientName: string;
  readonly domain: string;
  readonly topic: string;
  readonly location: string;
  readonly windowDate: string;
  readonly reportedAt: string;
  readonly comparisonMonths: number;
  readonly combinedVisibilityPct: number;
  readonly questionsTracked: number;
  readonly questionsCited: number;
  readonly evaluationsTracked: number;
  readonly evaluationsCited: number;
  readonly availableEngines: readonly AgencyReportEngine[];
  readonly engines: readonly AgencyReportEngine[];
  readonly unavailableEngines: readonly GpmReportPlatform[];
  /** Complete measured evidence retained privately so an agency can reverse a prior curation. */
  readonly availableQuestions: readonly AgencyReportQuestion[];
  readonly questions: readonly AgencyReportQuestion[];
  readonly wins: readonly AgencyReportQuestion[];
  readonly opportunities: readonly AgencyReportQuestion[];
  readonly competitors: readonly AgencyReportCompetitor[];
  readonly availableCompetitors: readonly AgencyReportCompetitor[];
  readonly trend: readonly AgencyReportTrendPoint[];
  readonly settings: ReportSettings;
  readonly scope: {
    readonly isCurated: boolean;
    readonly selectedPromptCount: number;
    readonly availablePromptCount: number;
    readonly selectedCompetitorCount: number;
    readonly availableCompetitorCount: number;
    readonly disclosure: string;
  };
};

const PLATFORM_ORDER: readonly GpmReportPlatform[] = ['chatgpt', 'gemini', 'perplexity'];

function engineSettingKey(platform: GpmReportPlatform): ReportEngineKey {
  return platform === 'gemini' ? 'google' : platform;
}

export function reportPlatformLabel(platform: GpmReportPlatform): string {
  if (platform === 'chatgpt') return 'ChatGPT';
  if (platform === 'gemini') return 'Google Gemini';
  return 'Perplexity';
}

function isPlatform(value: string): value is GpmReportPlatform {
  return PLATFORM_ORDER.includes(value as GpmReportPlatform);
}

function canonical(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

function assertCompatible(payload: GpmReportPayload, args: {
  readonly configId: string;
  readonly domain: string;
  readonly windowDate: string;
}): void {
  if (payload.configId !== args.configId) throw new Error('report_snapshot_config_mismatch');
  if (canonical(payload.domain) !== canonical(args.domain)) throw new Error('report_snapshot_domain_mismatch');
  if (payload.windowDate !== args.windowDate) throw new Error('report_snapshot_window_mismatch');
  if (!isPlatform(payload.platform)) throw new Error('report_snapshot_platform_unsupported');
}

function fraction(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

export function buildAgencyReportSnapshot(args: {
  readonly configId: string;
  readonly clientName?: string | null;
  readonly domain: string;
  readonly topic: string;
  readonly location: string;
  readonly windowDate: string;
  readonly reportedAt?: string;
  readonly payloads: readonly GpmReportPayload[];
  readonly sourceRunGroupIds: Readonly<Partial<Record<GpmReportPlatform, string>>>;
  readonly settings: ReportSettings;
}): AgencyReportSnapshotV2 {
  const byPlatform = new Map<GpmReportPlatform, GpmReportPayload>();
  for (const payload of args.payloads) {
    assertCompatible(payload, args);
    const platform = payload.platform as GpmReportPlatform;
    if (byPlatform.has(platform)) throw new Error('report_snapshot_duplicate_platform');
    byPlatform.set(platform, payload);
  }

  const enabledPlatforms = PLATFORM_ORDER.filter(
    (platform) => args.settings.engines[engineSettingKey(platform)]
  );
  const measuredPlatforms = PLATFORM_ORDER.filter(
    (platform) => byPlatform.has(platform) && Boolean(args.sourceRunGroupIds[platform])
  );
  const includedPlatforms = enabledPlatforms.filter((platform) => measuredPlatforms.includes(platform));
  if (includedPlatforms.length === 0) throw new Error('report_snapshot_has_no_measured_engines');

  const availablePromptKeys: string[] = [];
  const promptTextByKey = new Map<string, string>();
  for (const platform of measuredPlatforms) {
    for (const prompt of byPlatform.get(platform)!.prompts) {
      if (!promptTextByKey.has(prompt.queryKey)) availablePromptKeys.push(prompt.queryKey);
      promptTextByKey.set(prompt.queryKey, prompt.queryText);
    }
  }
  const selectedPromptSet = new Set(args.settings.promptKeys);
  const includedPromptKeys = args.settings.promptKeys.length > 0
    ? availablePromptKeys.filter((key) => selectedPromptSet.has(key))
    : availablePromptKeys;
  if (includedPromptKeys.length === 0) throw new Error('report_snapshot_curated_scope_has_no_prompts');

  function buildQuestions(queryKeys: readonly string[], platforms: readonly GpmReportPlatform[]): AgencyReportQuestion[] {
    return queryKeys.map((queryKey) => {
      const results: Partial<Record<GpmReportPlatform, GpmPromptRow>> = {};
      for (const platform of platforms) {
        const prompt = byPlatform.get(platform)!.prompts.find((candidate) => candidate.queryKey === queryKey);
        if (prompt) results[platform] = prompt;
      }
      const resultRows = Object.values(results);
      return {
        queryKey,
        queryText: promptTextByKey.get(queryKey) ?? queryKey,
        citedByEngines: resultRows.filter((result) => result?.cited).length,
        enginesMeasured: resultRows.length,
        results,
      };
    });
  }
  const availableQuestions = buildQuestions(availablePromptKeys, measuredPlatforms);
  const questions = buildQuestions(includedPromptKeys, includedPlatforms);

  function buildEngines(platforms: readonly GpmReportPlatform[], promptKeys: readonly string[]): AgencyReportEngine[] {
    return platforms.map((platform) => {
      const payload = byPlatform.get(platform)!;
      const included = payload.prompts.filter((prompt) => promptKeys.includes(prompt.queryKey));
      const queriesCited = included.filter((prompt) => prompt.cited).length;
      return {
        key: platform,
        label: reportPlatformLabel(platform),
        queriesTracked: included.length,
        queriesCited,
        visibilityPct: fraction(queriesCited, included.length),
        sourceRunGroupId: args.sourceRunGroupIds[platform]!,
      };
    });
  }
  const availableEngines = buildEngines(measuredPlatforms, availablePromptKeys);
  const engines = buildEngines(includedPlatforms, includedPromptKeys);

  const availableEvaluationsTracked = availableEngines.reduce((sum, engine) => sum + engine.queriesTracked, 0);
  const evaluationsTracked = engines.reduce((sum, engine) => sum + engine.queriesTracked, 0);
  const evaluationsCited = engines.reduce((sum, engine) => sum + engine.queriesCited, 0);
  function countCompetitors(source: readonly AgencyReportQuestion[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const question of source) {
      for (const result of Object.values(question.results)) {
        const competitor = result?.topCompetitorInQuery?.trim();
        if (competitor) counts.set(competitor, (counts.get(competitor) ?? 0) + 1);
      }
    }
    return counts;
  }
  const availableCompetitors = [...countCompetitors(availableQuestions).entries()]
    .map(([name, appearedInsteadCount]) => ({ name, appearedInsteadCount, totalEvaluations: availableEvaluationsTracked }))
    .sort((a, b) => b.appearedInsteadCount - a.appearedInsteadCount || a.name.localeCompare(b.name));
  const selectedCompetitors = new Set(args.settings.competitors.map(canonical));
  const competitors = [...countCompetitors(questions).entries()]
    .map(([name, appearedInsteadCount]) => ({ name, appearedInsteadCount, totalEvaluations: evaluationsTracked }))
    .filter((competitor) => selectedCompetitors.size === 0 || selectedCompetitors.has(canonical(competitor.name)));

  const isCurated = args.settings.promptKeys.length > 0
    || args.settings.competitors.length > 0
    || enabledPlatforms.length < PLATFORM_ORDER.length;
  const assistantLabel = includedPlatforms.length === 1 ? 'AI assistant' : 'AI assistants';
  const disclosure = isCurated
    ? `Curated scope: ${String(includedPromptKeys.length)} of ${String(availablePromptKeys.length)} measured buyer questions, ${String(includedPlatforms.length)} ${assistantLabel}, and ${String(competitors.length)} selected competitors.`
    : `Full measured scope: ${String(includedPromptKeys.length)} buyer questions across ${String(includedPlatforms.length)} ${assistantLabel}.`;
  const reportedAt = args.reportedAt ?? new Date().toISOString();

  return {
    version: '2',
    profileVersion: reportProfileVersion(args.settings),
    configId: args.configId,
    clientName: args.clientName?.trim() || args.domain,
    domain: canonical(args.domain),
    topic: args.topic,
    location: args.location,
    windowDate: args.windowDate,
    reportedAt,
    comparisonMonths: args.settings.comparisonMonths,
    combinedVisibilityPct: fraction(evaluationsCited, evaluationsTracked),
    questionsTracked: questions.length,
    questionsCited: questions.filter((question) => question.citedByEngines > 0).length,
    evaluationsTracked,
    evaluationsCited,
    availableEngines,
    engines,
    unavailableEngines: enabledPlatforms.filter((platform) => !includedPlatforms.includes(platform)),
    availableQuestions,
    questions,
    wins: questions
      .filter((question) => question.citedByEngines > 0)
      .sort((a, b) => b.citedByEngines - a.citedByEngines || a.queryText.localeCompare(b.queryText)),
    opportunities: questions.filter((question) => question.citedByEngines === 0),
    competitors,
    availableCompetitors,
    trend: [{
      windowDate: args.windowDate,
      reportedAt,
      visibilityPct: fraction(evaluationsCited, evaluationsTracked),
      evaluationsTracked,
      evaluationsCited,
    }],
    settings: args.settings,
    scope: {
      isCurated,
      selectedPromptCount: includedPromptKeys.length,
      availablePromptCount: availablePromptKeys.length,
      selectedCompetitorCount: competitors.length,
      availableCompetitorCount: availableCompetitors.length,
      disclosure,
    },
  };
}

function monthIndex(windowDate: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(windowDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

/** Attach only like-for-like history. A profile change intentionally starts a new baseline. */
export function attachComparableAgencyReportHistory(
  snapshot: AgencyReportSnapshotV2,
  candidates: readonly AgencyReportSnapshotV2[]
): AgencyReportSnapshotV2 {
  const currentMonth = monthIndex(snapshot.windowDate);
  if (currentMonth === null) return snapshot;
  const earliestMonth = currentMonth - snapshot.comparisonMonths + 1;
  const points = new Map<string, AgencyReportTrendPoint>();
  const comparable = [...candidates, snapshot].filter((candidate) => {
    const candidateMonth = monthIndex(candidate.windowDate);
    return candidate.version === '2'
      && candidate.configId === snapshot.configId
      && canonical(candidate.domain) === canonical(snapshot.domain)
      && candidate.profileVersion === snapshot.profileVersion
      && candidateMonth !== null
      && candidateMonth >= earliestMonth
      && candidateMonth <= currentMonth;
  });
  for (const candidate of comparable) {
    const next: AgencyReportTrendPoint = {
      windowDate: candidate.windowDate,
      reportedAt: candidate.reportedAt,
      visibilityPct: candidate.combinedVisibilityPct,
      evaluationsTracked: candidate.evaluationsTracked,
      evaluationsCited: candidate.evaluationsCited,
    };
    const existing = points.get(candidate.windowDate);
    if (!existing || existing.reportedAt < next.reportedAt) points.set(candidate.windowDate, next);
  }
  return { ...snapshot, trend: [...points.values()].sort((a, b) => a.windowDate.localeCompare(b.windowDate)) };
}

/** Compatibility adapter for delivery surfaces that have not yet adopted snapshot v2. */
export function agencySnapshotToGpmPayload(snapshot: AgencyReportSnapshotV2): GpmReportPayload {
  return {
    configId: snapshot.configId,
    domain: snapshot.domain,
    topic: snapshot.topic,
    location: snapshot.location,
    windowDate: snapshot.windowDate,
    platform: 'combined',
    modelId: '',
    reportedAt: snapshot.reportedAt,
    citationRate: snapshot.combinedVisibilityPct,
    shareOfVoice: snapshot.combinedVisibilityPct,
    queryCoverage: 1,
    visibilityPct: snapshot.combinedVisibilityPct,
    industryRank: null,
    prompts: snapshot.questions.map((question) => {
      const results = Object.values(question.results);
      const ranks = results
        .map((result) => result?.rankPosition)
        .filter((rank): rank is number => typeof rank === 'number');
      return {
        queryKey: question.queryKey,
        queryText: question.queryText,
        cited: question.citedByEngines > 0,
        rankPosition: ranks.length > 0 ? Math.min(...ranks) : null,
        topCompetitorInQuery: results.find((result) => result?.topCompetitorInQuery)?.topCompetitorInQuery ?? null,
      };
    }),
    competitors: snapshot.competitors.map((competitor) => ({
      name: competitor.name,
      citationCount: competitor.appearedInsteadCount,
      totalQueries: snapshot.evaluationsTracked,
    })),
    opportunities: snapshot.opportunities.map((question) => ({
      queryText: question.queryText,
      topCompetitorInQuery: Object.values(question.results)
        .find((result) => result?.topCompetitorInQuery)?.topCompetitorInQuery ?? null,
    })),
  };
}

/** Fail-soft reader for JSONB report metadata used by public and dashboard renderers. */
export function readAgencyReportSnapshot(value: unknown): AgencyReportSnapshotV2 | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    row['version'] !== '2'
    || typeof row['profileVersion'] !== 'string'
    || typeof row['configId'] !== 'string'
    || typeof row['clientName'] !== 'string'
    || typeof row['domain'] !== 'string'
    || typeof row['topic'] !== 'string'
    || typeof row['location'] !== 'string'
    || typeof row['windowDate'] !== 'string'
    || typeof row['reportedAt'] !== 'string'
    || typeof row['combinedVisibilityPct'] !== 'number'
    || !Array.isArray(row['engines'])
    || !Array.isArray(row['availableEngines'])
    || !Array.isArray(row['availableQuestions'])
    || !Array.isArray(row['questions'])
    || !Array.isArray(row['availableCompetitors'])
    || !Array.isArray(row['trend'])
    || !row['settings']
    || typeof row['settings'] !== 'object'
    || !row['scope']
    || typeof row['scope'] !== 'object'
  ) return null;
  return value as AgencyReportSnapshotV2;
}

/** Recompute a draft preview from the stored evidence when an agency changes its presentation scope. */
export function applyReportSettingsToSnapshot(
  snapshot: AgencyReportSnapshotV2,
  settings: ReportSettings
): AgencyReportSnapshotV2 {
  const payloads: GpmReportPayload[] = snapshot.availableEngines.map((engine) => ({
    configId: snapshot.configId,
    domain: snapshot.domain,
    topic: snapshot.topic,
    location: snapshot.location,
    windowDate: snapshot.windowDate,
    platform: engine.key,
    modelId: '',
    reportedAt: snapshot.reportedAt,
    citationRate: engine.visibilityPct,
    shareOfVoice: engine.visibilityPct,
    queryCoverage: 1,
    visibilityPct: engine.visibilityPct,
    industryRank: null,
    prompts: snapshot.availableQuestions.flatMap((question) => {
      const result = question.results[engine.key];
      return result ? [result] : [];
    }),
    competitors: [],
    opportunities: [],
  }));
  const rebuilt = buildAgencyReportSnapshot({
    configId: snapshot.configId,
    clientName: snapshot.clientName,
    domain: snapshot.domain,
    topic: snapshot.topic,
    location: snapshot.location,
    windowDate: snapshot.windowDate,
    reportedAt: snapshot.reportedAt,
    payloads,
    sourceRunGroupIds: Object.fromEntries(snapshot.availableEngines.map((engine) => [engine.key, engine.sourceRunGroupId])),
    settings,
  });
  return rebuilt.profileVersion === snapshot.profileVersion
    ? { ...rebuilt, trend: snapshot.trend }
    : rebuilt;
}
