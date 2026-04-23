import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { GpmReportPayload } from './geo-performance-report-payload';

// ── Constants ─────────────────────────────────────────────────────────────────

const INK = rgb(0.17, 0.2, 0.21);
const MUTED = rgb(0.35, 0.38, 0.39);
const PRIMARY = rgb(0.34, 0.37, 0.45);
const ACCENT = rgb(0.22, 0.48, 0.72);    // blue — AI/visibility theme
const WHITE = rgb(1, 1, 1);
const SURFACE = rgb(0.945, 0.953, 0.953);
const ROW_ALT = rgb(0.96, 0.965, 0.965);
const PASS_GREEN = rgb(0.15, 0.5, 0.3);
const WARN_AMBER = rgb(0.62, 0.44, 0.08);
const PLATFORM_CHATGPT = rgb(0.07, 0.53, 0.39);   // teal-green
const PLATFORM_GEMINI  = rgb(0.23, 0.39, 0.75);   // indigo
const PLATFORM_PERPLEXITY = rgb(0.48, 0.24, 0.62); // violet

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const MAX_W = PAGE_W - MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}\u2026` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function fmtRank(v: number | null): string {
  return v !== null ? `#${Math.round(v * 10) / 10}` : '\u2014';
}

function platformColor(platform: string): RGB {
  if (platform === 'chatgpt') return PLATFORM_CHATGPT;
  if (platform === 'gemini')  return PLATFORM_GEMINI;
  return PLATFORM_PERPLEXITY;
}

function platformLabel(platform: string): string {
  if (platform === 'chatgpt')    return 'ChatGPT';
  if (platform === 'gemini')     return 'Gemini';
  if (platform === 'perplexity') return 'Perplexity';
  return platform;
}

function formatWindowDate(w: string): string {
  // 'YYYY-MM' → 'April 2026' | 'YYYY-W07' → 'Week 7, 2026'
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(w);
  if (monthMatch) {
    const d = new Date(`${monthMatch[1]}-${monthMatch[2]}-01`);
    return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  }
  const weekMatch = /^(\d{4})-W(\d+)$/.exec(w);
  if (weekMatch) return `Week ${weekMatch[2]}, ${weekMatch[1]}`;
  return w;
}

// ── PdfBuilder ────────────────────────────────────────────────────────────────

class GpmPdfBuilder {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private fontBold!: PDFFont;
  private page!: PDFPage;
  private y = PAGE_H - MARGIN;
  private pageNum = 0;
  private footerDomain = '';
  private footerPeriod = '';

  async init(domain: string, period: string): Promise<void> {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fontBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.footerDomain = domain;
    this.footerPeriod = period;
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
    this.page.drawText(this.footerDomain, { x: MARGIN, y, size: 7, font: this.font, color: MUTED });
    const numText = `Page ${String(this.pageNum)}`;
    const nW = this.font.widthOfTextAtSize(numText, 7);
    this.page.drawText(numText, { x: (PAGE_W - nW) / 2, y, size: 7, font: this.font, color: MUTED });
    const rW = this.font.widthOfTextAtSize(this.footerPeriod, 7);
    this.page.drawText(this.footerPeriod, { x: PAGE_W - MARGIN - rW, y, size: 7, font: this.font, color: MUTED });
  }

  // ── Cover ──────────────────────────────────────────────────────────────────

