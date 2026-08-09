import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'public', 'branding', 'social', 'amara');
const outputDir = path.join(sourceDir, 'campaign-2026-08');

const portraits = [
  'amara-braided-bob.png',
  'amara-twistout-navy.png',
  'amara-braided-ponytail-emerald.png',
  'amara-short-natural.png',
];

const cards = [
  ['01-proof-beside-the-promise', 'PROOF BEFORE PROMOTION', 'Put the proof beside the promise.'],
  ['02-response-time-needs-a-clock', 'MSP SERVICE EVIDENCE', 'A response-time claim needs a clock.'],
  ['03-secure-is-not-complete', 'MSP SERVICE EVIDENCE', '“Secure” is not a complete sentence.'],
  ['04-state-the-service-area', 'BUYER CLARITY', 'State where you actually provide support.'],
  ['05-answer-before-the-scroll', 'EXTRACTABILITY', 'Put the useful answer before the scroll.'],
  ['06-build-an-evidence-block', 'TRUST SIGNALS', 'Build one evidence block a buyer can verify.'],
  ['07-fix-the-buyer-question', 'MEASUREMENT QUALITY', 'A weak buyer question creates a weak baseline.'],
  ['08-why-the-competitor-is-easier', 'COMPETITOR CLARITY', 'Why is the competitor easier to quote?'],
  ['09-schema-cannot-invent-proof', 'STRUCTURED FACTS', 'Schema cannot invent proof.'],
  ['10-align-the-public-sources', 'SOURCE CONSISTENCY', 'Make the public sources agree.'],
  ['11-make-the-next-step-specific', 'CONVERSION CLARITY', 'Make the next step specific.'],
  ['12-fix-then-rerun', 'REMEASUREMENT', 'Fix one blocker. Then run the same check again.'],
];

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[char]);
}

function wrap(value, max = 27) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function overlay(kicker, headline) {
  const lines = wrap(headline);
  const tspans = lines.map((line, index) =>
    `<tspan x="68" dy="${index === 0 ? 0 : 82}">${escapeXml(line)}</tspan>`
  ).join('');
  return Buffer.from(`
    <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#111310" stop-opacity="0.08"/>
          <stop offset="0.48" stop-color="#111310" stop-opacity="0.25"/>
          <stop offset="1" stop-color="#111310" stop-opacity="0.94"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#shade)"/>
      <rect x="42" y="42" width="996" height="1266" rx="22" fill="none" stroke="#E8D59B" stroke-opacity="0.55" stroke-width="2"/>
      <text x="68" y="96" fill="#F8F4EA" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="3">GEO-PULSE</text>
      <text x="68" y="914" fill="#E8D59B" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">${escapeXml(kicker)}</text>
      <text x="68" y="994" fill="#FFFFFF" font-family="Georgia, serif" font-size="68" font-weight="700">${tspans}</text>
      <line x1="68" y1="1218" x2="1012" y2="1218" stroke="#E8D59B" stroke-width="3"/>
      <text x="68" y="1274" fill="#F8F4EA" font-family="Arial, sans-serif" font-size="26">Run the free MSP audit</text>
      <text x="1012" y="1274" text-anchor="end" fill="#E8D59B" font-family="Arial, sans-serif" font-size="26" font-weight="700">getgeopulse.com</text>
    </svg>`);
}

await mkdir(outputDir, { recursive: true });

const outputs = [];
for (let index = 0; index < cards.length; index += 1) {
  const [slug, kicker, headline] = cards[index];
  const portrait = portraits[index % portraits.length];
  const output = path.join(outputDir, `${slug}-instagram-1080x1350.jpg`);
  await sharp(path.join(sourceDir, portrait))
    .resize({ width: 1080, height: 1350, fit: 'cover', position: 'attention' })
    .modulate({ saturation: 0.86, brightness: 0.9 })
    .composite([{ input: overlay(kicker, headline) }])
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toFile(output);
  outputs.push(output);
}

const thumbs = await Promise.all(outputs.map((file) =>
  sharp(file).resize({ width: 270, height: 338, fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
));
await sharp({ create: { width: 1080, height: 1014, channels: 3, background: '#111310' } })
  .composite(thumbs.map((input, index) => ({
    input,
    left: (index % 4) * 270,
    top: Math.floor(index / 4) * 338,
  })))
  .jpeg({ quality: 90 })
  .toFile(path.join(outputDir, 'amara-12-week-contact-sheet.jpg'));

console.log(JSON.stringify({ outputDir, files: outputs.length, contactSheet: 'amara-12-week-contact-sheet.jpg' }, null, 2));
