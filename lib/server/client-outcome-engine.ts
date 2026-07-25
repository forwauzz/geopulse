import { canonicalizeDomain, engineForModelId, type EngineKey } from './dashboard-citation-metrics';

type SupabaseLike = { from(table: string): any };

export type OutcomeActionStatus = 'pending' | 'completed';

export type OutcomeActionEvent = {
  readonly actionKey: string;
  readonly status: OutcomeActionStatus;
  readonly at: string;
  readonly byUserId: string;
};

export type OutcomeAction = {
  readonly key: string;
  readonly title: string;
  readonly why: string;
  readonly nextStep: string;
  readonly impact: 'high' | 'medium' | 'low';
  readonly effort: 'small' | 'medium' | 'large';
  readonly status: OutcomeActionStatus;
  readonly completedAt: string | null;
  readonly source: 'website_audit' | 'visibility_prompt';
};

export type OutcomeEngineView = {
  readonly measured: boolean;
  readonly visibilityPct: number | null;
  readonly previousVisibilityPct: number | null;
  readonly deltaPct: number | null;
  readonly trend: 'improved' | 'regressed' | 'unchanged' | 'baseline';
  readonly measuredAt: string | null;
  readonly previousMeasuredAt: string | null;
  readonly engines: ReadonlyArray<{
    readonly engine: EngineKey;
    readonly modelId: string;
    readonly visibilityPct: number;
    readonly previousVisibilityPct: number | null;
    readonly measuredAt: string | null;
  }>;
  readonly actions: readonly OutcomeAction[];
  readonly executiveSummary: string;
  readonly methodology: string;
};

type AuditIssue = {
  readonly checkId: string;
  readonly check: string;
  readonly passed: boolean;
  readonly weight: number;
  readonly finding: string;
  readonly fix: string | null;
};

function asIssues(raw: unknown): AuditIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const checkId = typeof row['checkId'] === 'string' ? row['checkId'] : '';
    const check = typeof row['check'] === 'string' ? row['check'] : checkId;
    if (!checkId && !check) return [];
    return [{
      checkId: checkId || check,
      check: check || checkId,
      passed: row['passed'] === true,
      weight: typeof row['weight'] === 'number' ? row['weight'] : 0,
      finding: typeof row['finding'] === 'string' ? row['finding'] : '',
      fix: typeof row['fix'] === 'string' ? row['fix'] : null,
    }];
  });
}

function extractIssues(scan: { issues_json?: unknown; full_results_json?: unknown } | null): AuditIssue[] {
  if (!scan) return [];
  if (scan.full_results_json && typeof scan.full_results_json === 'object') {
    const full = scan.full_results_json as Record<string, unknown>;
    const issues = asIssues(full['issues']);
    if (issues.length > 0) return issues;
    const all = asIssues(full['allIssues']);
    if (all.length > 0) return all;
  }
  return asIssues(scan.issues_json);
}

function effortForCheck(checkId: string): OutcomeAction['effort'] {
  if (/robots|llms|title|meta|open-graph/i.test(checkId)) return 'small';
  if (/jsonld|schema|faq|author|entity/i.test(checkId)) return 'medium';
  return 'large';
}

function whyForIssue(issue: AuditIssue): string {
  if (/robots|access|crawl/i.test(issue.checkId)) {
    return 'AI retrieval systems need to access the page before its claims can be considered.';
  }
  if (/jsonld|schema|entity/i.test(issue.checkId)) {
    return 'Clear entity and service markup reduces ambiguity when an AI system interprets the business.';
  }
  if (/author|trust|e-e-a-t|citation/i.test(issue.checkId)) {
    return 'Visible ownership and supporting evidence make the page easier to verify and cite.';
  }
  if (/title|heading|content|faq/i.test(issue.checkId)) {
    return 'Explicit, well-structured answers make the page easier to match to buyer questions.';
  }
  return issue.finding || 'This audit finding affects how reliably AI systems can retrieve and understand the page.';
}

function actionState(
  key: string,
  events: readonly OutcomeActionEvent[]
): Pick<OutcomeAction, 'status' | 'completedAt'> {
  const latest = [...events].reverse().find((event) => event.actionKey === key);
  return {
    status: latest?.status ?? 'pending',
    completedAt: latest?.status === 'completed' ? latest.at : null,
  };
}

