import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const pageDir = path.join(root, 'tmp', 'pdfs', 'linkedin-ai-visibility-playbook');
const outDir = path.join(root, 'output', 'pdf');
const pages = fs.readdirSync(pageDir).filter((name) => name.endsWith('.png')).sort();

const tiles = await Promise.all(
  pages.map(async (name, index) => ({
    input: await sharp(path.join(pageDir, name)).resize(270, 338, { fit: 'cover' }).toBuffer(),
    left: (index % 4) * 270,
    top: Math.floor(index / 4) * 338,
  })),
);

await sharp({ create: { width: 1080, height: 676, channels: 3, background: '#F5F2E8' } })
  .composite(tiles)
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outDir, 'geopulse-ai-visibility-reporting-playbook-contact-sheet.jpg'));

await sharp(path.join(pageDir, pages[0]))
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outDir, 'geopulse-ai-visibility-reporting-playbook-cover.jpg'));
