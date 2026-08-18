import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'comment-json';
import { describe, expect, it } from 'vitest';
import { parseBenchmarkDomainCohortSeed } from '../lib/server/benchmark-domain-cohort-seed';
import {
  parseBenchmarkScheduleConfig,
  toBenchmarkChallengerScheduleEnv,
} from '../lib/server/benchmark-schedule';

type WranglerConfig = {
  readonly vars?: Record<string, string>;
};

const root = process.cwd();
const wrangler = parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8')) as WranglerConfig;
const vars = wrangler.vars ?? {};

describe('production benchmark configuration', () => {
  it('freezes the primary lane to ten MSP domains and the MSP question set', () => {
    const config = parseBenchmarkScheduleConfig(vars);

    expect(config).not.toBeNull();
    expect(config).toMatchObject({
      querySetId: '9cd3b0fc-8082-4d82-9548-f6f788e0b1b9',
      modelId: 'sonar',
      vertical: 'msp_it',
      domainLimit: 10,
      maxRuns: 30,
      windowHours: 12,
      scheduleVersion: 'msp-perplexity-v4-cohort10',
    });
    expect(config?.canonicalDomains).toHaveLength(10);
    expect(new Set(config?.canonicalDomains).size).toBe(10);
    expect(config?.canonicalDomains).not.toContain('techehealthservices.com');
  });

  it('keeps the one-domain Teché healthcare challenger separate', () => {
    const challenger = parseBenchmarkScheduleConfig(toBenchmarkChallengerScheduleEnv(vars));

    expect(challenger).toMatchObject({
      querySetId: '89500ed0-6cb4-4ced-9a6f-683330c98302',
      vertical: 'healthcare',
      canonicalDomains: ['techehealthservices.com'],
      domainLimit: 1,
      maxRuns: 1,
      windowHours: 24,
      includeUserPrompts: false,
    });
    const primaryDomains = new Set(vars.BENCHMARK_SCHEDULE_DOMAINS?.split(',') ?? []);
    expect(challenger?.canonicalDomains.some((domain) => primaryDomains.has(domain))).toBe(false);
  });

  it('keeps the cohort fixture aligned with the deployed primary frame', () => {
    const fixture = parseBenchmarkDomainCohortSeed(
      JSON.parse(
        readFileSync(
          join(root, 'eval/fixtures/benchmark-msp-quebec-cohort10-v1-domains.json'),
          'utf8'
        )
      )
    );
    const configuredDomains = vars.BENCHMARK_SCHEDULE_DOMAINS?.split(',') ?? [];

    expect(fixture.vertical).toBe('msp_it');
    expect(fixture.metadata?.schedule_query_set_id).toBe(vars.BENCHMARK_SCHEDULE_QUERY_SET_ID);
    expect(fixture.metadata?.schedule_version).toBe(vars.BENCHMARK_SCHEDULE_VERSION);
    expect(fixture.domains.map((domain) => domain.domain)).toEqual(configuredDomains);
    expect(
      fixture.domains.every(
        (domain) =>
          Array.isArray(domain.metadata?.source_urls) && domain.metadata.source_urls.length > 0
      )
    ).toBe(true);
  });
});
