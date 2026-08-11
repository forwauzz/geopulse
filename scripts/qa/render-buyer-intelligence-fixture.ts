import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildBuyerIntelligenceView } from '../../lib/intelligence/buyer-intelligence-view-model';
import { buyerIntelligenceFixtureSnapshot } from '../../lib/intelligence/testing/buyer-intelligence-fixtures';
import { buildBuyerIntelligenceAgencyReportPdf } from '../../lib/server/agency-report-pdf';
import { pickInk, type BrandConfig } from '../../workers/report/report-branding';

const accent = { r: 14 / 255, g: 116 / 255, b: 144 / 255 };
const brand: BrandConfig = {
  companyName: 'GEO-Pulse',
  logo: null,
  primary: accent,
  onPrimary: pickInk(accent),
  footerNote: 'The GEO-Pulse team, Montreal, Quebec',
  showPoweredBy: true,
};

async function main(): Promise<void> {
  const outputPath = resolve('output/pdf/mbi-4-full-baseline.pdf');
  const heroPath = process.argv[2] ? resolve(process.argv[2]) : null;
  const snapshot = buyerIntelligenceFixtureSnapshot();
  const model = buildBuyerIntelligenceView({ kind: 'full_baseline', snapshot });
  const heroImageBytes = heroPath ? new Uint8Array(await readFile(heroPath)) : null;
  const bytes = await buildBuyerIntelligenceAgencyReportPdf(model, {
    brand,
    heroImageBytes,
    heroImageMime: heroImageBytes ? 'image/png' : undefined,
  });

  await mkdir(resolve('output/pdf'), { recursive: true });
  await writeFile(outputPath, bytes);
  process.stdout.write(`${outputPath}\n`);
}

void main();
