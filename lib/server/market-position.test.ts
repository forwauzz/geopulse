import { describe, expect, it } from 'vitest';
import { computeMarketPosition, MIN_MEASURED_FOR_POSITION } from './market-position';
import type { Cohort, DomainComparison } from './competitor-cohorts';

function member(canonical: string, score: number | null, isCustomer = false): DomainComparison {
  return {
    domainId: canonical,
    canonicalDomain: canonical,
    displayName: canonical,
    isCustomer,
    score,
    scoreState: score == null ? 'not_tested' : 'measured',
    destinations: {},
    structuredData: 'not_verified',
    llmsTxt: 'not_verified',
    scannedAt: null,
    rank: null,
    deltas: [],
  };
}

function cohort(domains: DomainComparison[]): Cohort {
  return {
    vertical: 'MSP / IT services',
    geoRegion: 'Québec',
    domains,
    standings: {
      medianScore: null,
      measuredCount: domains.filter((d) => d.score != null).length,
      totalCount: domains.length,
      destinationAllows: { chatgpt_search: { allows: 4, of: 6 } },
    },
  };
}

describe('computeMarketPosition', () => {
  const SIX = cohort([
    member('mips.ca', 70, true),
    member('a.ca', 85),
    member('b.ca', 77),
    member('c.ca', 60),
    member('d.ca', 55),
    member('e.ca', null), // unmeasured — excluded from rank math
  ]);

  it('ranks the fresh score against the other measured members', () => {
    const mp = computeMarketPosition(SIX, 'mips.ca', 79);
    expect(mp).not.toBeNull();
    expect(mp?.rank).toBe(2); // only 85 beats 79; the stored 70 for mips is replaced
    expect(mp?.of).toBe(5);
    expect(mp?.medianScore).toBe(77);
    expect(mp?.marketStats).toEqual(['4 of 6 allow ChatGPT search']);
    expect(mp?.vertical).toBe('MSP / IT services');
  });

  it('ranks last honestly and ties do not beat the audited site', () => {
    expect(computeMarketPosition(SIX, 'mips.ca', 10)?.rank).toBe(5);
    expect(computeMarketPosition(SIX, 'mips.ca', 85)?.rank).toBe(1); // tie with best → shared #1
  });

  it('returns null when the domain is not in the cohort, score missing, or sample thin', () => {
    expect(computeMarketPosition(SIX, 'stranger.ca', 80)).toBeNull();
    expect(computeMarketPosition(SIX, 'mips.ca', null)).toBeNull();
    const thin = cohort([member('mips.ca', 70, true), member('a.ca', 80), member('b.ca', 60)]);
    expect(thin.domains.length).toBeLessThan(MIN_MEASURED_FOR_POSITION);
    expect(computeMarketPosition(thin, 'mips.ca', 70)).toBeNull();
  });

  it('omits market stats whose verified sample is thin', () => {
    const c = cohort(SIX.domains);
    (c.standings.destinationAllows as Record<string, { allows: number; of: number }>).claude = {
      allows: 1,
      of: 2,
    };
    const mp = computeMarketPosition(c, 'mips.ca', 79);
    expect(mp?.marketStats).toEqual(['4 of 6 allow ChatGPT search']);
  });
});
