import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';import {
  GEO_PULSE_BRAND,
  mutedInkOn,
  pickInk,
  type BrandConfig,
  type Rgb01,
} from './report-branding';
import type { CategoryScorePayload, DeepAuditReportPayload } from './deep-audit-report-payload';
import {
  customerFacingFinding,
  deriveCrawlTrustNotice,
  deriveDemandCoverageSignals,
  parseCoverageSummary,
  parseIssues,
  scoreNarrative,
  severityLabel,
  summarizePageIssuePatterns,
  type IssueRow,
} from './deep-audit-report-helpers';
import { deriveCheckCounts, describeCheckCounts, type CheckCounts } from './check-counts';
import { truncateAtWord } from './report-qa-gate';
import { INDEXATION_GUIDANCE } from './indexation-guidance';
import { buildOwnerPage, type OwnerPageData } from './owner-page';
import { OFFSITE_MODULE } from '../../lib/shared/offsite-guidance';
import { classifyPageTier, sortPagesByTier, TIER_LABELS } from './page-tiers';
import { assessBuyerQuestionCoverage } from './buyer-question-coverage';
import { buildCadencePlan, type CadencePhase } from './cadence-plan';
import { ownerRoleFor, remediationFor } from './remediation-catalog';
import { formatReportTimestamp } from './report-timestamp';

/**
 * Map every string onto WinAnsi-encodable characters (Helvetica standard font).
 * Known typographic characters get readable ASCII stand-ins; anything else outside
 * CP1252 becomes '?' rather than an exception.
 */
const WINANSI_EXTRAS = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
);

export function toWinAnsiSafe(text: string): string {
  let out = '';
  for (const ch of text
    .replace(/→/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[↑↓]/g, '-')
    .replace(/[×✕]/g, 'x')) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRAS.has(ch)) {
      out += ch;
    } else if (code === 0x0a || code === 0x09) {
      out += ' ';
    } else {
      out += '?';
    }
  }
  return out;
}

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

