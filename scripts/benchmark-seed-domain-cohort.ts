import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import { seedBenchmarkDomainCohort } from '../lib/server/benchmark-domain-cohort-seed';

type CliArgs = {
  fixturePath: string;
};

function parseArgs(argv: string[]): CliArgs {
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
    fixturePath:
      values.get('fixture') ?? 'eval/fixtures/benchmark-tech-startups-b2b-software-v1-domains.json',
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), args.fixturePath), 'utf8')
  ) as unknown;
  const supabase = createServiceRoleClient(url, key);
  const result = await seedBenchmarkDomainCohort(supabase, fixture);

  console.log(
    'benchmark domain cohort seed ok:',
    'cohort:',
    result.cohortName,
    'vertical:',
    result.vertical,
    'domain_count:',
    result.domainCount
  );
  console.log(
    'domains:',
    result.domains
      .slice(0, 10)
      .map((domain) => domain.canonicalDomain)
      .join(', ')
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
