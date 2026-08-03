/**
 * Shared layout primitives for GEO-Pulse social graphics.
 *
 * SVG places text on its baseline, so mixing "baseline" and "top edge" in one
 * cursor is what produced the clipped subhead in the 2026-07 posts. Every
 * helper here takes the TOP of its block and returns the BOTTOM; baselines are
 * derived internally. Callers only ever add gaps between bottom and next top,
 * and composePost throws rather than emitting a clipped image.
 *
 * Colours are the brandbook section 4 light palette. Type falls back to
 * Georgia because sharp resolves SVG fonts against installed system fonts and
 * the brandbook's Newsreader is not installed locally.
 */

export const INK = '#2C3435';
export const INK_SOFT = '#586162';
export const WORDMARK_GOLD = '#8A6D33';
export const ACCENT_GOLD = '#B79C60';
export const HERO_IVORY = '#F5F2E8';
export const SURFACE = '#FFFFFF';
export const OUTLINE = '#ABB4B5';
export const TRACK = '#E3E9EA';
export const SLATE = '#565E74';
export const CHIP_FILL = '#F0E6CE';

export const SERIF = 'Georgia, Cambria, serif';
export const SANS = 'Segoe UI, Arial, Helvetica, sans-serif';

/** Baseline offset from the top of a line box, as a fraction of font size. */
const ASCENT = 0.78;

export const POST_W = 1200;
export const POST_H = 1500;
export const MARGIN = 96;
export const CONTENT_W = POST_W - MARGIN * 2;
export const FOOTER_TOP = POST_H - 150;

export const escapeXml = (value) =>
  String(value).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/**
 * Rough advance-width estimate. Only used to catch a line running past the
 * canvas edge, so it is deliberately pessimistic rather than precise.
 */
export function estimateWidth(text, size, { serif = true, tracking = 0 } = {}) {
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

/** Places lines from the top of a block and returns its bottom. */
export function textBlock(
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
    italic = false,
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
        `font-style="${italic ? 'italic' : 'normal'}" ` +
        `letter-spacing="${tracking}">${escapeXml(line)}</text>`
      );
    })
    .join('\n');
  return { svg, bottom: top + (lines.length - 1) * lineHeight + size * 1.02 };
}