// Operational role, never a department (spec C9 bans "Engineering" labels): the reader
// is a business owner deciding WHO to hand this to, not an org chart.
function ownerLabel(row: IssueRow): string {
  return ownerRoleFor(row.checkId ?? '');
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

/** Branding speaks in plain 0..1 triples; pdf-lib wants its own RGB type. */
function toPdfRgb(c: Rgb01): RGB {
  return rgb(c.r, c.g, c.b);
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
  /** Customer branding; GEO-Pulse's own when they have not set one. */
  private brand: BrandConfig = GEO_PULSE_BRAND;
  private embeddedLogo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;

  async init(
    footerLeft: string,
    footerRight: string,
    brand: BrandConfig = GEO_PULSE_BRAND,
    logoBytes?: Uint8Array | null
  ): Promise<void> {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fontBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.brand = brand;
    // A logo that will not embed must not take the report down with it — the render continues
    // with the wordmark instead.
    if (logoBytes && logoBytes.length > 0 && brand.logo) {
      try {
        this.embeddedLogo =
          brand.logo.mime === 'image/png'
            ? await this.doc.embedPng(logoBytes)
            : await this.doc.embedJpg(logoBytes);
      } catch {
        this.embeddedLogo = null;
      }
    }
    this.footerLeft = footerLeft;
    this.footerRight = footerRight;
    this.newPage();
  }

  private newPage(): void {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    // Helvetica is WinAnsi-encoded: one stray glyph (→, emoji, model output) in any drawn
    // string throws and kills the whole render. Sanitizing at THIS boundary means no call
    // site can ever crash the report over a character.
    const original = page.drawText.bind(page);
    page.drawText = ((text: string, options?: Parameters<typeof original>[1]) =>
      original(toWinAnsiSafe(String(text)), options)) as typeof page.drawText;
    this.page = page;
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

  async embedHeroImage(bytes: Uint8Array): Promise<PDFImage | null> {
    // A screenshot that will not embed must not take the report down with it.
    try {
      return await this.doc.embedPng(bytes);
    } catch {
      try {
        return await this.doc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  }

  drawCoverPage(
    domain: string,
    score: number,
    grade: string,
    date: string,
    design?: { preparedForLines: string[]; preparedByLines: string[]; credibilityLines: string[]; hero: PDFImage | null } | null
  ): void {
    // Every colour on the cover derives from the brand: the background is theirs, and the ink is
    // chosen for contrast against it rather than assumed to be white. A pale brand would make
    // fixed white text invisible, and it would fail for that customer only.
    const bg = toPdfRgb(this.brand.primary);
    const ink = toPdfRgb(this.brand.onPrimary);
    const muted = toPdfRgb(mutedInkOn(this.brand.primary));
    const hairline = toPdfRgb(mutedInkOn(this.brand.primary, 0.55));

    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: bg });

    const logoY = PAGE_H - 80;
    if (this.embeddedLogo) {
      // Fit inside a fixed box so a tall or wide logo cannot blow out the masthead.
      const maxW = 180;
      const maxH = 48;
      const scale = Math.min(maxW / this.embeddedLogo.width, maxH / this.embeddedLogo.height, 1);
      const w = this.embeddedLogo.width * scale;
      const h = this.embeddedLogo.height * scale;
      this.page.drawImage(this.embeddedLogo, { x: MARGIN, y: logoY - h + 20, width: w, height: h });
    } else {
      this.page.drawText(this.brand.companyName, {
        x: MARGIN, y: logoY, size: 28, font: this.fontBold, color: ink,
      });
    }
    this.page.drawText('AI Search Readiness Report', { x: MARGIN, y: logoY - 30, size: 12, font: this.font, color: muted });

    this.page.drawLine({ start: { x: MARGIN, y: logoY - 50 }, end: { x: PAGE_W - MARGIN, y: logoY - 50 }, thickness: 0.5, color: hairline });

    const domainY = PAGE_H / 2 + 40;
    if (design) {
      this.page.drawText(design.preparedForLines[0] ?? '', {
        x: MARGIN, y: domainY + 34, size: 11, font: this.font, color: muted,
      });
    }
    this.page.drawText(domain, { x: MARGIN, y: domainY, size: 36, font: this.fontBold, color: ink });
    this.page.drawText(date, { x: MARGIN, y: domainY - 30, size: 11, font: this.font, color: muted });

    if (design) {
      // The audited site's own homepage, framed on the right — the "we actually looked
      // at YOUR site" signal. Skipped silently when capture/embedding failed.
      if (design.hero) {
        const maxW = 250;
        const maxH = 156;
        const scale = Math.min(maxW / design.hero.width, maxH / design.hero.height);
        const w = design.hero.width * scale;
        const h = design.hero.height * scale;
        const hx = PAGE_W - MARGIN - w;
        const hy = domainY + 60;
        this.page.drawRectangle({
          x: hx - 4, y: hy - 4, width: w + 8, height: h + 8,
          color: toPdfRgb(mutedInkOn(this.brand.primary, 0.85)),
        });
        this.page.drawImage(design.hero, { x: hx, y: hy, width: w, height: h });
      }

      // Prepared-by provenance under the date.
      let by = domainY - 58;
      for (const line of design.preparedByLines) {
        this.page.drawText(line, { x: MARGIN, y: by, size: 9, font: this.font, color: muted });
        by -= 14;
      }

      // Credibility strip above the disclaimer, separated by a hairline.
      let cy = by - 14;
      this.page.drawLine({
        start: { x: MARGIN, y: cy + 8 }, end: { x: PAGE_W / 2 + 60, y: cy + 8 },
        thickness: 0.5, color: hairline,
      });
      for (const line of design.credibilityLines) {
        this.page.drawText(line, { x: MARGIN, y: cy - 4, size: 7.5, font: this.font, color: muted });
        cy -= 12;
      }
    }

    const scoreStr = String(score);
    const scoreW = this.fontBold.widthOfTextAtSize(scoreStr, 72);
    const scoreX = PAGE_W - MARGIN - scoreW - 20;
    const scoreY = 140;
    this.page.drawText(scoreStr, { x: scoreX, y: scoreY, size: 72, font: this.fontBold, color: ink });
    this.page.drawText('/ 100', { x: scoreX + scoreW + 6, y: scoreY + 10, size: 16, font: this.font, color: muted });

    const gradeR = 28;
    const gradeCX = MARGIN + gradeR + 10;
    const gradeCY = 155;
    // The disc lifts slightly off the brand colour; its own ink is derived from that blend so the
    // grade stays readable whatever the brand is.
    const discColour = mutedInkOn(this.brand.primary, 0.72);
    this.page.drawCircle({ x: gradeCX, y: gradeCY, size: gradeR, color: toPdfRgb(discColour) });
    const gradeW = this.fontBold.widthOfTextAtSize(grade, 22);
    this.page.drawText(grade, { x: gradeCX - gradeW / 2, y: gradeCY - 8, size: 22, font: this.fontBold, color: toPdfRgb(pickInk(discColour)) });

    // Was a fixed grey at 4.2:1 on our own background — below AA even before branding.
    this.page.drawText('This report reflects technical signals relevant to AI search readiness.', {
      x: MARGIN, y: 80, size: 8, font: this.font, color: muted,
    });
    if (this.brand.showPoweredBy && this.brand.companyName !== GEO_PULSE_BRAND.companyName) {
      this.page.drawText('Powered by GEO-Pulse', {
        x: MARGIN, y: 66, size: 7, font: this.font, color: muted,
      });
    }

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

  drawCoverageNotice(summary: string): void {
    this.ensureSpace(48);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 28,
      width: MAX_W,
      height: 40,
      color: rgb(0.99, 0.96, 0.88),
      borderColor: rgb(0.86, 0.72, 0.32),
      borderWidth: 0.5,
    });
    this.page.drawText('Coverage note', {
      x: MARGIN + 8,
      y: this.y - 2,
      size: 9,
      font: this.fontBold,
      color: rgb(0.45, 0.32, 0.08),
    });
    this.page.drawText(wrapLine(summary, 90)[0] ?? '', {
      x: MARGIN + 8,
      y: this.y - 16,
      size: 8,
      font: this.font,
      color: rgb(0.45, 0.32, 0.08),
    });
    const second = wrapLine(summary, 90)[1];
    if (second) {
      this.page.drawText(second, {
        x: MARGIN + 8,
        y: this.y - 28,
        size: 8,
        font: this.font,
        color: rgb(0.45, 0.32, 0.08),
      });
      this.y -= 48;
      return;
    }
    this.y -= 44;
  }

  drawAtAGlance(input: {
    score: number;
    grade: string;
    counts: CheckCounts;
    topIssue?: IssueRow;
    firstMove?: string;
  }): void {
    this.drawSectionTitle('At a Glance');
    const rows: string[] = [
      `Overall score: ${String(input.score)}/100 (${input.grade})`,
      `Checks: ${describeCheckCounts(input.counts)}`,
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

      // Word-boundary truncation + wrapped findings — a hard slice mid-word ("…AI crawle")
      // is exactly the credibility bug the QA gate exists to block (spec C1).
      const name = truncateAtWord(row.check ?? row.checkId ?? 'Check', 42);
      const status = issueStatusLabel(row);
      const statusClr = issueStatusColor(status);
      const weight = String(row.weight ?? 0);
      const findingLines = wrapLine(customerFacingFinding(row), 48).slice(0, 3);
      const extraLines = Math.max(0, findingLines.length - 1);
      const rowH = 16 + extraLines * 9;
      this.ensureSpace(rowH + 4);

      if (i % 2 === 0) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - 2 - extraLines * 9, width: MAX_W, height: rowH, color: ROW_ALT });
      }

      this.page.drawText(name, { x: MARGIN + 4, y: this.y, size: 8, font: this.font, color: INK });
      this.page.drawText(status, { x: MARGIN + 220, y: this.y, size: 8, font: this.fontBold, color: statusClr });
      this.page.drawText(weight, { x: MARGIN + 280, y: this.y, size: 8, font: this.font, color: MUTED });
      for (let li = 0; li < findingLines.length; li += 1) {
        this.page.drawText(findingLines[li] ?? '', { x: MARGIN + 330, y: this.y - li * 9, size: 7, font: this.font, color: MUTED });
      }
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
      this.drawText(`${pg.url}  —  ${sc}  [${TIER_LABELS[classifyPageTier(pg.url)]}]`, 9, true, PRIMARY);
      this.y -= 2;

      if (pg.issues.length === 0) {
        this.drawText('No issues recorded for this page.', 8, false, MUTED, 12);
      } else {
        for (const row of pg.issues) {
          const status = issueStatusLabel(row);
          const statusClr = issueStatusColor(status);
          this.ensureSpace(14);
          this.page.drawText(`[${status}]`, { x: MARGIN + 12, y: this.y, size: 7, font: this.fontBold, color: statusClr });
          this.page.drawText(truncateAtWord(row.check ?? row.checkId ?? 'Check', 50), { x: MARGIN + 50, y: this.y, size: 8, font: this.font, color: INK });
          this.y -= 14;
        }
      }
      this.y -= 8;
    }
  }

  drawOwnerPage(data: OwnerPageData): void {
    this.drawSectionTitle('For the Owner — What This Means');
    this.drawText(data.verdict, 10, false, INK);
    this.y -= 6;

    if (data.blockedItems.length > 0) {
      this.drawText('Currently working against you:', 9, true, PRIMARY);
      for (const item of data.blockedItems.slice(0, 6)) {
        this.drawText(`- ${item}`, 8, false, INK, 12);
      }
      this.y -= 4;
    }

    if (data.notTestedItems.length > 0) {
      this.drawText('Not tested (not failed — we could not check these yet):', 9, true, PRIMARY);
      for (const item of data.notTestedItems.slice(0, 4)) {
        this.drawText(`- ${item}`, 8, false, MUTED, 12);
      }
      this.y -= 4;
    }

    if (data.quickWins.length > 0) {
      this.drawText('Your three quick wins:', 9, true, PRIMARY);
      for (let i = 0; i < data.quickWins.length; i += 1) {
        const w = data.quickWins[i]!;
        this.ensureSpace(48);
        this.drawText(`${String(i + 1)}. ${w.title} — ${w.ownerRole} | ${w.effort} | ${w.diyOrHire}`, 9, true, INK);
        this.drawText(w.action, 8, false, INK, 12);
        this.drawText(`Verify: ${w.verify}`, 8, false, MUTED, 12);
        this.y -= 4;
      }
    }

    this.drawText(data.exposure, 8, false, MUTED);
    this.y -= 4;

    if (data.deferrals.length > 0) {
      this.drawText('Deliberately deferred (so your first month stays focused):', 9, true, PRIMARY);
      for (const d of data.deferrals.slice(0, 5)) {
        this.drawText(`- ${d}`, 8, false, MUTED, 12);
      }
    }
    this.y -= 8;
  }

  drawDelegationAppendix(issues: IssueRow[], seedUrl: string, affectedUrlsByCheck: Map<string, string[]>): void {
    const actionable = issues.filter((row) => {
      const status = issueStatusLabel(row);
      return (status === 'FAIL' || status === 'WARNING') && remediationFor(row.checkId ?? '');
    });
    if (actionable.length === 0) return;

    this.drawSectionTitle('Delegation Appendix — Hand These Pages to Whoever Does the Work');
    this.drawText(
      'Each item below is self-contained: forward it as-is to the named role. No engineering team required.',
      9,
      false,
      MUTED
    );
    this.y -= 6;

    for (const row of actionable) {
      const remedy = remediationFor(row.checkId ?? '');
      if (!remedy) continue;
      this.ensureSpace(120);
      const urls = affectedUrlsByCheck.get(row.checkId ?? '') ?? [seedUrl];

      this.drawText(`${row.check ?? row.checkId ?? 'Check'}  [${remedy.effortImpact}]`, 10, true, PRIMARY);
      this.drawText(`Owner: ${remedy.ownerRole} | Effort: ${remedy.effort} | ${remedy.diy ? 'DIY-friendly' : 'Worth delegating/hiring'}`, 8, true, INK, 12);
      this.drawText(`Affected URLs: ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? ` (+${String(urls.length - 3)} more)` : ''}`, 8, false, MUTED, 12);
      this.drawText(`Current: ${customerFacingFinding(row)}`, 8, false, INK, 12);
      this.drawText(`Desired: ${remedy.desiredState}`, 8, false, INK, 12);
      this.drawText(`Where: ${remedy.tool} — ${remedy.clickPath}`, 8, false, INK, 12);
      this.drawText(`Copy-paste instruction: "${remedy.copyPaste}"`, 8, false, INK, 12);
      this.drawText(`Verify: ${remedy.verify}`, 8, false, MUTED, 12);
      this.drawText(`Risk/rollback: ${remedy.rollback}`, 8, false, MUTED, 12);
      this.y -= 8;
    }
  }

  drawCadencePlan(phases: CadencePhase[]): void {
    this.drawSectionTitle('Your Next 90 Days');
    this.drawText(
      'Work the plan in order — access first, then profiles and content, then measure against this report as your baseline.',
      9,
      false,
      MUTED
    );
    this.y -= 4;
    for (const phase of phases) {
      this.ensureSpace(40);
      this.drawText(`${phase.date} — ${phase.title}`, 9, true, PRIMARY);
      for (const action of phase.actions) {
        this.drawText(`- ${action}`, 8, false, INK, 12);
      }
      this.y -= 4;
    }
    this.drawText(
      'Re-scan hook: run a fresh scan at each checkpoint at getgeopulse.com — the report compares best against this baseline.',
      8,
      true,
      INK
    );
    this.y -= 8;
  }

  drawBuyerQuestionCoverage(pages: readonly { url: string }[]): void {
    const coverage = assessBuyerQuestionCoverage(pages);
    this.drawSectionTitle('Buyer-Question Coverage');
    this.drawText(
      'Prospects ask AI engines four kinds of questions. This is whether your site gives engines anything to answer with.',
      9,
      false,
      MUTED
    );
    this.y -= 4;
    for (const gap of coverage.gaps) {
      this.ensureSpace(36);
      const label = gap.category.charAt(0).toUpperCase() + gap.category.slice(1);
      this.drawText(`${label} coverage: ${gap.covered ? 'COVERED' : 'GAP'}`, 9, true, gap.covered ? PASS_GREEN : FAIL_RED);
      this.drawText(gap.evidence, 8, false, MUTED, 12);
      if (!gap.covered) this.drawText(`Do: ${gap.action}`, 8, false, INK, 12);
      this.y -= 4;
    }
    this.drawText(coverage.note, 7, false, MUTED);
    this.y -= 8;
  }

  drawOffsiteModule(): void {
    this.drawSectionTitle(OFFSITE_MODULE.headline);
    this.drawText(OFFSITE_MODULE.intro, 9, false, MUTED);
    this.y -= 4;
    for (const lever of OFFSITE_MODULE.levers) {
      this.ensureSpace(50);
      this.drawText(`${lever.title}  [helps: ${lever.engines.join(', ')}]`, 9, true, PRIMARY);
      this.drawText(`Owner: ${lever.ownerRole}`, 8, false, MUTED, 12);
      this.drawText(lever.what, 8, false, INK, 12);
      this.drawText(lever.why, 8, false, MUTED, 12);
      if (lever.stat) {
        this.drawText(`${lever.stat.claim} — ${lever.stat.source}`, 7, false, MUTED, 12);
      }
      this.y -= 4;
    }
    this.drawText(OFFSITE_MODULE.reviewsNote, 8, false, MUTED);
    this.y -= 8;
  }

  drawIndexationGuidance(): void {
    this.drawSectionTitle(INDEXATION_GUIDANCE.headline);
    this.drawText(INDEXATION_GUIDANCE.explanation, 9, false, MUTED);
    this.y -= 4;
    for (const block of INDEXATION_GUIDANCE.steps) {
      this.ensureSpace(30);
      this.drawText(`${block.destination} — ${block.tool}`, 9, true, PRIMARY);
      for (let i = 0; i < block.steps.length; i += 1) {
        this.drawText(`${String(i + 1)}. ${block.steps[i] ?? ''}`, 8, false, INK, 12);
      }
      this.y -= 6;
    }
    this.drawText(INDEXATION_GUIDANCE.caveat, 8, false, MUTED);
    this.y -= 8;
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
  /** ISO timestamp the report was generated — anchors the dated 90-day plan (spec C11). */
  generatedAt?: string;
  /** Personalized cover from the design agent (issue #90); null/absent = classic cover. */
  coverDesign?: {
    preparedForLines: string[];
    preparedByLines: string[];
    credibilityLines: string[];
    heroImage: Uint8Array | null;
  } | null;
  /** Customer branding; GEO-Pulse's own when absent. */
  brand?: BrandConfig;
  /** Raw logo bytes, already fetched from R2 by the caller. */
  logoBytes?: Uint8Array | null;
}): Promise<Uint8Array> {
  const score = input.score ?? 0;
  const grade = input.letterGrade ?? '—';
  const issues = parseIssues(input.issuesJson);
  const allIssues = issues.length > 0 ? issues : (input.pageSummaries?.[0] ? parseIssues(input.pageSummaries[0].issuesJson) : []);
  const highlightedIssues = enrichIssues(parseIssues(input.highlightedIssues), allIssues);

  // Canonical arithmetic (spec C1): every surface derives counts from deriveCheckCounts
  // so passed+warning+failed+notTested always reconciles with the total.
  const counts = deriveCheckCounts(allIssues);
  const totalChecks = counts.total;
  const passedChecks = counts.passed;
  const failedSorted = allIssues
    .filter((i) => issueStatusLabel(i) !== 'PASS' && issueStatusLabel(i) !== 'NOT_EVALUATED')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const strongestFailed = failedSorted[0];
  const topFailed = (highlightedIssues.length > 0 ? highlightedIssues : failedSorted).slice(0, 5);
  const topIssueName = topFailed[0]?.check ?? topFailed[0]?.checkId ?? '';
  const firstMove = topFailed[0]?.fix ?? '';
  const crawlTrustNotice = deriveCrawlTrustNotice(input.coverageSummary);

  // Date AND time on the cover (issue #94) — the recipient must know when this was generated.
  const now = formatReportTimestamp(input.generatedAt ?? new Date().toISOString());
  const scanIdShort = (input.scanId ?? '').slice(0, 8);

  const brand = input.brand ?? GEO_PULSE_BRAND;
  const pdf = new PdfBuilder();
  await pdf.init(
    `${brand.companyName} | AI Search Readiness Report`,
    scanIdShort ? `Scan ${scanIdShort} | ${now}` : now,
    brand,
    input.logoBytes ?? null,
  );

  const heroEmbedded = input.coverDesign?.heroImage
    ? await pdf.embedHeroImage(input.coverDesign.heroImage)
    : null;
  pdf.drawCoverPage(
    input.domain,
    score,
    grade,
    now,
    input.coverDesign
      ? {
          preparedForLines: input.coverDesign.preparedForLines,
          preparedByLines: input.coverDesign.preparedByLines,
          credibilityLines: input.coverDesign.credibilityLines,
          hero: heroEmbedded,
        }
      : null
  );

  // Layer 1 — the Owner Page (spec C9): plain English before any table.
  pdf.drawOwnerPage(buildOwnerPage({ score, grade, issues: allIssues }));

  const narrative = scoreNarrative(score, grade, totalChecks, passedChecks, topIssueName, firstMove);
  pdf.drawExecutiveSummary(narrative, topFailed.slice(0, 3));
  if (crawlTrustNotice) {
    pdf.drawCoverageNotice(crawlTrustNotice.summary);
  }
  pdf.drawAtAGlance({
    score,
    grade,
    counts,
    topIssue: strongestFailed,
    firstMove: topFailed[0]?.fix ?? '',
  });
  if (input.categoryScores && input.categoryScores.length > 0) {
    pdf.drawCategoryBreakdown(input.categoryScores);
  }
  pdf.drawActionPlan(failedSorted);
  pdf.drawIndexationGuidance();
  if ((input.pageSummaries?.length ?? 0) > 1) {
    pdf.drawBuyerQuestionCoverage(input.pageSummaries ?? []);
  }
  pdf.drawOffsiteModule();
  pdf.drawDemandCoverage(allIssues);
  pdf.drawCoverageSummary(input.coverageSummary);

  // Money pages surface first (spec C12): findings on service/pricing/contact pages
  // outrank the same findings on blog posts.
  const summaries = input.pageSummaries?.length ? sortPagesByTier(input.pageSummaries) : null;
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

  // Layer 2 — the Delegation Appendix (spec C9): every actionable item self-contained.
  const affectedUrlsByCheck = new Map<string, string[]>();
  for (const pg of input.pageSummaries ?? []) {
    for (const row of parseIssues(pg.issuesJson)) {
      const status = issueStatusLabel(row);
      if (status !== 'FAIL' && status !== 'WARNING') continue;
      const key = row.checkId ?? '';
      if (!key) continue;
      const list = affectedUrlsByCheck.get(key) ?? [];
      if (!list.includes(pg.url)) list.push(pg.url);
      affectedUrlsByCheck.set(key, list);
    }
  }
  pdf.drawDelegationAppendix(allIssues, input.url, affectedUrlsByCheck);

  pdf.drawTechnicalAppendix(input.technicalAppendix, input.coverageSummary);

  // The report ends with the dated plan + re-scan hook (spec C11).
  pdf.drawCadencePlan(buildCadencePlan(input.generatedAt ?? new Date().toISOString()));

  pdf.drawDisclaimer();
  return pdf.save();
}

/**
 * Build PDF from the canonical {@link DeepAuditReportPayload} (DA-003).
 */
export async function buildDeepAuditPdfFromPayload(
  payload: DeepAuditReportPayload,
  branding?: { brand?: BrandConfig; logoBytes?: Uint8Array | null },
  coverDesign?: {
    preparedForLines: string[];
    preparedByLines: string[];
    credibilityLines: string[];
    heroImage: Uint8Array | null;
  } | null
): Promise<Uint8Array> {
  return buildDeepAuditPdf({
    brand: branding?.brand,
    logoBytes: branding?.logoBytes,
    coverDesign: coverDesign ?? null,
    url: payload.seedUrl,
    domain: payload.domain,
    score: payload.aggregateScore,
    letterGrade: payload.aggregateLetterGrade,
    issuesJson: payload.allIssues,
    highlightedIssues: payload.highlightedIssues,
    scanId: payload.scanId,
    generatedAt: payload.generatedAt,
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
