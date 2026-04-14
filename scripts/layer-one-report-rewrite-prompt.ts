import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLayerOneReportRewritePrompt } from '../lib/server/layer-one-report-rewrite-prompt';

function parseArgs(argv: string[]): { reportPath: string | null } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(token.slice(2), value);
    index += 1;
  }

  return {
    reportPath: values.get('report') ?? null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.reportPath) {
    console.error('Missing --report <path-to-report-markdown>.');
    process.exit(1);
  }

  const absolutePath = resolve(process.cwd(), args.reportPath);
  const reportMarkdown = readFileSync(absolutePath, 'utf8');
  const prompt = buildLayerOneReportRewritePrompt({ reportMarkdown });
  console.log(prompt);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
