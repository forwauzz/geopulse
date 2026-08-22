/**
 * Photo-poster posts for Instagram and LinkedIn.
 *
 * The template is lifted from a saved reference ad: a full-bleed portrait with
 * a heavy condensed headline slab over the upper half, connector words dropped
 * to a smaller receding tone, and an action bar across the bottom. Two things
 * are swapped for GEO-Pulse — the subject becomes one of the brand persona
 * portraits, and the reference's saturated blue becomes the brandbook's gold.
 *
 * The reference's action bar is not reproduced. On that screenshot it is
 * Instagram's own ad chrome, and both channels draw their own action control,
 * so a drawn button would sit next to a real one. The call stays as plain type
 * on a closing line with the address.
 *
 * The reference's subject sits low in frame with clear wall above her; the
 * persona portraits are framed much tighter. So the portrait is pushed down
 * until the head lands at HEAD_TARGET and the exposed strip is filled by
 * stretching the portrait's own top rows. Both portraits used here open on a
 * flat wall, so that strip continues the photograph rather than patching it.
 *
 * Usage: node scripts/render-photo-poster-posts.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  ACCENT_GOLD,
  DARK_GOLD,
  HERO_IVORY,
  INK,
  SLATE,
  SURFACE,
  WORDMARK_GOLD,
  posterFootline,
  posterHeadline,
  posterWordmark,
} from './lib/brand-canvas.mjs';

const ROOT = process.cwd();
const AVATARS = path.join(ROOT, 'output', 'instagram', 'inspiration-pilot-2026-07-26', 'avatars');
const OUT_DIR = path.join(ROOT, 'output', 'social', 'photo-poster-2026-08');

const W = 1200;
const H = 1500;
const MARGIN = 76;
const MEASURE = W - MARGIN * 2;

/** Where the subject's head should start, as a fraction of canvas height. */
const HEAD_TARGET = 0.443;

/** Where the headline's first cap box starts. */
const HEADLINE_TOP = 158;

/** Depth of the fade between the filled strip and the photograph. */
const FEATHER = 150;

/** Height of the closing gradient that carries the footline over the photo. */
const FOOT_SCRIM = 360;

const CTA_LABEL = 'Run a free scan';
const SITE = 'getgeopulse.com';

/**
 * Connector words are `soft`. Line lengths are kept close so the justified
 * sizes stay within a stop of each other, which is what makes the block read
 * as a slab instead of three unrelated lines.
 */
const HEADLINE = [
  [{ text: 'See what', soft: true }, { text: 'AI says' }],
  [{ text: 'about your firm' }],
  [{ text: 'when', soft: true }, { text: 'clients ask' }],
];

const VARIANTS = [
  {
    name: 'ai-says-about-your-firm-dark',
    avatar: 'mei.png',
    // Measured off the portrait: where the hair starts, as a fraction of height.
    headTop: 0.193,
    keyFill: DARK_GOLD,
    softFill: HERO_IVORY,
    wordmark: DARK_GOLD,
    scrim: '#000000',
    scrimOpacity: 0.5,
    footScrimOpacity: 0.62,
    footFill: HERO_IVORY,
    footSiteFill: DARK_GOLD,
    footRuleFill: DARK_GOLD,
  },
  {
    name: 'ai-says-about-your-firm-light',
    avatar: 'amara.png',
    headTop: 0.111,
    keyFill: SLATE,
    softFill: SURFACE,
    wordmark: WORDMARK_GOLD,
    scrim: '#FFFFFF',
    scrimOpacity: 0.34,
    // Kept light: this frame closes on a near-black garment, and a scrim strong
    // enough to sit under the type washes it to grey. The footline splits
    // instead — ink on the ivory wall, light gold on the garment.
    footScrimOpacity: 0.22,
    footFill: INK,
    footSiteFill: DARK_GOLD,
    footRuleFill: ACCENT_GOLD,
  },
];

/**
 * Portrait pushed down to HEAD_TARGET, with the exposed strip filled by the
 * portrait's own stretched top rows.
 */
