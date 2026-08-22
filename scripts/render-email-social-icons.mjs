import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

for (const asset of ['instagram', 'linkedin']) {
  await sharp(fileURLToPath(new URL(`../public/branding/email/${asset}.svg`, import.meta.url)))
    .resize(48, 48)
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(new URL(`../public/branding/email/${asset}.png`, import.meta.url)));
}
