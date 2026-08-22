/**
 * Centre-slot cards for the 100-day AI-visibility reel series.
 *
 * The Canva template ships a stock laptop photo in the middle of the frame.
 * That slot is the only place in the layout that can carry an idea rather than
 * a label, so it gets a purpose-built card instead: the shape of an AI answer
 * with the viewer's business absent from it. Transparent PNG so it drops onto
 * any background the template uses.
 *
 * Usage: node scripts/render-100day-reel-cards.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  ACCENT_GOLD,
  INK,
  INK_SOFT,
  OUTLINE,
  SANS,
  SERIF,
  SURFACE,
  WORDMARK_GOLD,
  escapeXml,
} from './lib/brand-canvas.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'output', 'instagram', '100-day-challenge');

const W = 1080;
const H = 680;
const PAD = 64;

const text = (x, y, content, { size, family = SERIF, fill = INK, weight = 400, italic = false, tracking = 0, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}" ` +
  `font-weight="${weight}"${italic ? ' font-style="italic"' : ''}` +
  `${tracking ? ` letter-spacing="${tracking}"` : ''} text-anchor="${anchor}">${escapeXml(content)}</text>`;

/**
 * Day 1 — "look for your name". The three names are deliberately generic
 * placeholders: the card illustrates the shape of the answer, it does not
 * report a measurement, and it says so at the bottom.
 */
const answerCard = () => {
  const rows = ['Competitor A', 'Competitor B', 'Competitor C'];
  const rowSvg = rows
    .map((name, i) =>
      [
        text(PAD, 286 + i * 74, `${i + 1}.`, { size: 38, fill: INK_SOFT }),
        text(PAD + 58, 286 + i * 74, name, { size: 38, fill: INK }),
      ].join('\n'),
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="22" fill="${SURFACE}" stroke="${OUTLINE}" stroke-opacity="0.5" stroke-width="2"/>
  ${text(PAD, 88, 'WHAT THE AI ANSWERED', { size: 22, family: SANS, fill: WORDMARK_GOLD, weight: 700, tracking: 3.2 })}
  <rect x="${PAD}" y="116" width="${W - PAD * 2}" height="1" fill="${ACCENT_GOLD}" fill-opacity="0.45"/>
  ${text(PAD, 182, '“Who are the best [your service] in [your city]?”', { size: 32, fill: INK_SOFT, italic: true })}
  ${rowSvg}
  <rect x="${PAD}" y="${H - 200}" width="${W - PAD * 2}" height="1" fill="${OUTLINE}" fill-opacity="0.5"/>
  ${text(PAD, H - 134, 'Your business: not mentioned.', { size: 40, fill: WORDMARK_GOLD, italic: true })}
  ${text(PAD, H - 58, 'ILLUSTRATIVE EXAMPLE', { size: 18, family: SANS, fill: INK_SOFT, weight: 600, tracking: 2.6 })}
</svg>`;
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const targets = [{ svg: answerCard(), name: 'day-001-card' }];

  for (const target of targets) {
    const out = path.join(OUT_DIR, `${target.name}.png`);
    const info = await sharp(Buffer.from(target.svg)).png().toFile(out);
    console.log(`${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)}KB  ${path.relative(ROOT, out)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
