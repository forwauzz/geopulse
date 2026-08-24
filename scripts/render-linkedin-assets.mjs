/**
 * Renders the LinkedIn square mark and feed post graphics with sharp.
 *
 * Two defects in the existing assets drove this script:
 *
 *  1. Undersize. The posts shipped at 940x715; LinkedIn renders feed images at
 *     1200 wide and upscales anything smaller, which is what makes fine serif
 *     type look soft. Everything here renders at 1200x1500.
 *  2. Overlap. The shipped MSP post clipped its own subhead behind a mockup
 *     card, and the cover hid its headline under LinkedIn's avatar tile.
 *
 * Layout model: SVG places text on its baseline, so mixing "baseline" and "top
 * edge" in one cursor is what produces overlapping blocks. Every helper here
 * takes the TOP of its block and returns the BOTTOM; baselines are derived by
 * adding the ascent. Callers only ever add gaps between bottom and next top.
 *
 * Type note: the brandbook specifies Newsreader, which is not installed
 * locally, and sharp resolves SVG fonts against system fonts only. Georgia is
 * the closest installed transitional serif and is what renders here. Switching
 * to Newsreader means installing the font, not editing this script.
 *
 * Usage: node scripts/render-linkedin-assets.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BRANDING = path.join(ROOT, 'public', 'branding');
const SOCIAL = path.join(BRANDING, 'social');

// Brandbook section 4.
const INK = '#2C3435';
const INK_SOFT = '#586162';
const WORDMARK_GOLD = '#8A6D33';
const ACCENT_GOLD = '#B79C60';
const HERO_IVORY = '#F5F2E8';
const SURFACE = '#FFFFFF';
const OUTLINE = '#ABB4B5';
const TRACK = '#E3E9EA';
const SLATE = '#565E74';
const CHIP_FILL = '#F0E6CE';

const SERIF = 'Georgia, Cambria, serif';
const SANS = 'Segoe UI, Arial, Helvetica, sans-serif';

/** Baseline offset from the top of a line box, as a fraction of font size. */
const ASCENT = 0.78;

const POST_W = 1200;
const POST_H = 1500;
const MARGIN = 96;
const CONTENT_W = POST_W - MARGIN * 2;
const FOOTER_TOP = POST_H - 150;

const escapeXml = (value) =>
  String(value).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/**
 * Rough advance-width estimate. Only used to catch a line running past the
 * canvas edge, so it is deliberately pessimistic rather than precise.
 */
function estimateWidth(text, size, { serif = true, tracking = 0 } = {}) {
  const factor = serif ? 0.52 : 0.55;
  return text.length * size * factor + text.length * tracking;
}

function assertFits(label, text, size, maxWidth, options) {
  const width = estimateWidth(text, size, options);
  if (width > maxWidth) {
    throw new Error(
      `${label}: "${text}" needs ~${Math.round(width)}px but only ${maxWidth}px is available. ` +
        'Shorten the line or drop the font size.',
    );
  }
}

/**
 * Places one or more lines from the top of a block and returns its bottom.
 * This is the only place a baseline is computed.
 */
function textBlock(
  top,
  lines,
  {
    size,
    lineHeight = size * 1.3,
    fill = INK,
    family = SANS,
    weight = 400,
    tracking = 0,
    x = MARGIN,
    anchor = 'start',
    label = 'text',
    maxWidth = CONTENT_W,
  },
) {
  const serif = family === SERIF;
  const svg = lines
    .map((line, index) => {
      assertFits(label, line, size, maxWidth, { serif, tracking });
      const baseline = top + size * ASCENT + index * lineHeight;
      return (
        `<text x="${x}" y="${baseline}" fill="${fill}" text-anchor="${anchor}" ` +
        `font-family="${family}" font-size="${size}" font-weight="${weight}" ` +
        `letter-spacing="${tracking}">${escapeXml(line)}</text>`
      );
    })
    .join('\n');
  return { svg, bottom: top + (lines.length - 1) * lineHeight + size * 1.02 };
}

// ---------------------------------------------------------------- square mark

/**
 * The legacy mark is a landscape wordmark, so squaring it for an avatar leaves
 * roughly 4px of cap height at LinkedIn's 48px feed size. Stacking GEO over
 * PULSE roughly doubles the cap height in the same box.
 */
