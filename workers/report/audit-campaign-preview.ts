import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import type { DeepAuditReportPayload } from './deep-audit-report-payload';
import { issueStatusLabel } from './deep-audit-report-helpers';
import { deriveCheckCounts } from './check-counts';

export type AuditPreviewPageRole =
  | 'cover' | 'owner_summary' | 'scorecard' | 'priority_fixes' | 'buyer_questions'
  | 'page_patterns' | 'delegation' | 'technical_access' | 'monthly_monitoring' | 'full_report_cta';

export type AuditPreviewPage = {
  readonly number: number;
  readonly role: AuditPreviewPageRole;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: readonly string[];
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
};

export type AuditCampaignPreview = {
  readonly contract: 'audit_campaign_preview_v1';
  readonly scanId: string;
  readonly domain: string;
  readonly generatedAt: string;
  readonly recipient: { readonly firstName: string; readonly company: string };
  readonly preparedBy: string;
  readonly fullReportPageCount: number;
  readonly pages: readonly AuditPreviewPage[];
};

export type AuditCampaignPreviewBranding = {
  readonly siteName?: string | null;
  readonly primaryHex?: string | null;
  /** 2:1 homepage hero screenshot captured by the existing report design agent. */
  readonly heroImage?: Uint8Array | null;
  readonly logoBytes?: Uint8Array | null;
};

