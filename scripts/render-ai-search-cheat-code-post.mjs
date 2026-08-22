/**
 * GEO-Pulse "AI search cheat code" social poster.
 *
 * The generated background is original. The saved reference contributes only
 * the feed-stopping editorial rhythm: a cinematic technology image, a compact
 * setup chip, and one oversized headline. The public claim is deliberately
 * narrower than the reference's "breaking news" framing.
 *
 * Usage: node scripts/render-ai-search-cheat-code-post.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  ACCENT_GOLD,
  DISPLAY,
  HERO_IVORY,
  INK,
  posterFootline,
  posterWordmark,
  textBlock,
} from './lib/brand-canvas.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'output', 'social', 'ai-search-cheat-code-2026-08');
const BACKGROUND = path.join(OUT_DIR, 'ai-search-evidence-background.png');

const W = 1200;
const H = 1500;
const MARGIN = 76;
const CONTENT_W = W - MARGIN * 2;

function headlineLine(top, text, fill, size = 120) {
  return textBlock(top, [text], {
    size,
    lineHeight: 120,
    fill,
    family: DISPLAY,
    weight: 700,
    tracking: 1,
    x: MARGIN,
    maxWidth: CONTENT_W,
    label: 'headline',
  });
}

function buildOverlay() {
  const wordmark = posterWordmark(62, MARGIN, ACCENT_GOLD);
  const lines = [
    headlineLine(784, 'THE REAL AI SEARCH', HERO_IVORY, 100),
    headlineLine(888, 'CHEAT CODE?', ACCENT_GOLD),
    headlineLine(1006, 'MAKE YOUR PROOF', HERO_IVORY),
    headlineLine(1124, 'EASY TO QUOTE.', HERO_IVORY),
  ];

  const chipText = textBlock(701, ['NO HACKS'], {
    size: 24,
    fill: INK,
    weight: 800,
    tracking: 2.8,
    x: MARGIN + 28,
    maxWidth: 180,
    label: 'chip',
  });

  return Buffer.from(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headlineScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#101617" stop-opacity="0"/>
        <stop offset="0.39" stop-color="#101617" stop-opacity="0.24"/>
        <stop offset="0.55" stop-color="#101617" stop-opacity="0.87"/>
        <stop offset="1" stop-color="#101617" stop-opacity="0.98"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#headlineScrim)"/>
    ${wordmark.svg}
    <rect x="${MARGIN}" y="684" width="184" height="54" rx="27" fill="${ACCENT_GOLD}"/>
    ${chipText.svg}
    ${lines.map((line) => line.svg).join('\n')}
    ${posterFootline(W, H, {
      x: MARGIN,
      label: 'Run a free scan',
      site: 'getgeopulse.com',
      fill: HERO_IVORY,
      siteFill: ACCENT_GOLD,
      ruleFill: ACCENT_GOLD,
    })}
  </svg>`);
}

const EXPORTS = [
  { suffix: 'linkedin-1200x1500', width: 1200 },
  { suffix: 'instagram-1080x1350', width: 1080 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const master = await sharp(BACKGROUND)
    .resize({ width: W, height: H, fit: 'cover', position: 'top' })
    .composite([{ input: buildOverlay(), top: 0, left: 0 }])
    .png()
    .toBuffer();

  for (const target of EXPORTS) {
    const out = path.join(OUT_DIR, `make-your-proof-easy-to-quote-${target.suffix}.jpg`);
    const info = await sharp(master)
      .resize({ width: target.width })
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
      .toFile(out);
    console.log(`${info.width}x${info.height} ${path.relative(ROOT, out)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
