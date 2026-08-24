/**
 * Three humour posts for LinkedIn, built on the mechanics in the saved
 * reference memes but retargeted from developers to MSP and agency owners.
 *
 * The reels swipe file identifies humour/persona as a proven outlier driver
 * (6.0M and 3.1M against a 20-45k baseline) and the one mechanic GEO-Pulse has
 * never used. The reference memes carry their joke in borrowed imagery — a DC
 * character, a press photograph — which this brand cannot post from a company
 * page. So the punchline here is the data instead: the same measured panels the
 * product ships, arranged so the number is the joke.
 *
 * Usage: node scripts/render-humor-posts.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  ACCENT_GOLD,
  CHIP_FILL,
  INK_SOFT,
  OUTLINE,
  body,
  chip,
  composePost,
  eyebrow,
  header,
  headline,
  panelLabel,
  rowsPanel,
  statementCard,
} from './lib/brand-canvas.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'output', 'social', 'linkedin-humor-2026-08');

/**
 * Reference: "What I imagined X would be like / after half an hour of X".
 * Expectation-versus-reality, told with two versions of the same month.
 */
const sameMonthPost = () =>
  composePost([
    { build: header },
    { gap: 38, build: (y) => eyebrow(y, 'CLIENT REPORTING') },
    { gap: 14, build: (y) => headline(y, ['Same month.', 'Same client.', 'Two reports.'], 64) },
    { gap: 40, build: (y) => panelLabel(y, 'WHAT THE REPORT SHOWED', INK_SOFT) },
    {
      gap: 12,
      build: (y) =>
        rowsPanel(y, {
          rows: [
            { label: 'Pages we optimized', display: '3 of 3', ratio: 1 },
            { label: 'Schema blocks added', display: '2 of 2', ratio: 1 },
            { label: 'Issues resolved', display: '5 of 5', ratio: 1 },
          ],
        }),
    },
    { gap: 34, build: (y) => panelLabel(y, 'WHAT ALL 40 CHECKS SHOWED') },
    {
      gap: 12,
      build: (y) =>
        rowsPanel(y, {
          rows: [
            { label: 'Checks actually run', display: '40', ratio: 1 },
            { label: 'Checks passing', display: '15 of 40', ratio: 0.375 },
            { label: 'Checks in the report', display: '3 of 40', ratio: 0.075 },
          ],
        }),
    },
  ]);

/**
 * Reference: the deadpan two-line setup with a flat reaction beat. The reaction
 * here is an empty record — the absence is the punchline.
 */
const measurementPost = () =>
  composePost([
    { build: header },
    { gap: 38, build: (y) => eyebrow(y, 'AI SEARCH CLAIMS') },
    {
      gap: 14,
      build: (y) => headline(y, ['Every agency now says', 'they optimize for', 'AI search.'], 64),
    },
    { gap: 34, build: (y) => body(y, ['Ask one to show last month’s measurement.']) },
    { gap: 40, build: (y) => panelLabel(y, 'LAST MEASUREMENT ON FILE') },
    {
      gap: 12,
      build: (y) =>
        rowsPanel(y, {
          muted: true,
          rows: [
            { label: 'Checks run', display: '—', ratio: 0 },
            { label: 'Baseline date', display: '—', ratio: 0 },
            { label: 'Denominator shown', display: '—', ratio: 0 },
            { label: 'Competitor comparison', display: '—', ratio: 0 },
            { label: 'Method disclosed', display: '—', ratio: 0 },
          ],
        }),
    },
    { gap: 40, build: (y) => chip(y, 'IF IT WASN’T MEASURED, IT WASN’T OPTIMIZED') },
  ]);

/**
 * Reference: the "checkpoint — show me yours" engagement prompt, which asks for
 * a reply rather than a scroll. Kept, with the ask pointed at something the
 * audience actually has on file.
 */
const checkpointPost = () =>
  composePost(
    [
      { build: header },
      { gap: 38, build: (y) => eyebrow(y, 'REPORTING CHECKPOINT') },
      {
        gap: 14,
        build: (y) =>
          headline(y, ['Show me the last', 'AI visibility number', 'you sent a client.'], 64),
      },
      {
        gap: 34,
        build: (y) => body(y, ['No denominator, no date?', 'Then it is not a number.']),
      },
      {
        gap: 38,
        build: (y) =>
          statementCard(y, {
            tag: 'NOT A NUMBER',
            tagColor: INK_SOFT,
            accent: OUTLINE,
            italic: true,
            lines: ['“AI visibility improved', 'this month.”'],
          }),
      },
      {
        gap: 26,
        build: (y) =>
          statementCard(y, {
            tag: 'A NUMBER',
            tagColor: ACCENT_GOLD,
            accent: ACCENT_GOLD,
            lines: ['15 of 40 checks passing,', 'measured 2 August 2026.'],
          }),
      },
      {
        gap: 34,
        build: (y) =>
          body(y, [
            'Most agencies have the first one on file.',
            'Clients eventually ask for the second.',
          ]),
      },
      { gap: 30, build: (y) => chip(y, 'REPLY WITH YOURS', { fill: CHIP_FILL }) },
    ],
    { footerRight: 'MEASURE · FIX · VERIFY' },
  );

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { svg: sameMonthPost(), name: 'same-month-two-reports' },
    { svg: measurementPost(), name: 'everyone-says-they-optimize' },
    { svg: checkpointPost(), name: 'reporting-checkpoint' },
  ];

  for (const target of targets) {
    const out = path.join(OUT_DIR, `${target.name}.jpg`);
    const info = await sharp(Buffer.from(target.svg))
      // 4:4:4 keeps the gold wordmark and rules from bleeding; chroma
      // subsampling is what makes coloured type look muddy at this size.
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
      .toFile(out);
    console.log(
      `${String(`${info.width}x${info.height}`).padEnd(11)} ` +
        `${String(`${(info.size / 1024).toFixed(0)}KB`).padStart(7)}  ${path.relative(ROOT, out)}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