function text(value: unknown, fallback = 'Not available'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function issueLine(issue: DeepAuditReportPayload['allIssues'][number]): string {
  return `${text(issue.check ?? issue.checkId)} — ${text(issue.fix ?? issue.finding, 'Review the finding and assign the fix.')}`;
}

export function deriveAuditCampaignPreview(args: {
  payload: DeepAuditReportPayload;
  recipient: { firstName: string; company: string };
  preparedBy: string;
  fullReportPageCount: number;
  fullReportUrl: string;
}): AuditCampaignPreview {
  if (args.fullReportPageCount <= 10) throw new Error('The canonical full report must contain more than ten pages.');
  const issues = args.payload.allIssues;
  const failed = issues.filter((item) => ['FAIL', 'WARNING'].includes(issueStatusLabel(item))).slice(0, 5);
  const counts = deriveCheckCounts(issues);
  const servicePages = args.payload.pages.filter((page) => page.section === 'services');
  const remaining = args.fullReportPageCount - 10;
  const remainingLabel = `${String(remaining)} ${remaining === 1 ? 'page' : 'pages'}`;
  const company = text(args.recipient.company, args.payload.domain);
  const firstName = text(args.recipient.firstName, 'Website owner');
  const pages: AuditPreviewPage[] = [
    { number: 1, role: 'cover', eyebrow: 'AI SEARCH READINESS AUDIT', title: `What AI systems can understand about ${company}`, body: [`Prepared for ${firstName} at ${company}`, `Prepared by ${args.preparedBy}`, `${args.payload.domain} · ${args.payload.generatedAt.slice(0, 10)}`, 'Inside: observed gaps, prioritized fixes, owners, and a way to verify the work.'] },
    { number: 2, role: 'owner_summary', eyebrow: 'THE BUSINESS VIEW', title: 'What this audit gives you', body: ['A plain-English view of what was tested.', 'The website gaps most likely to block accurate reuse.', 'Specific actions your web and content teams can take.', 'A repeatable monthly comparison so fixes are verified, not assumed.'] },
    { number: 3, role: 'scorecard', eyebrow: 'OBSERVED READINESS', title: `${String(args.payload.aggregateScore ?? '—')}/100 · Grade ${text(args.payload.aggregateLetterGrade, '—')}`, body: [`${String(counts.passed)} passed · ${String(counts.warning)} warnings · ${String(counts.failed)} failed · ${String(counts.notTested)} not tested`, `${String(args.payload.pages.length)} pages were included in the canonical audit.`, 'This score describes tested website signals; it does not predict rankings or citations.'] },
    { number: 4, role: 'priority_fixes', eyebrow: 'START HERE', title: 'The highest-priority fixes', body: failed.length ? failed.map(issueLine) : ['No failed or warning checks were present in the canonical payload.'] },
    { number: 5, role: 'buyer_questions', eyebrow: 'ANSWER COVERAGE', title: 'Can buyers get a direct answer?', body: servicePages.length ? servicePages.slice(0, 4).map((page) => `${page.url} — ${page.issuesJson.some((item) => item.checkId === 'llm-qa-pattern' && issueStatusLabel(item) !== 'PASS') ? 'needs clearer question-led answers' : 'no direct-answer gap observed'}`) : ['No service pages were classified; confirm the priority pages before assigning content work.'] },
    { number: 6, role: 'page_patterns', eyebrow: 'SITEWIDE PATTERNS', title: 'Fix once, then apply consistently', body: failed.slice(0, 4).map((item) => `${text(item.check ?? item.checkId)} — check every affected template, not only the home page.`) },
    { number: 7, role: 'delegation', eyebrow: 'HAND THIS TO THE TEAM', title: 'Every action needs an owner and proof', body: failed.slice(0, 4).map((item) => `${/(schema|canonical|robots|header)/i.test(text(item.checkId)) ? 'Web developer' : 'Content team'}: ${text(item.fix, 'Review and correct this finding.')} Verify with a fresh scan.`) },
    { number: 8, role: 'technical_access', eyebrow: 'ACCESS & TRUST', title: 'What machines can retrieve and interpret', body: [text(args.payload.technicalAppendix?.robotsSummary), text(args.payload.technicalAppendix?.schemaSummary), 'Access checks and content-quality checks are reported separately; one does not prove the other.'] },
    { number: 9, role: 'monthly_monitoring', eyebrow: 'MONTH TWO AND BEYOND', title: 'See what changed after the work ships', body: ['Baseline the first run.', 'Classify each later finding as new, resolved, regressed, unchanged, or not comparable.', 'Keep the full audit each month, plus a concise change summary.', 'Run an on-demand verification scan after important fixes.'] },
    { number: 10, role: 'full_report_cta', eyebrow: 'YOUR FULL AUDIT IS READY', title: `Continue to the remaining ${remainingLabel}`, body: [`There ${remaining === 1 ? 'is' : 'are'} ${remainingLabel} left in the complete ${String(args.fullReportPageCount)}-page report, including detailed page findings, the remediation appendix, technical evidence, and cadence plan.`, 'The private link is signed, target-bound, and expires.'], ctaLabel: `View the remaining ${remainingLabel}`, ctaUrl: args.fullReportUrl },
  ];
  return { contract: 'audit_campaign_preview_v1', scanId: args.payload.scanId, domain: args.payload.domain, generatedAt: args.payload.generatedAt, recipient: { firstName, company }, preparedBy: args.preparedBy, fullReportPageCount: args.fullReportPageCount, pages };
}

const PAGE_W = 612;
const PAGE_H = 792;
const INK = rgb(0.055, 0.075, 0.11);
const BLUE = rgb(0.07, 0.31, 0.78);
const IVORY = rgb(0.975, 0.965, 0.93);
const MUTED = rgb(0.34, 0.38, 0.45);

function colorFromHex(value: string | null | undefined): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value?.trim() ?? '');
  if (!match?.[1]) return null;
  return rgb(
    Number.parseInt(match[1].slice(0, 2), 16) / 255,
    Number.parseInt(match[1].slice(2, 4), 16) / 255,
    Number.parseInt(match[1].slice(4, 6), 16) / 255,
  );
}

function readableAccent(primary: RGB): RGB {
  const luminance = 0.2126 * primary.red + 0.7152 * primary.green + 0.0722 * primary.blue;
  if (luminance <= 0.42) return primary;
  const factor = 0.48;
  return rgb(primary.red * factor, primary.green * factor, primary.blue * factor);
}

async function embedOptionalImage(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bytes?.length) return null;
  try { return await doc.embedPng(bytes); } catch {
    try { return await doc.embedJpg(bytes); } catch { return null; }
  }
}

function wrap(font: PDFFont, value: string, size: number, width: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page: PDFPage, font: PDFFont, value: string, args: { x: number; y: number; size: number; width: number; color?: ReturnType<typeof rgb>; lineHeight?: number }): number {
  const lineHeight = args.lineHeight ?? args.size * 1.3;
  let y = args.y;
  for (const line of wrap(font, value, args.size, args.width)) {
    page.drawText(line, { x: args.x, y, size: args.size, font, color: args.color ?? INK });
    y -= lineHeight;
  }
  return y;
}

