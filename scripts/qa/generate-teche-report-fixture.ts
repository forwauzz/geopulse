import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDeepAuditPdfFromPayload } from '../../workers/report/build-deep-audit-pdf';
import { buildTecheHealthServicesFixture } from '../../workers/report/fixtures/teche-health-services';

async function main(): Promise<void> {
  const outputPath = resolve('output/pdf/teche-health-services-report-qa.pdf');
  const bytes = await buildDeepAuditPdfFromPayload(
    buildTecheHealthServicesFixture(),
    undefined,
    {
      preparedForLines: ['Prepared for Morgan Lee - Teché Health Services'],
      preparedByLines: ['Prepared by the GEO-Pulse team', 'Montréal, Québec'],
      credibilityLines: [
        'What is working and what needs attention',
        'Prioritized fixes with owners and verification steps',
        'A dated 90-day baseline and re-scan plan',
      ],
      heroImage: null,
    },
  );

  await mkdir(resolve('output/pdf'), { recursive: true });
  await writeFile(outputPath, bytes);
  process.stdout.write(`${outputPath}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
