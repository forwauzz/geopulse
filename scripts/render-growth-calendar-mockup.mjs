import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const input = path.join(root, 'output', 'ui-mockups', 'growth-calendar', 'index.html');
const outputDir = path.join(root, 'output', 'ui-mockups', 'growth-calendar');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(input).href, { waitUntil: 'load' });
  await page.locator('[data-preview="carousel"]').click();
  await page.locator('#carouselImage').waitFor();
  await page.screenshot({ path: path.join(outputDir, 'growth-calendar-instagram-preview.png'), fullPage: true });

  await page.locator('[data-preview="linkedin"]').click();
  await page.getByText('The three answers an MSP client report must give').waitFor();
  await page.screenshot({ path: path.join(outputDir, 'growth-calendar-linkedin-preview.png'), fullPage: true });

  await page.locator('[data-preview="reel"]').click();
  await page.locator('#previewPane .video-badge').waitFor();
  await page.screenshot({ path: path.join(outputDir, 'growth-calendar-video-preview.png'), fullPage: true });
} finally {
  await browser.close();
}

console.log(outputDir);