export async function buildAuditCampaignPreviewPdf(
  preview: AuditCampaignPreview,
  branding: AuditCampaignPreviewBranding = {},
): Promise<Uint8Array> {
  if (preview.pages.length !== 10) throw new Error('Campaign previews must contain exactly ten pages.');
  const doc = await PDFDocument.create();
  doc.setTitle(`${preview.recipient.company} — GEO-Pulse audit preview`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const primary = colorFromHex(branding.primaryHex) ?? BLUE;
  const accent = readableAccent(primary);
  const hero = await embedOptionalImage(doc, branding.heroImage);
  const logo = await embedOptionalImage(doc, branding.logoBytes);
  for (const item of preview.pages) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY });
    page.drawRectangle({ x: 0, y: PAGE_H - 10, width: PAGE_W, height: 10, color: primary });

    if (item.role === 'cover') {
      const identity = text(branding.siteName, preview.recipient.company);
      if (logo) {
        const scale = Math.min(150 / logo.width, 34 / logo.height, 1);
        page.drawImage(logo, { x: 48, y: 728, width: logo.width * scale, height: logo.height * scale });
      } else {
        page.drawText(identity, { x: 48, y: 744, size: 12, font: bold, color: INK });
      }
      page.drawText('PRIVATE AUDIT  /  PREPARED BY GEO-PULSE', { x: 354, y: 744, size: 7.5, font: bold, color: MUTED });
      page.drawText(item.eyebrow, { x: 48, y: 696, size: 9, font: bold, color: accent });
      let coverY = drawWrapped(page, bold, item.title, { x: 48, y: 662, size: 27, width: 516, lineHeight: 32 });
      coverY -= 16;
      if (hero) {
        const frameW = 516;
        const frameH = 258;
        page.drawRectangle({ x: 44, y: coverY - frameH - 4, width: frameW + 8, height: frameH + 8, color: primary });
        page.drawImage(hero, { x: 48, y: coverY - frameH, width: frameW, height: frameH });
        coverY -= frameH + 28;
      }
      page.drawText(`Prepared for ${preview.recipient.firstName} at ${preview.recipient.company}`, { x: 48, y: coverY, size: 13, font: bold, color: INK });
      page.drawText(`${preview.domain}  /  ${preview.generatedAt.slice(0, 10)}`, { x: 48, y: coverY - 22, size: 10, font: regular, color: MUTED });
      page.drawLine({ start: { x: 48, y: coverY - 38 }, end: { x: 564, y: coverY - 38 }, thickness: 1, color: primary });
      page.drawText('Observed gaps  /  prioritized fixes  /  assigned owners  /  fresh-scan verification', { x: 48, y: coverY - 58, size: 9, font: bold, color: accent });
      page.drawText(`Prepared by ${preview.preparedBy}`, { x: 48, y: 40, size: 8, font: regular, color: MUTED });
      page.drawText('01 / 10', { x: 518, y: 40, size: 8, font: bold, color: MUTED });
      continue;
    }

    page.drawText('GEO-PULSE', { x: 48, y: 744, size: 12, font: bold, color: INK });
    page.drawText(item.eyebrow, { x: 48, y: 686, size: 9, font: bold, color: accent });
    let y = drawWrapped(page, bold, item.title, { x: 48, y: 650, size: 27, width: 516, lineHeight: 37 });
    y -= 28;
    for (const line of item.body) {
      page.drawCircle({ x: 54, y: y + 5, size: 3, color: accent });
      y = drawWrapped(page, regular, line, { x: 68, y, size: 13, width: 480, color: MUTED, lineHeight: 19 }) - 14;
    }
    if (item.ctaLabel && item.ctaUrl) {
      page.drawRectangle({ x: 48, y: 112, width: 300, height: 48, color: accent });
      page.drawText(item.ctaLabel, { x: 66, y: 130, size: 13, font: bold, color: rgb(1, 1, 1) });
      page.drawText('Private link · getgeopulse.com', { x: 48, y: 88, size: 8, font: regular, color: MUTED });
      const annotation = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [48, 112, 348, 160],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(item.ctaUrl) },
      });
      page.node.addAnnot(doc.context.register(annotation));
    }
    page.drawText(`Prepared by ${preview.preparedBy}`, { x: 48, y: 40, size: 8, font: regular, color: MUTED });
    page.drawText(`${String(item.number).padStart(2, '0')} / 10`, { x: 518, y: 40, size: 8, font: bold, color: MUTED });
  }
  return doc.save();
}