function roundPct(value: number): number {
  return Math.round(value * 1000) / 10;
}

export function buildOutcomeActions(args: {
  readonly scan: { issues_json?: unknown; full_results_json?: unknown } | null;
  readonly uncitedPrompts: readonly string[];
  readonly events: readonly OutcomeActionEvent[];
}): OutcomeAction[] {
  const auditActions = extractIssues(args.scan)
    .filter((issue) => !issue.passed)
    .sort((a, b) => b.weight - a.weight)
    .map((issue) => {
      const key = `audit:${issue.checkId}`;
      return {
        key,
        title: issue.check,
        why: whyForIssue(issue),
        nextStep: issue.fix || 'Review the finding and update the affected page.',
        impact: issue.weight >= 8 ? 'high' as const : issue.weight >= 4 ? 'medium' as const : 'low' as const,
        effort: effortForCheck(issue.checkId),
        source: 'website_audit' as const,
        ...actionState(key, args.events),
      };
    });

  const promptActions = args.uncitedPrompts.slice(0, 4).map((prompt, index) => {
    const key = `prompt:${prompt.trim().toLowerCase()}`;
    return {
      key,
      title: `Build a clear answer for “${prompt}”`,
      why: 'The latest blind measurement did not find this brand in the AI answer.',
      nextStep: 'Publish a specific, evidence-backed answer on the most relevant service page and cite verifiable proof.',
      impact: index < 2 ? 'high' as const : 'medium' as const,
      effort: 'medium' as const,
      source: 'visibility_prompt' as const,
      ...actionState(key, args.events),
    };
  });

  const impactRank = { high: 3, medium: 2, low: 1 };
  const effortRank = { small: 1, medium: 2, large: 3 };
  return [...auditActions, ...promptActions]
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return (impactRank[b.impact] - effortRank[b.effort]) - (impactRank[a.impact] - effortRank[a.effort]);
    })
    .slice(0, 8);
}

