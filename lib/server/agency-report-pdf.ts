import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AgencyReportQuestion, AgencyReportSnapshotV2 } from './agency-report-snapshot';
import { GEO_PULSE_BRAND, type BrandConfig, type Rgb01 } from '../../workers/report/report-branding';

const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 46;
const INK = rgb(0.075, 0.09, 0.12);
const MUTED = rgb(0.34, 0.38, 0.43);
const LINE = rgb(0.88, 0.9, 0.92);
const PAPER = rgb(0.976, 0.98, 0.984);
const GREEN = rgb(0.05, 0.48, 0.36);
const AMBER = rgb(0.82, 0.48, 0.08);

type Fonts = { readonly regular: PDFFont; readonly bold: PDFFont };

function color(value: Rgb01) {
  return rgb(value.r, value.g, value.b);
}

function pct(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function reportScopeDisclosure(snapshot: AgencyReportSnapshotV2): string {
  return snapshot.scope.disclosure.replace(/\b1 AI assistants\b/g, '1 AI assistant');
}

function naturalList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function periodLabel(windowDate: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(windowDate);
  if (month) {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${month[1]}-${month[2]}-01T00:00:00.000Z`));
  }
  const week = /^(\d{4})-W(\d{2})$/.exec(windowDate);
  return week ? `Week ${String(Number(week[2]))}, ${week[1]}` : windowDate;
}

function reportMarketLabel(snapshot: AgencyReportSnapshotV2): string {
  const market = snapshot.integrity.market;
  const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(market.countryCode) ?? market.countryCode;
  return [market.locality, ...market.serviceAreas, country]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(', ');
}

function engineLabel(value: string): string {
  return value === 'chatgpt' ? 'ChatGPT' : value === 'gemini' ? 'Google Gemini' : value === 'perplexity' ? 'Perplexity' : value;
}

function safeText(value: string): string {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-');
}

function lines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out.length > 0 ? out : [''];
}

function drawWrapped(page: PDFPage, text: string, args: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly font: PDFFont;
  readonly size: number;
  readonly lineHeight?: number;
  readonly maxLines?: number;
  readonly fill?: ReturnType<typeof rgb>;
}): number {
  const lineHeight = args.lineHeight ?? args.size * 1.35;
  const rows = lines(text, args.font, args.size, args.width).slice(0, args.maxLines ?? 100);
  rows.forEach((row, index) => page.drawText(row, {
    x: args.x,
    y: args.y - index * lineHeight,
    size: args.size,
    font: args.font,
    color: args.fill ?? INK,
  }));
  return args.y - rows.length * lineHeight;
}

function drawFooter(page: PDFPage, fonts: Fonts, brand: BrandConfig, pageNumber: number) {
  page.drawLine({ start: { x: MARGIN, y: 32 }, end: { x: PAGE.width - MARGIN, y: 32 }, thickness: 0.7, color: LINE });
  page.drawText(safeText(brand.footerNote ?? (brand.showPoweredBy ? 'Prepared with GEO-Pulse' : brand.companyName)), {
    x: MARGIN,
    y: 18,
    size: 7.5,
    font: fonts.regular,
    color: MUTED,
  });
  page.drawText(String(pageNumber), { x: PAGE.width - MARGIN - 5, y: 18, size: 7.5, font: fonts.bold, color: MUTED });
}

function drawSectionTitle(page: PDFPage, fonts: Fonts, eyebrow: string, title: string, y: number): number {
  page.drawText(eyebrow.toUpperCase(), { x: MARGIN, y, size: 7.5, font: fonts.bold, color: MUTED });
  page.drawText(safeText(title), { x: MARGIN, y: y - 28, size: 23, font: fonts.bold, color: INK });
  return y - 54;
}

function resultMark(question: AgencyReportQuestion): string {
  return `${String(question.citedByEngines)}/${String(question.enginesMeasured)}`;
}

export function buildAgencyReportCoverHeadline(snapshot: AgencyReportSnapshotV2): {
  readonly eyebrow: string;
  readonly metric: string;
  readonly statement: string;
  readonly detail: string;
  readonly isBaseline: boolean;
} {
  if (snapshot.evaluationsCited === 0) {
    return {
      eyebrow: 'THE STARTING POINT',
      metric: 'Baseline',
      statement: `established across ${String(snapshot.evaluationsTracked)} measured AI answers`,
      detail: `0 citations recorded; future progress will be measured against this exact scope.`,
      isBaseline: true,
    };
  }
  return {
    eyebrow: 'THE HEADLINE',
    metric: pct(snapshot.combinedVisibilityPct),
    statement: `of measured AI answers cited ${snapshot.clientName}`,
    detail: `${String(snapshot.evaluationsCited)} citations across ${String(snapshot.evaluationsTracked)} answer evaluations`,
    isBaseline: false,
  };
}

export function buildAgencyReportOverviewTitle(snapshot: AgencyReportSnapshotV2): string {
  return snapshot.evaluationsCited === 0
    ? 'Your measured starting point'
    : 'Where the brand appears today';
}

function isClinicReportTopic(topic: string): boolean {
  return /\b(clinic|medical|medicine|healthcare|health care|physician|doctor)\b/i.test(topic);
}

export function buildAgencyOpportunityAction(
  question: AgencyReportQuestion,
  context: { readonly location: string; readonly topic: string },
): string {
  const normalized = question.queryText.toLowerCase();
  const { location, topic } = context;
  if (isClinicReportTopic(topic)) {
    if (/executive health|annual (preventive )?health assessment|preventive screening/.test(normalized)) {
      return 'Strengthen the executive and preventive health page with verified eligibility, assessment components, expected timing, the cost-confirmation path, and one clear booking step.';
    }
    if (/weight (management|loss)/.test(normalized)) {
      return 'Strengthen the medical weight-management page with verified eligibility, the physician-led process, program components, follow-up expectations, safety limits, and a consultation step.';
    }
    if (/pediatric|child|children/.test(normalized) && /urgent|same-day|same day|prompt/.test(normalized)) {
      return 'Strengthen the pediatric urgent-care page with verified age range, conditions handled, availability, booking instructions, and clear guidance for symptoms that require emergency care.';
    }
    if (/travel clinic|travel vaccination|travel medicine/.test(normalized)) {
      return 'Strengthen the travel-clinic page with verified consultation steps, vaccine and certificate availability, recommended booking lead time, pricing access, and the appointment path.';
    }
    if (/women'?s health|gynecolog|contraception|menopause/.test(normalized)) {
      return "Strengthen the women's-health page with verified services, who each service is for, privacy and appointment details, pricing access, and one booking step.";
    }
    if (/membership|ongoing family medicine|continuity/.test(normalized)) {
      return 'Explain the verified membership and family-medicine options in one comparison-ready page: who each option serves, what is included, access expectations, fees, and how to enroll.';
    }
    if (/same-day|same day|next-day|next day|urgent care/.test(normalized)) {
      return `Strengthen the rapid-access care page with verified availability in ${location}, conditions handled, booking instructions, fees, and emergency-care exclusions.`;
    }
  }
  if (/how much|price|pricing|cost|pay/.test(normalized)) {
    return `Publish a clear cost and access guide for ${location}, including only verified fees, eligibility details, and the next step to inquire or book.`;
  }
  if (/review|trust|expertise|proof|known for/.test(normalized)) {
    return 'Strengthen the relevant service page with verifiable credentials, service details, and permitted customer proof. Avoid unsupported superiority claims.';
  }
  if (/compare|alternative|best|choose|specific needs/.test(normalized)) {
    return `Create a decision-ready page that explains who the service is for, what is offered in ${location}, why it may fit, and the next step to inquire or book.`;
  }
  return `Answer this question directly on the most relevant service page with verifiable details, local context for ${location}, and one clear next step.`;
}

export function buildAgencyExecutiveSummary(snapshot: AgencyReportSnapshotV2): string {
  if (snapshot.evaluationsCited === 0) {
    const opportunity = snapshot.opportunities[0];
    const next = opportunity
      ? `Start with "${opportunity.queryText}" and strengthen the relevant service page with a direct, verifiable answer.`
      : 'The next cycle should focus on earning consistent citations across the measured buyer questions.';
    return `This report establishes a transparent starting point for ${snapshot.clientName} across ${String(snapshot.evaluationsTracked)} measured AI answers. No citation was recorded in this first period, so future work can be compared against one consistent scope. ${next}`;
  }
  const opening = `${snapshot.clientName} appeared in ${String(snapshot.evaluationsCited)} of ${String(snapshot.evaluationsTracked)} measured AI answers (${pct(snapshot.combinedVisibilityPct)}) during ${periodLabel(snapshot.windowDate)}.`;
  const win = snapshot.wins[0]
    ? `The strongest result was "${snapshot.wins[0].queryText}", where ${String(snapshot.wins[0].citedByEngines)} of ${String(snapshot.wins[0].enginesMeasured)} assistants cited the brand.`
    : 'This period established a transparent baseline with no cited buyer question yet.';
  const opportunity = snapshot.opportunities[0]
    ? `The clearest growth opportunity is "${snapshot.opportunities[0].queryText}"; make the relevant service page the most specific, verifiable answer to that question.`
    : 'Every selected buyer question earned at least one citation; the next priority is increasing consistency across assistants.';
  return `${opening} ${win} ${opportunity}`;
}

export async function buildAgencyReportPdf(snapshot: AgencyReportSnapshotV2, options?: {
  readonly brand?: BrandConfig;
  readonly logoBytes?: Uint8Array | null;
}): Promise<Uint8Array> {
  const brand = options?.brand ?? GEO_PULSE_BRAND;
  const doc = await PDFDocument.create();
  doc.setTitle(`${snapshot.clientName} AI Visibility Performance Report`);
  doc.setSubject(`${periodLabel(snapshot.windowDate)} measured AI visibility`);
  doc.setAuthor(brand.companyName);
  doc.setCreator('GEO-Pulse canonical agency report v2');
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const cover = doc.addPage([PAGE.width, PAGE.height]);
  const primary = color(brand.primary);
  const onPrimary = color(brand.onPrimary);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: PAPER });
  cover.drawRectangle({ x: 0, y: PAGE.height - 330, width: PAGE.width, height: 330, color: primary });
  cover.drawRectangle({ x: 0, y: PAGE.height - 336, width: PAGE.width, height: 6, color: rgb(0.92, 0.65, 0.16) });

  let logoDrawn = false;
  if (options?.logoBytes && brand.logo) {
    try {
      const logo = brand.logo.mime === 'image/png'
        ? await doc.embedPng(options.logoBytes)
        : await doc.embedJpg(options.logoBytes);
      const scale = Math.min(122 / logo.width, 38 / logo.height);
      cover.drawImage(logo, { x: MARGIN, y: PAGE.height - 76, width: logo.width * scale, height: logo.height * scale });
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) cover.drawText(safeText(brand.companyName), { x: MARGIN, y: PAGE.height - 62, size: 17, font: fonts.bold, color: onPrimary });
  cover.drawText('AI VISIBILITY PERFORMANCE REPORT', {
    x: MARGIN,
    y: PAGE.height - 126,
    size: 8,
    font: fonts.bold,
    color: onPrimary,
  });
  drawWrapped(cover, snapshot.clientName, { x: MARGIN, y: PAGE.height - 172, width: 410, font: fonts.bold, size: 31, lineHeight: 35, maxLines: 2, fill: onPrimary });
  cover.drawText(`${safeText(snapshot.topic)} | ${safeText(snapshot.location)} | ${periodLabel(snapshot.windowDate)}`, {
    x: MARGIN,
    y: PAGE.height - 274,
    size: 10,
    font: fonts.regular,
    color: onPrimary,
  });

  const headline = buildAgencyReportCoverHeadline(snapshot);
  cover.drawText(headline.eyebrow, { x: MARGIN, y: 445, size: 8, font: fonts.bold, color: MUTED });
  if (headline.isBaseline) {
    drawWrapped(cover, headline.metric, { x: MARGIN, y: 395, width: 170, font: fonts.bold, size: 34, lineHeight: 38, maxLines: 2, fill: primary });
  } else {
    cover.drawText(headline.metric, { x: MARGIN, y: 350, size: 74, font: fonts.bold, color: primary });
  }
  drawWrapped(cover, headline.statement, {
    x: 236, y: 402, width: 300, font: fonts.bold, size: 19, lineHeight: 24, maxLines: 3,
  });
  drawWrapped(cover, headline.detail, {
    x: 238, y: 333, width: PAGE.width - MARGIN - 238, size: 9.5, lineHeight: 12, maxLines: 2, font: fonts.regular, fill: MUTED,
  });
  drawWrapped(cover, buildAgencyExecutiveSummary(snapshot), {
    x: MARGIN, y: 265, width: PAGE.width - MARGIN * 2, font: fonts.regular, size: 11.5, lineHeight: 17, maxLines: 8,
  });
  cover.drawText(`Report profile ${snapshot.profileVersion} | ${reportScopeDisclosure(snapshot)}`, {
    x: MARGIN, y: 58, size: 7.2, font: fonts.regular, color: MUTED, maxWidth: PAGE.width - MARGIN * 2,
  });
  drawFooter(cover, fonts, brand, 1);

  const overview = doc.addPage([PAGE.width, PAGE.height]);
  overview.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) });
  let y = drawSectionTitle(overview, fonts, 'Performance overview', buildAgencyReportOverviewTitle(snapshot), PAGE.height - MARGIN);
  const cardGap = 10;
  const cardWidth = (PAGE.width - MARGIN * 2 - cardGap * 2) / 3;
  snapshot.engines.forEach((engine, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    overview.drawRectangle({ x, y: y - 112, width: cardWidth, height: 102, color: PAPER, borderColor: LINE, borderWidth: 0.7 });
    overview.drawText(engine.label, { x: x + 14, y: y - 34, size: 9, font: fonts.bold, color: MUTED });
    overview.drawText(pct(engine.visibilityPct), { x: x + 14, y: y - 75, size: 29, font: fonts.bold, color: engine.visibilityPct > 0 ? GREEN : AMBER });
    overview.drawText(`${String(engine.queriesCited)} of ${String(engine.queriesTracked)} answers`, { x: x + 14, y: y - 94, size: 8.5, font: fonts.regular, color: MUTED });
  });
  y -= 146;
  if (snapshot.settings.sections.executiveSummary) {
    overview.drawText('EXECUTIVE READOUT', { x: MARGIN, y, size: 8, font: fonts.bold, color: MUTED });
    y = drawWrapped(overview, buildAgencyExecutiveSummary(snapshot), { x: MARGIN, y: y - 24, width: PAGE.width - MARGIN * 2, font: fonts.regular, size: 12, lineHeight: 18, maxLines: 8 });
    y -= 20;
  }
  if (snapshot.settings.sections.scopeStatement) {
    overview.drawRectangle({ x: MARGIN, y: y - 138, width: PAGE.width - MARGIN * 2, height: 128, color: PAPER });
    overview.drawText('MEASUREMENT SCOPE', { x: MARGIN + 16, y: y - 34, size: 8, font: fonts.bold, color: MUTED });
    drawWrapped(overview, reportScopeDisclosure(snapshot), { x: MARGIN + 16, y: y - 55, width: PAGE.width - MARGIN * 2 - 32, font: fonts.bold, size: 10, lineHeight: 13, maxLines: 2 });
    overview.drawText(`Business: ${safeText(snapshot.integrity.businessName)} | Market: ${safeText(reportMarketLabel(snapshot))} (${safeText(snapshot.integrity.market.scope)}) | Languages: ${safeText(snapshot.integrity.market.languages.join(', '))}`, {
      x: MARGIN + 16, y: y - 87, size: 7.6, font: fonts.regular, color: MUTED, maxWidth: PAGE.width - MARGIN * 2 - 32,
    });
    overview.drawText(`Period: ${periodLabel(snapshot.windowDate)} | Prompts: ${String(snapshot.integrity.selectedPromptKeys.length)}/${String(snapshot.integrity.availablePromptKeys.length)} | Engines: ${safeText(snapshot.integrity.measuredEngines.map(engineLabel).join(', '))}`, {
      x: MARGIN + 16, y: y - 105, size: 7.6, font: fonts.regular, color: MUTED, maxWidth: PAGE.width - MARGIN * 2 - 32,
    });
    overview.drawText(`Approved comparison set: ${safeText(snapshot.integrity.competitorDomains.join(', ') || 'none configured')} | Captured ${new Date(snapshot.reportedAt).toISOString().slice(0, 10)}`, {
      x: MARGIN + 16, y: y - 123, size: 7.6, font: fonts.regular, color: MUTED, maxWidth: PAGE.width - MARGIN * 2 - 32,
    });
  }
  drawFooter(overview, fonts, brand, 2);

  if (snapshot.settings.sections.trendOverTime && snapshot.trend.length > 1) {
    const trendPage = doc.addPage([PAGE.width, PAGE.height]);
    trendPage.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) });
    const trendY = drawSectionTitle(trendPage, fonts, 'Momentum', `Visibility over the selected ${String(snapshot.comparisonMonths)}-month horizon`, PAGE.height - MARGIN);
    const chartX = MARGIN;
    const chartY = trendY - 300;
    const chartHeight = 230;
    const gap = 12;
    const barWidth = Math.min(56, (PAGE.width - MARGIN * 2 - gap * (snapshot.trend.length - 1)) / snapshot.trend.length);
    snapshot.trend.forEach((point, index) => {
      const x = chartX + index * (barWidth + gap);
      const height = Math.max(5, chartHeight * point.visibilityPct);
      trendPage.drawRectangle({ x, y: chartY, width: barWidth, height: chartHeight, color: PAPER });
      trendPage.drawRectangle({ x, y: chartY, width: barWidth, height, color: primary });
      trendPage.drawText(pct(point.visibilityPct), { x, y: chartY + chartHeight + 15, size: 9, font: fonts.bold, color: INK });
      trendPage.drawText(safeText(point.windowDate), { x, y: chartY - 18, size: 7.5, font: fonts.regular, color: MUTED });
    });
    const first = snapshot.trend[0]!;
    const last = snapshot.trend.at(-1)!;
    const delta = Math.round((last.visibilityPct - first.visibilityPct) * 100);
    drawWrapped(trendPage, `${delta === 0 ? 'Visibility held steady' : `${delta > 0 ? '+' : ''}${String(delta)} percentage points`} across ${String(snapshot.trend.length)} comparable monthly measurements.`, { x: MARGIN, y: chartY - 70, width: PAGE.width - MARGIN * 2, font: fonts.bold, size: 15, lineHeight: 20 });
    drawFooter(trendPage, fonts, brand, doc.getPageCount());
  }

  if (snapshot.settings.sections.buyerQuestions || snapshot.settings.sections.promptPerformance) {
    const matrix = doc.addPage([PAGE.width, PAGE.height]);
    matrix.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) });
    let rowY = drawSectionTitle(matrix, fonts, 'Evidence', 'Buyer-question performance', PAGE.height - MARGIN);
    matrix.drawText('Question', { x: MARGIN, y: rowY, size: 8, font: fonts.bold, color: MUTED });
    matrix.drawText('Cited by', { x: PAGE.width - MARGIN - 62, y: rowY, size: 8, font: fonts.bold, color: MUTED });
    rowY -= 17;
    const rows = snapshot.questions.slice(0, 14);
    for (const [index, question] of rows.entries()) {
      const rowHeight = 39;
      if (index % 2 === 0) matrix.drawRectangle({ x: MARGIN, y: rowY - rowHeight + 7, width: PAGE.width - MARGIN * 2, height: rowHeight, color: PAPER });
      drawWrapped(matrix, question.queryText, { x: MARGIN + 9, y: rowY - 7, width: PAGE.width - MARGIN * 2 - 92, font: fonts.regular, size: 9, lineHeight: 12, maxLines: 2 });
      matrix.drawText(resultMark(question), {
        x: PAGE.width - MARGIN - 50,
        y: rowY - 10,
        size: 10,
        font: fonts.bold,
        color: question.citedByEngines > 0 ? GREEN : AMBER,
      });
      rowY -= rowHeight;
    }
    if (snapshot.questions.length > rows.length) matrix.drawText(`Plus ${String(snapshot.questions.length - rows.length)} additional measured questions in the digital report.`, { x: MARGIN, y: rowY - 6, size: 8.5, font: fonts.regular, color: MUTED });
    drawFooter(matrix, fonts, brand, doc.getPageCount());
  }

  if (snapshot.settings.sections.opportunities || snapshot.settings.sections.competitorsTracked) {
    const growth = doc.addPage([PAGE.width, PAGE.height]);
    growth.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) });
    let growthY = drawSectionTitle(growth, fonts, 'Growth plan', 'What to do next', PAGE.height - MARGIN);
    if (snapshot.settings.sections.opportunities) {
      growth.drawText('RECOMMENDED ACTION PLAN', { x: MARGIN, y: growthY, size: 8, font: fonts.bold, color: MUTED });
      growthY -= 24;
      const opportunities = snapshot.opportunities.slice(0, 3);
      if (opportunities.length === 0) {
        growthY = drawWrapped(growth, 'Every selected buyer question earned at least one citation. Focus next on consistency across all measured assistants.', { x: MARGIN, y: growthY, width: PAGE.width - MARGIN * 2, font: fonts.regular, size: 11, lineHeight: 16 });
      } else {
        opportunities.forEach((question, index) => {
          growth.drawText(String(index + 1).padStart(2, '0'), { x: MARGIN, y: growthY, size: 11, font: fonts.bold, color: AMBER });
          growthY = drawWrapped(growth, question.queryText, { x: MARGIN + 34, y: growthY, width: PAGE.width - MARGIN * 2 - 34, font: fonts.bold, size: 10.5, lineHeight: 14, maxLines: 2 }) - 3;
          growthY = drawWrapped(growth, buildAgencyOpportunityAction(question, {
            location: snapshot.location,
            topic: snapshot.topic,
          }), { x: MARGIN + 34, y: growthY, width: PAGE.width - MARGIN * 2 - 34, font: fonts.regular, size: 9, lineHeight: 12, maxLines: 3, fill: MUTED }) - 11;
        });
      }
      growthY -= 20;
    }
    if (snapshot.settings.sections.competitorsTracked) {
      growth.drawText('MARKET SIGNAL OBSERVED', { x: MARGIN, y: growthY, size: 8, font: fonts.bold, color: MUTED });
      growthY -= 28;
      const competitors = snapshot.competitors.slice(0, 6);
      if (competitors.length === 0) {
        growth.drawText('No competing domain was captured in the selected scope.', { x: MARGIN, y: growthY, size: 10, font: fonts.regular, color: MUTED });
      } else {
        competitors.forEach((competitor) => {
          const max = competitors[0]!.appearedInsteadCount || 1;
          const barWidth = 260 * (competitor.appearedInsteadCount / max);
          growth.drawText(safeText(competitor.name), { x: MARGIN, y: growthY, size: 9.5, font: fonts.bold, color: INK });
          growth.drawRectangle({ x: 240, y: growthY - 2, width: 260, height: 8, color: LINE });
          growth.drawRectangle({ x: 240, y: growthY - 2, width: barWidth, height: 8, color: primary });
          growth.drawText(String(competitor.appearedInsteadCount), { x: 510, y: growthY, size: 8.5, font: fonts.bold, color: MUTED });
          growthY -= 30;
        });
        drawWrapped(growth, 'This is a measured reference point inside the selected question set, not a claim of overall market leadership.', { x: MARGIN, y: growthY - 2, width: PAGE.width - MARGIN * 2, font: fonts.regular, size: 8.5, lineHeight: 12, maxLines: 2, fill: MUTED });
      }
    }
    drawFooter(growth, fonts, brand, doc.getPageCount());
  }

  if (snapshot.settings.sections.methodology) {
    const method = doc.addPage([PAGE.width, PAGE.height]);
    method.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: PAPER });
    let methodY = drawSectionTitle(method, fonts, 'Transparency', 'How to read this report', PAGE.height - MARGIN);
    const unavailableLabels = snapshot.unavailableEngines.map((engine) => engine === 'gemini' ? 'Google Gemini' : engine === 'chatgpt' ? 'ChatGPT' : 'Perplexity');
    const notes = [
      ['Visibility', 'The share of completed, selected answer evaluations in which the measured domain was cited. The combined figure is recalculated from this report\'s exact engine and prompt scope.'],
      ['Selection', reportScopeDisclosure(snapshot)],
      ['Identity and market', `${snapshot.integrity.businessName} (${snapshot.integrity.canonicalDomain}) was measured for ${reportMarketLabel(snapshot)} in ${snapshot.integrity.market.languages.join(', ')}.`],
      ['Competitor scope', snapshot.integrity.competitorDomains.length > 0 ? `Only these approved comparison businesses were tracked: ${naturalList(snapshot.integrity.competitorDomains)}.` : 'No comparison businesses were configured for this measurement.'],
      ['Unavailable assistants', unavailableLabels.length > 0 ? `${naturalList(unavailableLabels)} ${unavailableLabels.length === 1 ? 'was' : 'were'} omitted because ${unavailableLabels.length === 1 ? 'its measurement did' : 'their measurements did'} not pass the report quality gate; ${unavailableLabels.length === 1 ? 'it was' : 'they were'} not scored as zero.` : 'Every selected assistant passed the report quality gate with a complete measurement.'],
      ['Variance', 'AI answers can vary by session and over time. This artifact is a dated measurement, not a guarantee of future placement.'],
      ['Reproducibility', `Report profile ${snapshot.profileVersion}. Source runs remain attached to the stored snapshot for audit and regeneration.`],
    ] as const;
    for (const [title, body] of notes) {
      method.drawText(title.toUpperCase(), { x: MARGIN, y: methodY, size: 8, font: fonts.bold, color: primary });
      methodY = drawWrapped(method, body, { x: MARGIN, y: methodY - 22, width: PAGE.width - MARGIN * 2, font: fonts.regular, size: 11, lineHeight: 16, maxLines: 5 }) - 24;
    }
    drawFooter(method, fonts, brand, doc.getPageCount());
  }

  return doc.save();
}