async function buildBackground({ avatar, headTop }) {
  // Materialised rather than cloned: sharp allows one resize per pipeline, so
  // a second resize on a clone silently overrides the first.
  const scaled = await sharp(path.join(AVATARS, avatar)).resize({ width: W }).png().toBuffer();
  const { height: scaledH } = await sharp(scaled).metadata();

  const shift = Math.round(H * HEAD_TARGET - scaledH * headTop);
  if (shift < 0 || shift >= scaledH) {
    throw new Error(`${avatar}: head sits at ${headTop}, which cannot reach the target framing.`);
  }

  const visibleH = Math.min(H - shift, scaledH);

  // The strip is the portrait's own opening rows, mirrored: its last row is the
  // photo's first row, so the join cannot seam. Only the rows above the head
  // qualify — mirroring deeper than that reflects the subject's own face into
  // the strip — so the clear band is stretched to length rather than extended.
  // Blurred so it reads as out-of-focus wall rather than a reflection.
  const clearH = Math.max(8, Math.floor(scaledH * headTop));
  const band = await sharp(
    await sharp(scaled).extract({ left: 0, top: 0, width: W, height: clearH }).flip().toBuffer(),
  )
    .resize({ width: W, height: shift, fit: 'fill' })
    .blur(16)
    .toBuffer();

  // The feathered photo needs a blurred copy of itself to fade out of, or it
  // dissolves into the base colour instead. This layer continues the mirrored
  // strip below the join at the same focus, so the two meet invisibly.
  const bedding = await sharp(scaled)
    .extract({ left: 0, top: 0, width: W, height: visibleH })
    .blur(16)
    .toBuffer();

  // Mirroring matches colour across the join but not focus, which still leaves a
  // sharpness step wherever the wall carries detail. Fading the photo's own top
  // edge into the blurred layers dissolves it.
  const feather = Buffer.from(
    `<svg width="${W}" height="${visibleH}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="feather" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="${(FEATHER / visibleH).toFixed(4)}" stop-color="#ffffff" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="${W}" height="${visibleH}" fill="url(#feather)"/>
    </svg>`,
  );
  const visible = await sharp(scaled)
    .extract({ left: 0, top: 0, width: W, height: visibleH })
    .ensureAlpha()
    .composite([{ input: feather, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
    .composite([
      { input: band, top: 0, left: 0 },
      { input: bedding, top: shift, left: 0 },
      { input: visible, top: shift, left: 0 },
    ])
    .png()
    .toBuffer();
}

function buildOverlay(variant) {
  const wordmark = posterWordmark(64, MARGIN, variant.wordmark);
  const headline = posterHeadline(HEADLINE_TOP, HEADLINE, {
    measure: MEASURE,
    x: MARGIN,
    keyFill: variant.keyFill,
    softFill: variant.softFill,
  });
  if (headline.bottom > H * HEAD_TARGET - 40) {
    throw new Error(
      `${variant.name}: headline reaches y=${Math.round(headline.bottom)} and would collide ` +
        `with the subject at y=${Math.round(H * HEAD_TARGET)}. Shorten a line.`,
    );
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${variant.scrim}" stop-opacity="${variant.scrimOpacity}"/>
        <stop offset="0.36" stop-color="${variant.scrim}" stop-opacity="${variant.scrimOpacity * 0.92}"/>
        <stop offset="0.60" stop-color="${variant.scrim}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="footScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${variant.scrim}" stop-opacity="0"/>
        <stop offset="1" stop-color="${variant.scrim}" stop-opacity="${variant.footScrimOpacity}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#scrim)"/>
    ${wordmark.svg}
    ${headline.svg}
    <rect x="0" y="${H - FOOT_SCRIM}" width="${W}" height="${FOOT_SCRIM}" fill="url(#footScrim)"/>
    ${posterFootline(W, H, {
      x: MARGIN,
      label: CTA_LABEL,
      site: SITE,
      fill: variant.footFill,
      siteFill: variant.footSiteFill,
      ruleFill: variant.footRuleFill,
    })}
  </svg>`;
}

const EXPORTS = [
  { suffix: 'linkedin-1200x1500', width: 1200 },
  { suffix: 'instagram-1080x1350', width: 1080 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const variant of VARIANTS) {
    const master = await sharp(await buildBackground(variant))
      .composite([{ input: Buffer.from(buildOverlay(variant)), top: 0, left: 0 }])
      .png()
      .toBuffer();

    for (const target of EXPORTS) {
      const out = path.join(OUT_DIR, `${variant.name}-${target.suffix}.jpg`);
      const info = await sharp(master)
        .resize({ width: target.width })
        // 4:4:4 keeps the gold type and the slate bar clean; subsampling muddies
        // coloured display type at this size.
        .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
        .toFile(out);
      console.log(
        `${String(`${info.width}x${info.height}`).padEnd(11)} ` +
          `${String(`${(info.size / 1024).toFixed(0)}KB`).padStart(7)}  ${path.relative(ROOT, out)}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
