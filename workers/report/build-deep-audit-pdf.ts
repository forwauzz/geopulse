import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { CategoryScorePayload, DeepAuditReportPayload } from './deep-audit-report-payload';
import {
  customerFacingFinding,
  deriveDemandCoverageSignals,
  parseCoverageSummary,
  parseIssues,
  scoreNarrative,
  severityLabel,
  summarizePageIssuePatterns,
  type IssueRow,
} from './deep-audit-report-helpers';

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function severityColor(sev: 'High' | 'Medium' | 'Low'): RGB {
  if (sev === 'High') return rgb(0.62, 0.25, 0.24);
  if (sev === 'Medium') return rgb(0.6, 0.45, 0.15);
  return rgb(0.34, 0.37, 0.45);
}

function issueStatusLabel(row: IssueRow): string {
  return row.status ?? (row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—');
}

function issueStatusColor(status: string): RGB {
  switch (status) {
    case 'PASS':
      return PASS_GREEN;
    case 'WARNING':
      return rgb(0.6, 0.45, 0.15);
    case 'LOW_CONFIDENCE':
      return rgb(0.42, 0.42, 0.42);
    case 'BLOCKED':
      return rgb(0.42, 0.31, 0.52);
    case 'NOT_EVALUATED':
      return MUTED;
    default:
      return FAIL_RED;
  }
}

function ownerLabel(row: IssueRow): string {
  return row.teamOwner ?? 'Unassigned';
}

function enrichIssues(primary: IssueRow[], fallback: IssueRow[]): IssueRow[] {
  const fallbackByKey = new Map<string, IssueRow>();
  for (const row of fallback) {
    const key = row.checkId ?? row.check ?? '';
    if (key && !fallbackByKey.has(key)) {
      fallbackByKey.set(key, row);
    }
  }

  return primary.map((row) => {
    const key = row.checkId ?? row.check ?? '';
    const base = key ? fallbackByKey.get(key) : undefined;
    if (!base) return row;
    return {
      ...base,
      ...row,
      teamOwner: row.teamOwner ?? base.teamOwner,
      finding: row.finding ?? base.finding,
      fix: row.fix ?? base.fix,
      weight: row.weight ?? base.weight,
    };
  });
}

const INK = rgb(0.17, 0.2, 0.21);
const MUTED = rgb(0.35, 0.38, 0.39);
const PRIMARY = rgb(0.34, 0.37, 0.45);
const WHITE = rgb(1, 1, 1);
const PASS_GREEN = rgb(0.15, 0.5, 0.3);
const FAIL_RED = rgb(0.62, 0.25, 0.24);
const SURFACE = rgb(0.945, 0.953, 0.953);
const ROW_ALT = rgb(0.96, 0.965, 0.965);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const MAX_W = PAGE_W - MARGIN * 2;

export type DeepAuditPageSummaryInput = {
  readonly url: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly issuesJson: unknown;
};

class PdfBuilder {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private fontBold!: PDFFont;
  private page!: PDFPage;
  private y = PAGE_H - MARGIN;
  private pageNum = 0;
  private footerLeft = '';
  private footerRight = '';

  async init(footerLeft: string, footerRight: string): Promise<void> {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fontBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.footerLeft = footerLeft;
    this.footerRight = footerRight;
    this.newPage();
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.pageNum += 1;
  }

  private ensureSpace(needed: number): void {
    if (this.y < MARGIN + needed) {
      this.drawPageFooter();
      this.newPage();
    }
  }

  private drawPageFooter(): void {
    const y = 25;
    this.page.drawText(this.footerLeft, { x: MARGIN, y, size: 7, font: this.font, color: MUTED });
    const numText = `Page ${String(this.pageNum)}`;
    const numW = this.font.widthOfTextAtSize(numText, 7);
    this.page.drawText(numText, { x: (PAGE_W - numW) / 2, y, size: 7, font: this.font, color: MUTED });
    const rW = this.font.widthOfTextAtSize(this.footerRight, 7);
    this.page.drawText(this.footerRight, { x: PAGE_W - MARGIN - rW, y, size: 7, font: this.font, color: MUTED });
  }

  drawCoverPage(domain: string, score: number, grade: string, date: string): void {
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PRIMARY });

    const logoY = PAGE_H - 80;
    this.page.drawText('GEO-Pulse', { x: MARGIN, y: logoY, size: 28, font: this.fontBold, color: WHITE });
    this.page.drawText('AI Search Readiness Report', { x: MARGIN, y: logoY - 30, size: 12, font: this.font, color: rgb(0.85, 0.87, 0.9) });

    this.page.drawLine({ start: { x: MARGIN, y: logoY - 50 }, end: { x: PAGE_W - MARGIN, y: logoY - 50 }, thickness: 0.5, color: rgb(0.55, 0.58, 0.65) });

    const domainY = PAGE_H / 2 + 40;
    this.page.drawText(domain, { x: MARGIN, y: domainY, size: 36, font: this.fontBold, color: WHITE });
    this.page.drawText(date, { x: MARGIN, y: domainY - 30, size: 11, font: this.font, color: rgb(0.8, 0.82, 0.85) });

    const scoreStr = String(score);
    const scoreW = this.fontBold.widthOfTextAtSize(scoreStr, 72);
    const scoreX = PAGE_W - MARGIN - scoreW - 20;
    const scoreY = 140;
    this.page.drawText(scoreStr, { x: scoreX, y: scoreY, size: 72, font: this.fontBold, color: WHITE });
    this.page.drawText('/ 100', { x: scoreX + scoreW + 6, y: scoreY + 10, size: 16, font: this.font, color: rgb(0.8, 0.82, 0.85) });

    const gradeR = 28;
    const gradeCX = MARGIN + gradeR + 10;
    const gradeCY = 155;
    this.page.drawCircle({ x: gradeCX, y: gradeCY, size: gradeR, color: rgb(0.45, 0.48, 0.55) });
    const gradeW = this.fontBold.widthOfTextAtSize(grade, 22);
    this.page.drawText(grade, { x: gradeCX - gradeW / 2, y: gradeCY - 8, size: 22, font: this.fontBold, color: WHITE });

    this.page.drawText('This report reflects technical signals relevant to AI search readiness.', {
      x: MARGIN, y: 80, size: 8, font: this.font, color: rgb(0.7, 0.72, 0.75),
    });

    this.drawPageFooter();
    this.newPage();
  }

  drawSectionTitle(title: string): void {
    this.ensureSpace(40);
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: 24, color: SURFACE });
    this.page.drawText(title, { x: MARGIN + 8, y: this.y + 4, size: 13, font: this.fontBold, color: INK });
    this.y -= 32;
  }

  drawText(text: string, size: number, bold = false, color: RGB = INK, indent = 0): void {
    const f = bold ? this.fontBold : this.font;
    const maxChars = Math.floor((MAX_W - indent) / (size * 0.52));
    const lines = wrapLine(text, maxChars);
    for (const line of lines) {
      this.ensureSpace(size + 6);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font: f, color });
      this.y -= size + 4;
    }
  }

  drawExecutiveSummary(narrative: string, topIssues: IssueRow[]): void {
    this.drawSectionTitle('Executive Summary');
    this.drawText(narrative, 10, false, INK);
    this.y -= 8;

    if (topIssues.length > 0) {
      this.drawText('Top priorities:', 10, true, INK);
      this.y -= 4;
      for (let i = 0; i < topIssues.length; i += 1) {
        const issue = topIssues[i]!;
        const sev = severityLabel(issue.weight);
        const sevClr = severityColor(sev);
        const num = String(i + 1).padStart(2, '0');
        this.ensureSpace(30);

        this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: MAX_W, height: 22, color: ROW_ALT });
        this.page.drawText(`${num}.`, { x: MARGIN + 4, y: this.y, size: 9, font: this.fontBold, color: MUTED });
        this.page.drawText(`[${sev}]`, { x: MARGIN + 24, y: this.y, size: 8, font: this.fontBold, color: sevClr });
        this.page.drawText(issue.check ?? issue.checkId ?? 'Check', { x: MARGIN + 70, y: this.y, size: 9, font: this.fontBold, color: INK });
        this.y -= 22;

        const finding = customerFacingFinding(issue);
        if (finding) {
          this.drawText(finding, 8, false, MUTED, 70);
        }
        this.y -= 4;
      }
    }
    this.y -= 8;
  }

  drawAtAGlance(input: {
    score: number;
    grade: string;
    passedChecks: number;
    totalChecks: number;
    topIssue?: IssueRow;
    firstMove?: string;
  }): void {
    this.drawSectionTitle('At a Glance');
    const rows: string[] = [
      `Overall score: ${String(input.score)}/100 (${input.grade})`,
      `Checks passed: ${String(input.passedChecks)} of ${String(input.totalChecks)}`,
    ];
    if (input.topIssue) {
      rows.push(`Top blocker: ${input.topIssue.check ?? input.topIssue.checkId ?? 'Check'}`);
      rows.push(`Primary owner: ${ownerLabel(input.topIssue)}`);
    }
    if (input.firstMove) {
      rows.push(`First recommended move: ${input.firstMove}`);
    }

    for (const row of rows) {
      this.ensureSpace(24);
      this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: MAX_W, height: 18, color: ROW_ALT });
      this.page.drawText(row, { x: MARGIN + 8, y: this.y, size: 9, font: this.font, color: INK });
      this.y -= 24;
    }
    this.y -= 8;
  }

  drawScoreBreakdown(issues: IssueRow[]): void {
    this.drawSectionTitle('Detailed Check Reference');
    this.y -= 4;

    this.ensureSpace(16);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: 16, color: PRIMARY });
    const headers = [
      { text: 'Check', x: MARGIN + 4, w: 200 },
      { text: 'Status', x: MARGIN + 220, w: 50 },
      { text: 'Weight', x: MARGIN + 280, w: 40 },
      { text: 'Finding', x: MARGIN + 330, w: 180 },
    ];
    for (const h of headers) {
      this.page.drawText(h.text, { x: h.x, y: this.y + 1, size: 8, font: this.fontBold, color: WHITE });
    }
    this.y -= 20;

    for (let i = 0; i < issues.length; i += 1) {
      const row = issues[i]!;
      const rowH = 16;
      this.ensureSpace(rowH + 4);

      if (i % 2 === 0) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: rowH, color: ROW_ALT });
      }

      const name = (row.check ?? row.checkId ?? 'Check').slice(0, 40);
      const status = issueStatusLabel(row);
      const statusClr = issueStatusColor(status);
      const weight = String(row.weight ?? 0);
      const finding = customerFacingFinding(row).slice(0, 70);

      this.page.drawText(name, { x: MARGIN + 4, y: this.y, size: 8, font: this.font, color: INK });
      this.page.drawText(status, { x: MARGIN + 220, y: this.y, size: 8, font: this.fontBold, color: statusClr });
      this.page.drawText(weight, { x: MARGIN + 280, y: this.y, size: 8, font: this.font, color: MUTED });
      this.page.drawText(finding, { x: MARGIN + 330, y: this.y, size: 7, font: this.font, color: MUTED });
      this.y -= rowH + 2;
    }
    this.y -= 8;
  }

  drawActionPlan(failedIssues: IssueRow[]): void {
    if (failedIssues.length === 0) return;
    this.drawSectionTitle('Priority Action Plan');
    this.drawText(
      'Focus on these actions first before moving into lower-signal cleanup or broad content expansion.',
      9,
      false,
      MUTED
    );
    this.y -= 4;

    for (let i = 0; i < failedIssues.length; i += 1) {
      const issue = failedIssues[i]!;
      const num = String(i + 1).padStart(2, '0');
      const sev = severityLabel(issue.weight);
      const sevClr = severityColor(sev);
      const finding = customerFacingFinding(issue);

      this.ensureSpace(76);
      this.page.drawRectangle({ x: MARGIN, y: this.y - 34, width: MAX_W, height: 70, color: ROW_ALT, borderColor: SURFACE, borderWidth: 0.5 });

      this.page.drawText(num, { x: MARGIN + 8, y: this.y, size: 20, font: this.fontBold, color: rgb(0.75, 0.78, 0.8) });
      this.page.drawText(issue.check ?? issue.checkId ?? 'Check', { x: MARGIN + 44, y: this.y + 4, size: 10, font: this.fontBold, color: INK });
      this.page.drawText(`[${sev}]`, { x: MARGIN + 44, y: this.y - 10, size: 7, font: this.fontBold, color: sevClr });
      this.page.drawText(`Owner: ${ownerLabel(issue)}`, { x: MARGIN + 100, y: this.y - 10, size: 8, font: this.fontBold, color: PRIMARY });

      if (finding) {
        const whyLines = wrapLine(`Why it matters: ${finding}`, 72);
        this.page.drawText(whyLines[0] ?? '', { x: MARGIN + 44, y: this.y - 24, size: 8, font: this.font, color: MUTED });
        if (whyLines[1]) {
          this.page.drawText(whyLines[1], { x: MARGIN + 44, y: this.y - 36, size: 8, font: this.font, color: MUTED });
        }
      }
      if (issue.fix) {
        const fixLines = wrapLine(`First move: ${issue.fix}`, 72);
        this.page.drawText(fixLines[0] ?? '', { x: MARGIN + 44, y: this.y - 48, size: 8, font: this.font, color: INK });
        if (fixLines[1]) {
          this.page.drawText(fixLines[1], { x: MARGIN + 44, y: this.y - 60, size: 8, font: this.font, color: INK });
        }
      }
      this.y -= 78;
    }
    this.y -= 8;
  }

  drawCoverageSummary(rawCoverage: unknown): void {
    const coverage = parseCoverageSummary(rawCoverage);
    if (!coverage) return;

    this.drawSectionTitle('Coverage Summary');
    const rows: Array<[string, string]> = [];
    if (coverage['seed_url'] !== undefined) rows.push(['Seed URL', String(coverage['seed_url'])]);
    if (coverage['urls_planned'] !== undefined) rows.push(['URLs planned', String(coverage['urls_planned'])]);
    if (coverage['pages_fetched'] !== undefined) rows.push(['Pages fetched', String(coverage['pages_fetched'])]);
    if (coverage['pages_errored'] !== undefined) rows.push(['Pages errored', String(coverage['pages_errored'])]);
    if (coverage['robots_status'] !== undefined) rows.push(['robots.txt status', String(coverage['robots_status'])]);
    if (coverage['crawl_delay_ms'] !== undefined) rows.push(['Crawl delay', `${String(coverage['crawl_delay_ms'])}ms`]);
    if (coverage['chunk_size'] !== undefined) rows.push(['Chunk size', String(coverage['chunk_size'])]);
    if (coverage['chunks_processed'] !== undefined) rows.push(['Chunks processed', String(coverage['chunks_processed'])]);
    if (coverage['urls_remaining'] !== undefined) rows.push(['URLs remaining at completion', String(coverage['urls_remaining'])]);
    if (coverage['browser_render_mode'] !== undefined) rows.push(['Browser rendering mode', String(coverage['browser_render_mode'])]);
    if (coverage['browser_render_attempted'] !== undefined) rows.push(['Browser render attempts', String(coverage['browser_render_attempted'])]);
    if (coverage['browser_render_succeeded'] !== undefined) rows.push(['Browser render successes', String(coverage['browser_render_succeeded'])]);
    if (coverage['browser_render_failed'] !== undefined) rows.push(['Browser render fallbacks', String(coverage['browser_render_failed'])]);

    for (const [label, value] of rows) {
      this.drawText(`${label}: ${value}`, 9, false, INK);
    }
    this.y -= 8;
  }

  drawDemandCoverage(allIssues: readonly IssueRow[]): void {
    const signals = deriveDemandCoverageSignals(allIssues);
    if (signals.length === 0) return;

    this.drawSectionTitle('Question-Answer Readiness');
    this.drawText(
      'This section summarizes whether key pages are currently shaped to answer likely buyer questions clearly enough for machine retrieval and reuse.',
      9,
      false,
      INK
    );
    this.y -= 4;

    for (const signal of signals) {
      this.drawText(`${signal.title} [${signal.status}]`, 9, true, INK);
      this.drawText(signal.summary, 8, false, MUTED, 12);
      if (signal.firstMove) {
        this.drawText(`First move: ${signal.firstMove}`, 8, false, INK, 12);
      }
      this.y -= 4;
    }
    this.y -= 8;
  }

  drawRepeatedPagePatterns(
    summaries: readonly { url: string; issues: readonly IssueRow[] }[]
  ): void {
    const patterns = summarizePageIssuePatterns(
      summaries.map((summary) => ({ url: summary.url, issuesJson: summary.issues }))
    );
    if (patterns.length === 0) return;

    this.drawSectionTitle('Repeated Page Patterns');
    for (const pattern of patterns) {
      this.drawText(
        `${pattern.checkName} appears on ${String(pattern.affectedPages)} pages.`,
        9,
        true,
        INK
      );
      if (pattern.sampleFinding) {
        this.drawText(pattern.sampleFinding, 8, false, MUTED, 12);
      }
      this.drawText(`Sample pages: ${pattern.sampleUrls.join(', ')}`, 8, false, MUTED, 12);
      this.y -= 4;
    }
    this.y -= 8;
  }

  drawTechnicalAppendix(appendix: DeepAuditReportPayload['technicalAppendix'], rawCoverage: unknown): void {
    const coverage = parseCoverageSummary(rawCoverage);
    if (!appendix && !coverage) return;

    this.drawSectionTitle('Technical Appendix');
    if (appendix?.robotsSummary) this.drawText(`Robots / AI crawler access: ${appendix.robotsSummary}`, 9, false, INK);
    if (appendix?.schemaSummary) this.drawText(`Schema findings: ${appendix.schemaSummary}`, 9, false, INK);
    if (appendix?.headersSummary) this.drawText(`Security headers: ${appendix.headersSummary}`, 9, false, INK);
    if (coverage) {
      this.drawText(`Coverage payload: ${JSON.stringify(coverage)}`, 8, false, MUTED);
    }
    this.y -= 8;
  }

  drawPageSummaries(pages: { url: string; score: number | null; grade: string | null; issues: IssueRow[] }[]): void {
    if (pages.length <= 1) return;
    this.drawSectionTitle('Page-Level Reference');
    this.y -= 4;

    for (const pg of pages) {
      this.ensureSpace(30);
      const sc = pg.score !== null ? `${String(pg.score)}/100 (${pg.grade ?? '—'})` : '—';
      this.drawText(`${pg.url}  —  ${sc}`, 9, true, PRIMARY);
      this.y -= 2;

      if (pg.issues.length === 0) {
        this.drawText('No issues recorded for this page.', 8, false, MUTED, 12);
      } else {
        for (const row of pg.issues) {
          const status = issueStatusLabel(row);
          const statusClr = issueStatusColor(status);
          this.ensureSpace(14);
          this.page.drawText(`[${status}]`, { x: MARGIN + 12, y: this.y, size: 7, font: this.fontBold, color: statusClr });
          this.page.drawText((row.check ?? row.checkId ?? 'Check').slice(0, 50), { x: MARGIN + 50, y: this.y, size: 8, font: this.font, color: INK });
          this.y -= 14;
        }
      }
      this.y -= 8;
    }
  }

  drawCategoryBreakdown(cats: readonly CategoryScorePayload[]): void {
    if (cats.length === 0) return;
    this.drawSectionTitle('Category Breakdown');
    this.y -= 4;

    const labels: Record<string, string> = {
      ai_readiness: 'AI Readiness',
      extractability: 'Extractability',
      trust: 'Trust',
      demand_coverage: 'Demand Coverage',
      conversion_readiness: 'Conversion Readiness',
    };

    this.ensureSpace(16);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: 16, color: PRIMARY });
    const cols = [
      { text: 'Category', x: MARGIN + 4 },
      { text: 'Score', x: MARGIN + 220 },
      { text: 'Grade', x: MARGIN + 280 },
      { text: 'Checks', x: MARGIN + 340 },
    ];
    for (const c of cols) {
      this.page.drawText(c.text, { x: c.x, y: this.y + 1, size: 8, font: this.fontBold, color: WHITE });
    }
    this.y -= 20;

    for (let i = 0; i < cats.length; i += 1) {
      const cs = cats[i]!;
      const rowH = 16;
      this.ensureSpace(rowH + 4);
      if (i % 2 === 0) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: rowH, color: ROW_ALT });
      }
      const label = labels[cs.category] ?? cs.category;
      const hasScore = cs.score >= 0 && cs.checkCount > 0;
      const scoreStr = hasScore ? String(cs.score) : '—';
      const gradeStr = hasScore ? cs.letterGrade : 'N/A';
      const scoreClr = hasScore ? (cs.score >= 75 ? PASS_GREEN : cs.score >= 45 ? rgb(0.6, 0.45, 0.15) : FAIL_RED) : MUTED;

      this.page.drawText(label, { x: MARGIN + 4, y: this.y, size: 8, font: this.font, color: INK });
      this.page.drawText(scoreStr, { x: MARGIN + 220, y: this.y, size: 8, font: this.fontBold, color: scoreClr });
      this.page.drawText(gradeStr, { x: MARGIN + 280, y: this.y, size: 8, font: this.fontBold, color: scoreClr });
      this.page.drawText(String(cs.checkCount), { x: MARGIN + 340, y: this.y, size: 8, font: this.font, color: MUTED });
      this.y -= rowH + 2;
    }
    this.y -= 8;
  }

  drawDisclaimer(): void {
    this.ensureSpace(30);
    this.y -= 12;
    this.page.drawLine({ start: { x: MARGIN, y: this.y + 6 }, end: { x: PAGE_W - MARGIN, y: this.y + 6 }, thickness: 0.5, color: SURFACE });
    this.drawText(
      'This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations.',
      8, false, MUTED,
    );
  }

  async save(): Promise<Uint8Array> {
    this.drawPageFooter();
    return this.doc.save();
  }
}

