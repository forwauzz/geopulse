import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { DeepAuditReportPayload } from './deep-audit-report-payload';

export type IssueRow = {
  check?: string;
  checkId?: string;
  passed?: boolean;
  finding?: string;
  fix?: string;
  weight?: number;
};

function parseIssues(raw: unknown): IssueRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is IssueRow => x !== null && typeof x === 'object');
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

export type DeepAuditPageSummaryInput = {
  readonly url: string;
  readonly score: number | null;
  readonly letterGrade: string | null;
  readonly issuesJson: unknown;
};

/**
 * Single responsibility: build PDF bytes for a paid deep-audit report (pdf-lib).
 */
export async function buildDeepAuditPdf(input: {
  url: string;
  domain: string;
  score: number | null;
  letterGrade: string | null;
  issuesJson: unknown;
  pageSummaries?: readonly DeepAuditPageSummaryInput[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const lineHeight = 14;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxW = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const draw = (text: string, size: number, bold = false, color = rgb(0.1, 0.1, 0.12)): void => {
    const f = bold ? fontBold : font;
    const lines = wrapLine(text, Math.floor(maxW / (size * 0.55)));
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= lineHeight + (size > 12 ? 4 : 2);
    }
  };

  draw('GEO-Pulse — AI Search Readiness', 18, true);
  y -= 6;
  draw('Deep audit report (full checklist)', 11, false, rgb(0.35, 0.35, 0.4));
  y -= 12;

  const scoreText =
    input.score !== null && input.score !== undefined
      ? `${input.score}/100 (${input.letterGrade ?? '—'})`
      : 'Score pending';
  draw(`Score: ${scoreText}`, 12, true);
  draw(`URL: ${input.url}`, 10);
  draw(`Domain: ${input.domain}`, 10);
  y -= 10;

  const summaries = input.pageSummaries?.length ? input.pageSummaries : null;
  const issues = parseIssues(input.issuesJson);
  const multi = summaries !== null && summaries.length > 1;

  if (multi) {
    draw('Pages scanned', 13, true);
    y -= 4;
    for (const pg of summaries) {
      const sc =
        pg.score !== null && pg.score !== undefined
          ? `${pg.score}/100 (${pg.letterGrade ?? '—'})`
          : '—';
      draw(`• ${pg.url}`, 10, true);
      draw(`  Score: ${sc}`, 9);
      y -= 4;
    }
    y -= 6;
    if (issues.length > 0) {
      draw('Highlighted issues', 11, true);
      y -= 4;
      for (const row of issues) {
        const title = row.check ?? row.checkId ?? 'Check';
        const status = row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—';
        draw(`• ${title} [${status}]`, 10, true);
        if (row.finding) draw(`  ${row.finding}`, 9, false, rgb(0.2, 0.2, 0.25));
        y -= 4;
      }
      y -= 4;
    }
    draw('Per-page checklist', 13, true);
    y -= 4;
    for (const pg of summaries) {
      draw(pg.url, 10, true);
      const pageIssues = parseIssues(pg.issuesJson);
      if (pageIssues.length === 0) {
        draw('  (no issue rows)', 9, false, rgb(0.45, 0.45, 0.5));
      } else {
        for (const row of pageIssues) {
          const title = row.check ?? row.checkId ?? 'Check';
          const status = row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—';
          draw(`  • ${title} [${status}]`, 9, true);
          if (row.finding) draw(`    ${row.finding}`, 8, false, rgb(0.2, 0.2, 0.25));
        }
      }
      y -= 4;
    }
  } else {
    draw('All checks', 13, true);
    y -= 4;
    if (issues.length === 0) {
      draw('No issue rows stored for this scan.', 10);
    } else {
      for (const row of issues) {
        const title = row.check ?? row.checkId ?? 'Check';
        const status = row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—';
        draw(`• ${title} [${status}]`, 10, true);
        if (row.finding) draw(`  ${row.finding}`, 9, false, rgb(0.2, 0.2, 0.25));
        if (row.fix) draw(`  Fix: ${row.fix}`, 9, false, rgb(0.15, 0.35, 0.2));
        y -= 4;
      }
    }
  }

  y -= 8;
  draw(
    'This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations.',
    9,
    false,
    rgb(0.4, 0.4, 0.45)
  );

  return doc.save();
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
    issuesJson: payload.highlightedIssues,
    pageSummaries: payload.pages.map((p) => ({
      url: p.url,
      score: p.score,
      letterGrade: p.letterGrade,
      issuesJson: p.issuesJson,
    })),
  });
}