export async function loadClientOutcomeEngine(args: {
  readonly supabase: SupabaseLike;
  readonly domain: string;
  readonly configMetadata?: Record<string, unknown> | null;
  readonly latestScan?: { issues_json?: unknown; full_results_json?: unknown } | null;
}): Promise<OutcomeEngineView> {
  const canonical = canonicalizeDomain(args.domain);
  const eventsRaw = args.configMetadata?.['outcome_action_events'];
  const events = Array.isArray(eventsRaw)
    ? eventsRaw.filter((event): event is OutcomeActionEvent => {
        if (!event || typeof event !== 'object') return false;
        const row = event as Record<string, unknown>;
        return typeof row['actionKey'] === 'string'
          && (row['status'] === 'pending' || row['status'] === 'completed')
          && typeof row['at'] === 'string'
          && typeof row['byUserId'] === 'string';
      })
    : [];

  const empty = (actions: OutcomeAction[]): OutcomeEngineView => ({
    measured: false,
    visibilityPct: null,
    previousVisibilityPct: null,
    deltaPct: null,
    trend: 'baseline',
    measuredAt: null,
    previousMeasuredAt: null,
    engines: [],
    actions,
    executiveSummary: actions.length > 0
      ? `Start with “${actions[0]!.title}”. Visibility change will appear after the next measured recheck.`
      : 'Run the first visibility check to establish a measurable baseline.',
    methodology: 'No AI visibility result is shown until a real blind provider run has completed.',
  });

  const initialActions = buildOutcomeActions({ scan: args.latestScan ?? null, uncitedPrompts: [], events });
  if (!canonical) return empty(initialActions);

  try {
    const { data: domainRow } = await args.supabase
      .from('benchmark_domains')
      .select('id')
      .eq('canonical_domain', canonical)
      .maybeSingle();
    if (!domainRow?.id) return empty(initialActions);

    const { data: metricRows } = await args.supabase
      .from('benchmark_domain_metrics')
      .select('run_group_id,model_id,citation_rate,metrics,computed_at')
      .eq('domain_id', domainRow.id)
      .order('computed_at', { ascending: false })
      .limit(80);

    const rows = ((metricRows ?? []) as Array<{
      run_group_id: string;
      model_id: string;
      citation_rate: number | null;
      metrics: Record<string, unknown> | null;
      computed_at: string | null;
    }>).filter((row) =>
      typeof row.citation_rate === 'number'
      && row.metrics?.['run_mode'] === 'blind_discovery'
      && typeof row.metrics?.['completed_runs'] === 'number'
      && row.metrics['completed_runs'] > 0
      && engineForModelId(row.model_id) !== null
    );

    const latestByEngine = new Map<EngineKey, typeof rows>();
    for (const row of rows) {
      const engine = engineForModelId(row.model_id)!;
      const bucket = latestByEngine.get(engine) ?? [];
      if (bucket.length < 2) bucket.push(row);
      latestByEngine.set(engine, bucket);
    }

    const engines = [...latestByEngine.entries()].map(([engine, bucket]) => ({
      engine,
      modelId: bucket[0]!.model_id,
      visibilityPct: roundPct(bucket[0]!.citation_rate!),
      previousVisibilityPct: bucket[1] ? roundPct(bucket[1].citation_rate!) : null,
      measuredAt: bucket[0]!.computed_at,
    }));
    if (engines.length === 0) return empty(initialActions);

    const latestRunIds = engines.map((engine) => latestByEngine.get(engine.engine)![0]!.run_group_id);
    const { data: latestRuns } = await args.supabase
      .from('query_runs')
      .select('id,query_id,run_group_id,status')
      .in('run_group_id', latestRunIds)
      .eq('status', 'completed');
    const completedRuns = (latestRuns ?? []) as Array<{ id: string; query_id: string }>;
    const runIds = completedRuns.map((run) => run.id);
    const { data: citations } = runIds.length > 0
      ? await args.supabase
          .from('query_citations')
          .select('query_run_id,cited_domain')
          .in('query_run_id', runIds)
          .eq('cited_domain', canonical)
      : { data: [] };
    const citedRunIds = new Set(((citations ?? []) as Array<{ query_run_id: string }>).map((row) => row.query_run_id));
    const uncitedQueryIds = Array.from(new Set(completedRuns.filter((run) => !citedRunIds.has(run.id)).map((run) => run.query_id)));
    const { data: queries } = uncitedQueryIds.length > 0
      ? await args.supabase.from('benchmark_queries').select('id,query_text').in('id', uncitedQueryIds)
      : { data: [] };
    const uncitedPrompts = ((queries ?? []) as Array<{ query_text: string }>).map((row) => row.query_text);
    const actions = buildOutcomeActions({ scan: args.latestScan ?? null, uncitedPrompts, events });

    const latestValues = engines.map((engine) => engine.visibilityPct);
    const previousValues = engines
      .map((engine) => engine.previousVisibilityPct)
      .filter((value): value is number => value !== null);
    const visibilityPct = roundPct(latestValues.reduce((sum, value) => sum + value, 0) / latestValues.length / 100);
    const previousVisibilityPct = previousValues.length === engines.length
      ? roundPct(previousValues.reduce((sum, value) => sum + value, 0) / previousValues.length / 100)
      : null;
    const deltaPct = previousVisibilityPct === null ? null : Math.round((visibilityPct - previousVisibilityPct) * 10) / 10;
    const trend = deltaPct === null ? 'baseline' : deltaPct > 0 ? 'improved' : deltaPct < 0 ? 'regressed' : 'unchanged';
    const pending = actions.filter((action) => action.status === 'pending');
    const completed = actions.filter((action) => action.status === 'completed').length;
    const trendText = trend === 'baseline'
      ? `The first measured baseline is ${visibilityPct}%.`
      : `Visibility ${trend} by ${Math.abs(deltaPct!)} percentage points to ${visibilityPct}%.`;

    return {
      measured: true,
      visibilityPct,
      previousVisibilityPct,
      deltaPct,
      trend,
      measuredAt: engines.map((engine) => engine.measuredAt).filter(Boolean).sort().at(-1) ?? null,
      previousMeasuredAt: null,
      engines,
      actions,
      executiveSummary: `${trendText} ${pending.length > 0 ? `Next: ${pending[0]!.title}.` : 'No measured action remains open.'}${completed > 0 ? ` ${completed} action${completed === 1 ? '' : 's'} completed.` : ''}`,
      methodology: 'Visibility is the share of completed blind buyer-question runs in which the measured domain was cited. Provider, model, raw response, citation evidence, and timestamp remain attached to each run.',
    };
  } catch {
    return empty(initialActions);
  }
}