/**
 * Build branded PDF for a paid deep-audit report.
 */
export async function buildDeepAuditPdf(input: {
  url: string;
  domain: string;
  score: number | null;
  letterGrade: string | null;
  issuesJson: unknown;
  highlightedIssues?: unknown;
  pageSummaries?: readonly DeepAuditPageSummaryInput[];
  categoryScores?: readonly CategoryScorePayload[];
  coverageSummary?: unknown;
  technicalAppendix?: DeepAuditReportPayload['technicalAppendix'];
  scanId?: string;
}): Promise<Uint8Array> {
  const score = input.score ?? 0;
  const grade = input.letterGrade ?? '—';
  const issues = parseIssues(input.issuesJson);
  const allIssues = issues.length > 0 ? issues : (input.pageSummaries?.[0] ? parseIssues(input.pageSummaries[0].issuesJson) : []);
  const highlightedIssues = enrichIssues(parseIssues(input.highlightedIssues), allIssues);

  const totalChecks = allIssues.length;
  const passedChecks = allIssues.filter((i) => issueStatusLabel(i) === 'PASS').length;
  const failedSorted = allIssues
    .filter((i) => issueStatusLabel(i) !== 'PASS' && issueStatusLabel(i) !== 'NOT_EVALUATED')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const strongestFailed = failedSorted[0];
  const topFailed = (highlightedIssues.length > 0 ? highlightedIssues : failedSorted).slice(0, 5);
  const topIssueName = topFailed[0]?.check ?? topFailed[0]?.checkId ?? '';
  const firstMove = topFailed[0]?.fix ?? '';

  const now = new Date().toISOString().split('T')[0] ?? '';
  const scanIdShort = (input.scanId ?? '').slice(0, 8);

  const pdf = new PdfBuilder();
  await pdf.init(
    `GEO-Pulse | AI Search Readiness Report`,
    scanIdShort ? `Scan ${scanIdShort} | ${now}` : now,
  );

  pdf.drawCoverPage(input.domain, score, grade, now);

  const narrative = scoreNarrative(score, grade, totalChecks, passedChecks, topIssueName, firstMove);
  pdf.drawExecutiveSummary(narrative, topFailed.slice(0, 3));
  pdf.drawAtAGlance({
    score,
    grade,
    passedChecks,
    totalChecks,
    topIssue: strongestFailed,
    firstMove: topFailed[0]?.fix ?? '',
  });
  if (input.categoryScores && input.categoryScores.length > 0) {
    pdf.drawCategoryBreakdown(input.categoryScores);
  }
  pdf.drawActionPlan(failedSorted);
  pdf.drawDemandCoverage(allIssues);
  pdf.drawCoverageSummary(input.coverageSummary);

  const summaries = input.pageSummaries?.length ? input.pageSummaries : null;
  if (summaries && summaries.length > 1) {
    pdf.drawRepeatedPagePatterns(
      summaries.map((pg) => ({
        url: pg.url,
        issues: parseIssues(pg.issuesJson),
      })),
    );
    pdf.drawPageSummaries(
      summaries.map((pg) => ({
        url: pg.url,
        score: pg.score,
        grade: pg.letterGrade,
        issues: parseIssues(pg.issuesJson),
      })),
    );
  }

  pdf.drawScoreBreakdown(allIssues);
  pdf.drawTechnicalAppendix(input.technicalAppendix, input.coverageSummary);
  pdf.drawDisclaimer();
  return pdf.save();
}

/**
 * Build PDF from the canonical {@link DeepAuditReportPayload} (DA-003).
 */
export async function buildDeepAuditPdfFromPayload(
  payload: DeepAuditReportPayload
): Promise<Uint8Array> {
  return buildDeepAuditPdf({
    url: payload.seedUrl,
    domain: payload.domain,
    score: payload.aggregateScore,
    letterGrade: payload.aggregateLetterGrade,
    issuesJson: payload.allIssues,
    highlightedIssues: payload.highlightedIssues,
    scanId: payload.scanId,
    categoryScores: payload.categoryScores,
    coverageSummary: payload.coverageSummary,
    technicalAppendix: payload.technicalAppendix,
    pageSummaries: payload.pages.map((p) => ({
      url: p.url,
      score: p.score,
      letterGrade: p.letterGrade,
      issuesJson: p.issuesJson,
    })),
  });
}
