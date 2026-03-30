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
      defaultOpen:
        titleLower.includes('executive summary') || titleLower.includes('priority action plan'),
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