function squareMark({ background, wordColor, ruleColor }) {
  const size = 400;
  const wordSize = 92;
  const tracking = 6;
  const options = {
    size: wordSize,
    family: SERIF,
    fill: wordColor,
    tracking,
    x: size / 2,
    anchor: 'middle',
    label: 'mark',
    maxWidth: size - 60,
  };

  const geo = textBlock(96, ['GEO'], options);
  const pulse = textBlock(212, ['PULSE'], options);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${background}"/>
    ${geo.svg}
    <rect x="${(size - 210) / 2}" y="188" width="210" height="3" fill="${ruleColor}"/>
    ${pulse.svg}
  </svg>`;
}

// ------------------------------------------------------------------ post base

function header(top) {
  const word = textBlock(top, ['GEO-PULSE'], {
    size: 34,
    family: SERIF,
    fill: WORDMARK_GOLD,
    tracking: 4,
    label: 'wordmark',
  });
  return {
    svg: `${word.svg}\n<rect x="${MARGIN}" y="${word.bottom + 14}" width="88" height="3" fill="${ACCENT_GOLD}"/>`,
    bottom: word.bottom + 17,
  };
}

function chip(top, text) {
  const height = 48;
  const width = Math.round(estimateWidth(text, 21, { serif: false, tracking: 2.4 })) + 56;
  const inner = textBlock(top + 13, [text], {
    size: 21,
    fill: WORDMARK_GOLD,
    weight: 700,
    tracking: 2.4,
    x: MARGIN + 28,
    label: 'chip',
    maxWidth: CONTENT_W - 56,
  });
  return {
    svg: `<rect x="${MARGIN}" y="${top}" width="${width}" height="${height}" rx="24" fill="${CHIP_FILL}"/>\n${inner.svg}`,
    bottom: top + height,
  };
}

function footer() {
  const left = textBlock(FOOTER_TOP + 34, ['getgeopulse.com'], {
    size: 26,
    fill: INK_SOFT,
    weight: 600,
    tracking: 1.4,
    label: 'footer',
  });
  const right = textBlock(FOOTER_TOP + 34, ['MEASURE · FIX · VERIFY'], {
    size: 26,
    fill: ACCENT_GOLD,
    weight: 700,
    tracking: 2,
    x: POST_W - MARGIN,
    anchor: 'end',
    label: 'footer',
  });
  return `<rect x="${MARGIN}" y="${FOOTER_TOP}" width="${CONTENT_W}" height="2" fill="${OUTLINE}" opacity="0.5"/>\n${left.svg}\n${right.svg}`;
}

/** A scorecard rendered as real rows and real numbers rather than grey bars. */
function scorecardPanel(top, { domain, score, scoreNote, rows, scale = 100 }) {
  const headerH = 172;
  const rowH = 88;
  const height = headerH + rows.length * rowH + 20;
  const innerLeft = MARGIN + 48;
  const innerRight = POST_W - MARGIN - 48;

  const label = textBlock(top + 40, ['FICTIONAL DOMAIN'], {
    size: 21,
    fill: INK_SOFT,
    weight: 700,
    tracking: 2.6,
    x: innerLeft,
    label: 'panel label',
  });
  const domainText = textBlock(label.bottom + 12, [domain], {
    size: 28,
    fill: INK,
    x: innerLeft,
    label: 'panel domain',
  });
  const scoreText = textBlock(top + 34, [String(score)], {
    size: 82,
    family: SERIF,
    fill: INK,
    x: innerRight,
    anchor: 'end',
    label: 'panel score',
  });
  const scoreSub = textBlock(scoreText.bottom + 4, [scoreNote], {
    size: 24,
    fill: INK_SOFT,
    x: innerRight,
    anchor: 'end',
    label: 'panel score note',
  });

  const rowSvg = rows
    .map((row, index) => {
      const rowTop = top + headerH + index * rowH;
      const barW = Math.round((CONTENT_W - 96) * (row.value / scale));
      const name = textBlock(rowTop, [row.label], {
        size: 27,
        fill: INK,
        weight: 600,
        x: innerLeft,
        label: 'row label',
      });
      const value = textBlock(rowTop, [`${row.value} of ${scale}`], {
        size: 27,
        fill: INK_SOFT,
        x: innerRight,
        anchor: 'end',
        label: 'row value',
      });
      return `${name.svg}\n${value.svg}
        <rect x="${innerLeft}" y="${rowTop + 42}" width="${CONTENT_W - 96}" height="10" rx="5" fill="${TRACK}"/>
        <rect x="${innerLeft}" y="${rowTop + 42}" width="${barW}" height="10" rx="5" fill="${row.value / scale >= 0.7 ? SLATE : ACCENT_GOLD}"/>`;
    })
    .join('\n');

  return {
    svg: `<rect x="${MARGIN}" y="${top}" width="${CONTENT_W}" height="${height}" rx="14" fill="${SURFACE}" stroke="${OUTLINE}" stroke-opacity="0.5"/>
      ${label.svg}\n${domainText.svg}\n${scoreText.svg}\n${scoreSub.svg}\n${rowSvg}`,
    bottom: top + height,
  };
}

/** Renders a post from a linear block list, failing rather than clipping. */
function composePost(blocks) {
  const chunks = [];
  let cursor = 96;
  for (const { gap = 0, build } of blocks) {
    cursor += gap;
    const block = build(cursor);
    chunks.push(block.svg);
    cursor = block.bottom;
  }
  if (cursor > FOOTER_TOP - 24) {
    throw new Error(
      `post content reaches y=${Math.round(cursor)}, past the footer rule at ${FOOTER_TOP}. ` +
        'Cut a line or reduce a font size.',
    );
  }
  return `<svg width="${POST_W}" height="${POST_H}" viewBox="0 0 ${POST_W} ${POST_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${POST_W}" height="${POST_H}" fill="${HERO_IVORY}"/>
    ${chunks.join('\n')}
    ${footer()}
  </svg>`;
}

// ---------------------------------------------------------------------- posts

const readinessPost = () =>
  composePost([
    { build: (y) => header(y) },
    {
      gap: 44,
      build: (y) =>
        textBlock(y, ['FOR MSPs AND AGENCIES'], {
          size: 22,
          fill: INK_SOFT,
          weight: 700,
          tracking: 4,
          label: 'eyebrow',
        }),
    },
    {
      gap: 20,
      build: (y) =>
        textBlock(y, ['Can AI search', 'understand your', "client's site?"], {
          size: 74,
          family: SERIF,
          lineHeight: 88,
          label: 'headline',
        }),
    },
    {
      gap: 34,
      build: (y) =>
        textBlock(
          y,
          [
            'Measure crawl, structure, content and trust gaps —',
            'then show the client exactly what produced the score.',
          ],
          { size: 30, fill: INK_SOFT, lineHeight: 44, label: 'body' },
        ),
    },
    { gap: 38, build: (y) => chip(y, 'ILLUSTRATIVE EXAMPLE · NOT A CUSTOMER RESULT') },
    {
      gap: 38,
      build: (y) =>
        scorecardPanel(y, {
          domain: 'northstar-it.example',
          score: 62,
          scoreNote: '/100 · grade D',
          rows: [
            { label: 'Technical access', value: 84 },
            { label: 'Structure and schema', value: 58 },
            { label: 'Content clarity', value: 61 },
            { label: 'Trust signals', value: 45 },
          ],
        }),
    },
  ]);

const denominatorPost = () =>
  composePost([
    { build: (y) => header(y) },
    {
      gap: 44,
      build: (y) =>
        textBlock(y, ['CLIENT REPORTING'], {
          size: 22,
          fill: INK_SOFT,
          weight: 700,
          tracking: 4,
          label: 'eyebrow',
        }),
    },
    {
      gap: 20,
      build: (y) =>
        textBlock(y, ['Reporting should make', 'the agency look good.', 'But not by hiding', 'the denominator.'], {
          size: 68,
          family: SERIF,
          lineHeight: 82,
          label: 'headline',
        }),
    },
    {
      gap: 34,
      build: (y) =>
        textBlock(
          y,
          [
            'Three wins out of three checks is a story.',
            'Three out of forty is a measurement.',
            'Only one survives the next quarterly review.',
          ],
          { size: 30, fill: INK_SOFT, lineHeight: 44, label: 'body' },
        ),
    },
    { gap: 38, build: (y) => chip(y, 'ILLUSTRATIVE EXAMPLE · NOT A CUSTOMER RESULT') },
    {
      gap: 38,
      build: (y) =>
        scorecardPanel(y, {
          domain: 'northstar-it.example',
          score: 3,
          scoreNote: 'of 40 checks shown',
          scale: 40,
          rows: [
            { label: 'Checks run', value: 40 },
            { label: 'Checks passed', value: 15 },
            { label: 'Shown in the client report', value: 3 },
          ],
        }),
    },
  ]);

// ----------------------------------------------------------------------- main

async function main() {
  await mkdir(SOCIAL, { recursive: true });

  const targets = [
    {
      svg: squareMark({ background: HERO_IVORY, wordColor: WORDMARK_GOLD, ruleColor: ACCENT_GOLD }),
      out: path.join(BRANDING, 'geopulse-mark-square-light.png'),
    },
    {
      svg: squareMark({ background: INK, wordColor: '#D8BE7E', ruleColor: ACCENT_GOLD }),
      out: path.join(BRANDING, 'geopulse-mark-square-dark.png'),
    },
    {
      svg: readinessPost(),
      out: path.join(SOCIAL, 'linkedin-msp-ai-readiness-post-2026-08.png'),
    },
    {
      svg: denominatorPost(),
      out: path.join(SOCIAL, 'linkedin-agency-denominator-post-2026-08.png'),
    },
  ];

  for (const target of targets) {
    const info = await sharp(Buffer.from(target.svg)).png({ compressionLevel: 9 }).toFile(target.out);
    console.log(
      `${String(`${info.width}x${info.height}`).padEnd(11)} ` +
        `${String(`${(info.size / 1024).toFixed(0)}KB`).padStart(7)}  ${path.relative(ROOT, target.out)}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
