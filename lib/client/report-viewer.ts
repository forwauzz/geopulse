export type Issue = {
  check?: string;
  checkId?: string;
  finding?: string;
  fix?: string;
  weight?: number;
  passed?: boolean;
  status?: string;
  category?: string;
  confidence?: string;
  teamOwner?: string;
};

export type CategoryScore = {
  category: string;
  score: number;
  letterGrade: string;
  checkCount: number;
};

export type ScanResponse = {
  scanId: string;
  url: string;
  domain?: string | null;
  score: number | null;
  letterGrade: string | null;
  topIssues: Issue[];
  categoryScores: CategoryScore[];
  pdfUrl?: string | null;
  markdownUrl?: string | null;
  reportStatus?: 'none' | 'generating' | 'delivered';
  hasPaidReport?: boolean;
  startupWorkspaceId?: string | null;
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  viewerEmail?: string | null;
};

export type ViewState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; pdfUrl: string | null }
  | {
      phase: 'ready';
      markdown: string;
      scan: ScanResponse;
      pdfUrl: string | null;
    };

export type TocEntry = { id: string; text: string; level: number };

export type MarkdownSection = {
  id: string;
  title: string;
  content: string;
  defaultOpen: boolean;
};

export type SummaryFact = {
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
};

export type DisplayIssue = {
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  status: string | null;
  owner: string | null;
  problem: string | null;
  firstMove: string | null;
};

function shouldOpenByDefault(title: string): boolean {
  const titleLower = title.toLowerCase();
  if (
    titleLower.includes('executive summary') ||
    titleLower.includes('at a glance') ||
    titleLower.includes('immediate wins') ||
    titleLower.includes('priority action plan') ||
    titleLower.includes('question-answer readiness')
  ) {
    return true;
  }

  if (
    titleLower.includes('detailed check reference') ||
    titleLower.includes('page-level reference') ||
    titleLower.includes('technical appendix') ||
    titleLower.includes('coverage summary')
  ) {
    return false;
  }

  return false;
}

export const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI Readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand Coverage',
  conversion_readiness: 'Conversion',
};

export const CATEGORY_ICONS: Record<string, string> = {
  ai_readiness: 'smart_toy',
  extractability: 'edit_note',
  trust: 'verified_user',
  demand_coverage: 'query_stats',
  conversion_readiness: 'conversion_path',
};

export function slugify(text: string): string {
  const plain = typeof text === 'string' ? text : String(text);
  return plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function extractToc(md: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const text = m[2]?.trim() ?? '';
    const id = slugify(text);
    entries.push({ id, text, level: m[1]!.length });
  }
  return entries;
}

export function splitMarkdownSections(md: string): MarkdownSection[] {
  const lines = md.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentTitle = 'Overview';
  let currentLines: string[] = [];
  let initialized = false;

  const pushSection = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;
    const title = currentTitle.trim() || 'Section';
    const titleLower = title.toLowerCase();
    sections.push({
      id: slugify(title),
      title,
      content,
      defaultOpen: shouldOpenByDefault(title),
    });
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (initialized) pushSection();
      currentTitle = heading[1]?.trim() ?? 'Section';
      currentLines = [line];
      initialized = true;
      continue;
    }

    currentLines.push(line);
    initialized = true;
  }

  pushSection();
  return sections;
}

export function clampScore(score: number | null | undefined): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function categoryScoreTone(score: number): string {
  if (score >= 75) return 'bg-green-50 text-green-700';
  if (score >= 45) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

export function issueSeverity(weight: number | undefined): 'High' | 'Medium' | 'Low' {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

export function issueSeverityClasses(severity: ReturnType<typeof issueSeverity>): string {
  if (severity === 'High') return 'bg-red-100 text-red-800';
  if (severity === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

export function scoreNarrative(score: number): string {
  if (score >= 90) return 'Excellent readiness. Minor refinements only.';
  if (score >= 75) return 'Strong readiness. Close a few gaps to improve clarity.';
  if (score >= 55) return 'Mixed readiness. Key signals are missing or inconsistent.';
  if (score >= 35) return 'Low readiness. Address the critical gaps first.';
  return 'Critical readiness gaps. Prioritize the fixes below.';
}

export function buildSummaryFacts(scan: ScanResponse): SummaryFact[] {
  const issues = Array.isArray(scan.topIssues) ? [...scan.topIssues] : [];
  const sortedIssues = issues.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const topIssue = sortedIssues[0];
  const openIssues = sortedIssues.filter((issue) => {
    const status = issue.status?.toUpperCase();
    return status !== 'PASS' && status !== 'NOT_EVALUATED';
  }).length;

  const facts: SummaryFact[] = [
    {
      label: 'Open issues',
      value: String(openIssues),
      tone: openIssues >= 3 ? 'danger' : openIssues >= 1 ? 'warning' : 'success',
    },
  ];

  if (topIssue) {
    facts.push({
      label: 'Top blocker',
      value: topIssue.check ?? topIssue.checkId ?? 'Check',
      tone: 'danger',
    });
    if (topIssue.teamOwner) {
      facts.push({
        label: 'Primary owner',
        value: topIssue.teamOwner,
        tone: 'default',
      });
    }
  }

  if (topIssue?.fix) {
    facts.push({
      label: 'First move',
      value: topIssue.fix,
      tone: 'default',
    });
  }

  if (scan.categoryScores?.length) {
    const weakestCategory = [...scan.categoryScores].sort((a, b) => a.score - b.score)[0];
    if (weakestCategory) {
      facts.push({
        label: 'Weakest category',
        value: CATEGORY_LABELS[weakestCategory.category] ?? weakestCategory.category,
        tone: weakestCategory.score < 45 ? 'danger' : 'warning',
      });
    }
  }

  return facts.slice(0, 5);
}

export function buildDisplayIssues(scan: ScanResponse): DisplayIssue[] {
  const issues = Array.isArray(scan.topIssues) ? [...scan.topIssues] : [];

  return issues
    .filter((issue) => {
      const status = issue.status?.toUpperCase();
      return status !== 'PASS' && status !== 'NOT_EVALUATED';
    })
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 3)
    .map((issue) => ({
      title: issue.check ?? issue.checkId ?? 'Check',
      severity: issueSeverity(issue.weight),
      status: issue.status ?? null,
      owner: issue.teamOwner ?? null,
      problem: issue.finding ?? null,
      firstMove: issue.fix ?? null,
    }));
}