  drawCover(payload: GpmReportPayload): void {
    const { domain, topic, location, windowDate, platform } = payload;
    const period = formatWindowDate(windowDate);
    const pColor = platformColor(platform);

    // Full-bleed dark background
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PRIMARY });

    // Accent stripe left edge
    this.page.drawRectangle({ x: 0, y: 0, width: 6, height: PAGE_H, color: pColor });

    // Logo + report type
    const logoY = PAGE_H - 72;
    this.page.drawText('GEO-Pulse', {
      x: MARGIN, y: logoY, size: 22, font: this.fontBold, color: WHITE,
    });
    this.page.drawText('GEO Performance Report', {
      x: MARGIN, y: logoY - 22, size: 11, font: this.font, color: rgb(0.75, 0.78, 0.84),
    });

    // Separator
    this.page.drawLine({
      start: { x: MARGIN, y: logoY - 38 },
      end: { x: PAGE_W - MARGIN, y: logoY - 38 },
      thickness: 0.5,
      color: rgb(0.5, 0.52, 0.58),
    });

    // Domain + topic/location
    const domainY = PAGE_H / 2 + 60;
    this.page.drawText(domain, {
      x: MARGIN, y: domainY, size: 32, font: this.fontBold, color: WHITE,
    });
    this.page.drawText(`${topic} \u00b7 ${location}`, {
      x: MARGIN, y: domainY - 28, size: 12, font: this.font, color: rgb(0.8, 0.82, 0.87),
    });
    this.page.drawText(period, {
      x: MARGIN, y: domainY - 46, size: 10, font: this.font, color: rgb(0.65, 0.67, 0.72),
    });

    // Platform badge — bottom right
    const pLabel = platformLabel(platform);
    const badgeW = 90;
    const badgeH = 28;
    const badgeX = PAGE_W - MARGIN - badgeW;
    const badgeY = 110;
    this.page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: badgeH, color: pColor });
    const labelW = this.fontBold.widthOfTextAtSize(pLabel, 11);
    this.page.drawText(pLabel, {
      x: badgeX + (badgeW - labelW) / 2,
      y: badgeY + 9,
      size: 11,
      font: this.fontBold,
      color: WHITE,
    });

    // Visibility pct large number — center-left bottom area
    const pctStr = fmtPct(payload.visibilityPct);
    this.page.drawText(pctStr, {
      x: MARGIN, y: 150, size: 64, font: this.fontBold, color: WHITE,
    });
    this.page.drawText('AI VISIBILITY', {
      x: MARGIN, y: 118, size: 9, font: this.fontBold, color: rgb(0.65, 0.67, 0.72),
    });

    this.page.drawText('GEO-Pulse monitors AI search visibility across ChatGPT, Gemini, and Perplexity.', {
      x: MARGIN, y: 42, size: 7, font: this.font, color: rgb(0.55, 0.57, 0.62),
    });

    this.drawPageFooter();
    this.newPage();
  }

  // ── Section heading ────────────────────────────────────────────────────────

  drawSectionTitle(title: string): void {
    this.ensureSpace(40);
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: 24, color: SURFACE });
    this.page.drawText(title, {
      x: MARGIN + 8, y: this.y + 4, size: 13, font: this.fontBold, color: INK,
    });
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

  // ── Visibility cards ───────────────────────────────────────────────────────
  // Three side-by-side cards: Visibility %, Citation Rate, Industry Rank

  drawVisibilityCards(payload: GpmReportPayload): void {
    this.drawSectionTitle('AI Visibility Summary');

    const cardW = (MAX_W - 16) / 3;
    const cardH = 72;
    const cardY = this.y - cardH;
    this.ensureSpace(cardH + 16);

    const cards = [
      {
        label: 'Visibility',
        sublabel: platformLabel(payload.platform),
        value: fmtPct(payload.visibilityPct),
        color: platformColor(payload.platform),
      },
      {
        label: 'Citation Rate',
        sublabel: 'queries cited',
        value: fmtPct(payload.citationRate),
        color: payload.citationRate >= 0.5 ? PASS_GREEN : payload.citationRate >= 0.25 ? WARN_AMBER : ACCENT,
      },
      {
        label: 'Avg. Rank',
        sublabel: 'when cited',
        value: fmtRank(payload.industryRank),
        color: ACCENT,
      },
    ];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      const cardX = MARGIN + i * (cardW + 8);

      // Card background
      this.page.drawRectangle({ x: cardX, y: cardY, width: cardW, height: cardH, color: SURFACE });

      // Accent top bar
      this.page.drawRectangle({ x: cardX, y: cardY + cardH - 4, width: cardW, height: 4, color: card.color });

      // Value — large
      const valW = this.fontBold.widthOfTextAtSize(card.value, 28);
      this.page.drawText(card.value, {
        x: cardX + (cardW - valW) / 2,
        y: cardY + cardH - 38,
        size: 28,
        font: this.fontBold,
        color: card.color,
      });

      // Label
      const lblW = this.fontBold.widthOfTextAtSize(card.label, 9);
      this.page.drawText(card.label, {
        x: cardX + (cardW - lblW) / 2,
        y: cardY + 22,
        size: 9,
        font: this.fontBold,
        color: INK,
      });

      // Sublabel
      const subW = this.font.widthOfTextAtSize(card.sublabel, 7);
      this.page.drawText(card.sublabel, {
        x: cardX + (cardW - subW) / 2,
        y: cardY + 10,
        size: 7,
        font: this.font,
        color: MUTED,
      });
    }

    this.y = cardY - 16;

    // Query coverage line below cards
    this.ensureSpace(20);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: MAX_W, height: 18, color: ROW_ALT });
    this.page.drawText(
      `Query coverage: ${fmtPct(payload.queryCoverage)}  ·  ${payload.prompts.length} queries tracked  ·  ${payload.prompts.filter((p) => p.cited).length} cited`,
      { x: MARGIN + 8, y: this.y, size: 9, font: this.font, color: MUTED }
    );
    this.y -= 28;
  }

  // ── Prompt performance table ───────────────────────────────────────────────

  drawPromptsTable(payload: GpmReportPayload): void {
    this.drawSectionTitle('Prompt Performance');

    // Header row
    this.ensureSpace(16);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: MAX_W, height: 16, color: PRIMARY });
    const headers: { text: string; x: number }[] = [
      { text: 'Query', x: MARGIN + 4 },
      { text: 'Cited?', x: MARGIN + 342 },
      { text: 'Rank', x: MARGIN + 390 },
      { text: 'Top Competitor', x: MARGIN + 428 },
    ];
    for (const h of headers) {
      this.page.drawText(h.text, { x: h.x, y: this.y + 1, size: 8, font: this.fontBold, color: WHITE });
    }
    this.y -= 18;

    let rowAlt = false;
    for (const prompt of payload.prompts) {
      const rowH = 18;
      this.ensureSpace(rowH + 4);

      if (rowAlt) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: MAX_W, height: rowH, color: ROW_ALT });
      }

      // Query text — truncated to fit ~55 chars
      const truncated = prompt.queryText.length > 55
        ? `${prompt.queryText.slice(0, 54)}\u2026`
        : prompt.queryText;
      this.page.drawText(truncated, { x: MARGIN + 4, y: this.y, size: 8, font: this.font, color: INK });

      // Cited badge
      const citedText = prompt.cited ? 'YES' : 'NO';
      const citedColor = prompt.cited ? PASS_GREEN : MUTED;
      this.page.drawText(citedText, {
        x: MARGIN + 342, y: this.y, size: 8, font: this.fontBold, color: citedColor,
      });

      // Rank
      this.page.drawText(fmtRank(prompt.rankPosition), {
        x: MARGIN + 390, y: this.y, size: 8, font: this.font, color: INK,
      });

      // Top competitor in this query
      const comp = prompt.topCompetitorInQuery ?? '\u2014';
      const compTrunc = comp.length > 20 ? `${comp.slice(0, 19)}\u2026` : comp;
      this.page.drawText(compTrunc, {
        x: MARGIN + 428, y: this.y, size: 8, font: this.font, color: MUTED,
      });

      this.y -= rowH;
      rowAlt = !rowAlt;
    }

    this.y -= 8;
  }

  // ── Competitor bar chart ───────────────────────────────────────────────────

  drawCompetitorChart(payload: GpmReportPayload): void {
    if (payload.competitors.length === 0) return;

    this.drawSectionTitle('Competitor Co-citations');
    this.drawText(
      'Domains or brands that appeared in AI responses alongside queries for your topic.',
      9, false, MUTED
    );
    this.y -= 8;

    const maxCount = Math.max(...payload.competitors.map((c) => c.citationCount), 1);
    const barMaxW = MAX_W - 160; // leave room for label + count
    const rowH = 20;

    for (const comp of payload.competitors) {
      this.ensureSpace(rowH + 4);

      const barW = Math.max(4, Math.round((comp.citationCount / maxCount) * barMaxW));
      const labelTrunc = comp.name.length > 28 ? `${comp.name.slice(0, 27)}\u2026` : comp.name;

      // Name
      this.page.drawText(labelTrunc, { x: MARGIN, y: this.y, size: 8, font: this.font, color: INK });

      // Bar
      const barX = MARGIN + 150;
      const barY = this.y - 4;
      this.page.drawRectangle({ x: barX, y: barY, width: barW, height: 12, color: ACCENT });

      // Count + pct
      const pct = payload.competitors[0] ? Math.round((comp.citationCount / payload.prompts.length) * 100) : 0;
      this.page.drawText(
        `${String(comp.citationCount)} query${comp.citationCount !== 1 ? 's' : ''} (${String(pct)}%)`,
        { x: barX + barW + 6, y: this.y, size: 8, font: this.font, color: MUTED }
      );

      this.y -= rowH;
    }

    this.y -= 8;
  }

  // ── Opportunities ──────────────────────────────────────────────────────────

  drawOpportunities(payload: GpmReportPayload): void {
    if (payload.opportunities.length === 0) {
      this.drawSectionTitle('Opportunities');
      this.drawText('Your brand appeared in all tracked queries this period.', 10, false, PASS_GREEN);
      this.y -= 8;
      return;
    }

    this.drawSectionTitle(`Opportunities (${String(payload.opportunities.length)})`);
    this.drawText(
      'These queries did not cite your domain. Consider building content that directly answers them.',
      9, false, MUTED
    );
    this.y -= 8;

    let i = 0;
    for (const opp of payload.opportunities) {
      this.ensureSpace(30);
      i += 1;
      const prefix = `${String(i).padStart(2, '0')}.`;

      this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: MAX_W, height: 22, color: ROW_ALT });
      this.page.drawText(prefix, { x: MARGIN + 4, y: this.y, size: 9, font: this.fontBold, color: MUTED });

      const qTrunc = opp.queryText.length > 80 ? `${opp.queryText.slice(0, 79)}\u2026` : opp.queryText;
      this.page.drawText(qTrunc, { x: MARGIN + 28, y: this.y, size: 9, font: this.font, color: INK });
      this.y -= 22;

      if (opp.topCompetitorInQuery) {
        this.drawText(`Who appeared instead: ${opp.topCompetitorInQuery}`, 8, false, MUTED, 28);
      }
      this.y -= 4;
    }

    this.y -= 8;
  }

  // ── Methodology footer page ────────────────────────────────────────────────

  drawMethodologyPage(payload: GpmReportPayload): void {
    this.drawPageFooter();
    this.newPage();

    this.drawSectionTitle('About This Report');
    this.y -= 4;

    const notes = [
      `Domain monitored: ${payload.domain}`,
      `Topic / location: ${payload.topic} \u00b7 ${payload.location}`,
      `Platform: ${platformLabel(payload.platform)} (model: ${payload.modelId})`,
      `Reporting period: ${formatWindowDate(payload.windowDate)}`,
      `Report generated: ${new Date(payload.reportedAt).toLocaleDateString('en-CA')}`,
      '',
      'Visibility % — share of tracked queries where your domain was cited or mentioned.',
      'Citation Rate — ratio of queries where a citation to your domain was extracted.',
      'Avg. Rank — average ordinal position of your citation when present; lower is better.',
      'Competitor co-citations — domains/brands found in the same AI responses as tracked queries.',
      '',
      'Data is collected by GEO-Pulse using a controlled benchmark query set. Results reflect',
      'observed AI responses at the time of measurement and may vary across sessions.',
    ];

    for (const note of notes) {
      if (!note) { this.y -= 6; continue; }
      this.drawText(note, 8.5, false, note.startsWith('Domain') || note.startsWith('Topic') || note.startsWith('Platform') || note.startsWith('Reporting') || note.startsWith('Report') ? INK : MUTED);
    }
  }

  // ── Serialize ──────────────────────────────────────────────────────────────

  async build(): Promise<Uint8Array> {
    this.drawPageFooter();
    return this.doc.save();
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function buildGpmReportPdf(payload: GpmReportPayload): Promise<Uint8Array> {
  const period = formatWindowDate(payload.windowDate);
  const builder = new GpmPdfBuilder();
  await builder.init(payload.domain, period);

  builder.drawCover(payload);
  builder.drawVisibilityCards(payload);
  builder.drawPromptsTable(payload);
  builder.drawCompetitorChart(payload);
  builder.drawOpportunities(payload);
  builder.drawMethodologyPage(payload);

  return builder.build();
}