export function header(top) {
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

export const eyebrow = (top, text) =>
  textBlock(top, [text], {
    size: 22,
    fill: INK_SOFT,
    weight: 700,
    tracking: 4,
    label: 'eyebrow',
  });

export const headline = (top, lines, size = 68) =>
  textBlock(top, lines, { size, family: SERIF, lineHeight: size * 1.2, label: 'headline' });

export const body = (top, lines, size = 30) =>
  textBlock(top, lines, { size, fill: INK_SOFT, lineHeight: size * 1.47, label: 'body' });

export function chip(top, text, { fill = CHIP_FILL, color = WORDMARK_GOLD } = {}) {
  const height = 48;
  const width = Math.round(estimateWidth(text, 21, { serif: false, tracking: 2.4 })) + 56;
  const inner = textBlock(top + 13, [text], {
    size: 21,
    fill: color,
    weight: 700,
    tracking: 2.4,
    x: MARGIN + 28,
    label: 'chip',
    maxWidth: CONTENT_W - 56,
  });
  return {
    svg: `<rect x="${MARGIN}" y="${top}" width="${width}" height="${height}" rx="24" fill="${fill}"/>\n${inner.svg}`,
    bottom: top + height,
  };
}

/** A caption above a panel, in the tracked sans used for section labels. */
export const panelLabel = (top, text, color = WORDMARK_GOLD) =>
  textBlock(top, [text], {
    size: 21,
    fill: color,
    weight: 700,
    tracking: 2.6,
    label: 'panel label',
  });

/**
 * Rows of measured values with proportional bars. `scale` is the real
 * denominator so a "3 of 40" row cannot be drawn as if it were 3%.
 */
export function rowsPanel(top, { rows, scale = 100, muted = false }) {
  const rowH = 88;
  const height = 26 + rows.length * rowH;
  const innerLeft = MARGIN + 48;
  const innerRight = POST_W - MARGIN - 48;

  const rowSvg = rows
    .map((row, index) => {
      const rowTop = top + 26 + index * rowH;
      const ratio = row.ratio ?? row.value / scale;
      const barW = Math.max(6, Math.round((CONTENT_W - 96) * ratio));
      const name = textBlock(rowTop, [row.label], {
        size: 27,
        fill: muted ? INK_SOFT : INK,
        weight: 600,
        x: innerLeft,
        label: 'row label',
      });
      const value = textBlock(rowTop, [row.display ?? `${row.value} of ${scale}`], {
        size: 27,
        fill: INK_SOFT,
        x: innerRight,
        anchor: 'end',
        label: 'row value',
      });
      return `${name.svg}\n${value.svg}
        <rect x="${innerLeft}" y="${rowTop + 42}" width="${CONTENT_W - 96}" height="10" rx="5" fill="${TRACK}"/>
        <rect x="${innerLeft}" y="${rowTop + 42}" width="${barW}" height="10" rx="5" fill="${ratio >= 0.7 ? SLATE : ACCENT_GOLD}"/>`;
    })
    .join('\n');

  return {
    svg: `<rect x="${MARGIN}" y="${top}" width="${CONTENT_W}" height="${height}" rx="14" fill="${SURFACE}" stroke="${OUTLINE}" stroke-opacity="0.5"/>\n${rowSvg}`,
    bottom: top + height,
  };
}

/** A quoted statement card, used to set a vague claim against a measured one. */
export function statementCard(top, { tag, tagColor, lines, size = 34, italic = false, accent }) {
  const inner = textBlock(top + 62, lines, {
    size,
    family: SERIF,
    fill: INK,
    lineHeight: size * 1.28,
    x: MARGIN + 48,
    italic,
    label: 'statement',
    maxWidth: CONTENT_W - 96,
  });
  const height = inner.bottom - top + 34;
  const label = textBlock(top + 26, [tag], {
    size: 20,
    fill: tagColor,
    weight: 700,
    tracking: 2.6,
    x: MARGIN + 48,
    label: 'statement tag',
  });
  return {
    svg: `<rect x="${MARGIN}" y="${top}" width="${CONTENT_W}" height="${height}" rx="14" fill="${SURFACE}" stroke="${OUTLINE}" stroke-opacity="0.5"/>
      <rect x="${MARGIN}" y="${top}" width="6" height="${height}" rx="3" fill="${accent}"/>
      ${label.svg}\n${inner.svg}`,
    bottom: top + height,
  };
}

export function footer(right = 'MEASURE · FIX · VERIFY') {
  const left = textBlock(FOOTER_TOP + 34, ['getgeopulse.com'], {
    size: 26,
    fill: INK_SOFT,
    weight: 600,
    tracking: 1.4,
    label: 'footer',
  });
  const rightBlock = textBlock(FOOTER_TOP + 34, [right], {
    size: 26,
    fill: ACCENT_GOLD,
    weight: 700,
    tracking: 2,
    x: POST_W - MARGIN,
    anchor: 'end',
    label: 'footer',
  });
  return `<rect x="${MARGIN}" y="${FOOTER_TOP}" width="${CONTENT_W}" height="2" fill="${OUTLINE}" opacity="0.5"/>\n${left.svg}\n${rightBlock.svg}`;
}

/** Renders a post from a linear block list, failing rather than clipping. */
export function composePost(blocks, { footerRight, background = HERO_IVORY } = {}) {
  const chunks = [];
  let cursor = MARGIN;
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
    <rect width="${POST_W}" height="${POST_H}" fill="${background}"/>
    ${chunks.join('\n')}
    ${footer(footerRight)}
  </svg>`;
}
