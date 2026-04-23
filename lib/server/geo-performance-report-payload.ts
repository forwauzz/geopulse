// Data shape for a GEO Performance Report covering one client config + one platform window.

export type GpmPromptRow = {
  readonly queryKey: string;
  readonly queryText: string;
  readonly cited: boolean;
  readonly rankPosition: number | null;
  // Per-platform slot: name of top competing domain in this query, if any
  readonly topCompetitorInQuery: string | null;
};

export type GpmCompetitorRow = {
  readonly name: string;           // brand name or domain
  readonly citationCount: number;  // queries where this competitor appeared
  readonly totalQueries: number;   // total queries in run (for %)
};

export type GpmReportPayload = {
  // Identity
  readonly configId: string;
  readonly domain: string;          // canonical domain
  readonly topic: string;
  readonly location: string;
  readonly windowDate: string;      // 'YYYY-MM' | 'YYYY-WNN'
  readonly platform: string;        // 'chatgpt' | 'gemini' | 'perplexity'
  readonly modelId: string;
  readonly reportedAt: string;      // ISO timestamp

  // Top-level visibility metrics (0–1 fractions)
  readonly citationRate: number;
  readonly shareOfVoice: number;
  readonly queryCoverage: number;
  readonly visibilityPct: number;   // platform-specific from metrics JSONB
  readonly industryRank: number | null;

  // Prompt-level breakdown
  readonly prompts: readonly GpmPromptRow[];

  // Competitor co-citations
  readonly competitors: readonly GpmCompetitorRow[];

  // Prompts where client was not cited (opportunities)
  readonly opportunities: readonly Pick<GpmPromptRow, 'queryText' | 'topCompetitorInQuery'>[];
};
