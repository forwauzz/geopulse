import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import { createBenchmarkRepository } from '../lib/server/benchmark-repository';
import {
  filterBenchmarkSeedRows,
  parseBenchmarkSeedCsv,
  toBenchmarkSeedDomainInput,
} from '../lib/server/benchmark-seed-queue';

type CliArgs = {
  csvPath: string;
  industry: string;
  priorities: number[];
  statuses: string[];
  limit: number | null;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags.add(token.slice(2));
      continue;
    }

    values.set(token.slice(2), next);
    index += 1;
  }

  const industry = values.get('industry')?.trim() ?? '';
  if (industry.length === 0) {
    throw new Error('Missing --industry. Example: --industry law_firms');
  }

  const priorities = (values.get('priorities') ?? '1')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (priorities.length === 0) {
    throw new Error('Missing valid --priorities. Example: --priorities 1 or --priorities 1,2');
  }

  const statuses = (values.get('statuses') ?? 'pending')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const rawLimit = values.get('limit');
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : null;

  return {
    csvPath: values.get('csv') ?? 'benchmark_seed.csv',
    industry,
    priorities,
    statuses,
    limit: Number.isFinite(limit) && (limit ?? 0) > 0 ? limit : null,
    dryRun: flags.has('dry-run'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = parseBenchmarkSeedCsv(readFileSync(resolve(process.cwd(), args.csvPath), 'utf8'));
  const selected = filterBenchmarkSeedRows(rows, {
    industry: args.industry,
    priorities: args.priorities,
    statuses: args.statuses,
    limit: args.limit,
  });

  if (selected.length === 0) {
    console.log('benchmark seed domains: no matching rows');
    return;
  }

  console.log(
    'benchmark seed domains:',
    `industry=${args.industry}`,
    `priorities=${args.priorities.join(',')}`,
    `statuses=${args.statuses.join(',')}`,
    `selected=${selected.length}`
  );
  console.log(
    'domains:',
    selected
      .slice(0, 10)
      .map((row) => row.domain)
      .join(', ')
  );

  if (args.dryRun) {
    return;
  }

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createServiceRoleClient(url, key);
  const repo = createBenchmarkRepository(supabase);

  for (const row of selected) {
    await repo.upsertDomain(toBenchmarkSeedDomainInput(row));
  }

  console.log('benchmark seed domains ok:', selected.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
