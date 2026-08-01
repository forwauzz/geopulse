import { describe, expect, it } from 'vitest';
import { selectTrackedCompetitorName } from './geo-performance-report-data';

describe('GPM report competitor integrity', () => {
  it('never promotes an arbitrary cited publisher or out-of-cohort brand as a tracked competitor', () => {
    const selected = selectTrackedCompetitorName([
      {
        cited_domain: 'thelondonclinic.co.uk',
        rank_position: 1,
        metadata: {},
      },
      {
        cited_domain: 'endovision.ca',
        rank_position: 3,
        metadata: { is_competitor: true, competitor_name: 'endovision.ca' },
      },
    ], 'sanomedsolutions.com');

    expect(selected).toBe('endovision.ca');
  });

  it('returns no competitor when the answer cites only unapproved brands', () => {
    expect(selectTrackedCompetitorName([{
      cited_domain: 'clevelandcliniclondon.uk',
      rank_position: 1,
      metadata: {},
    }], 'sanomedsolutions.com')).toBeNull();
  });
});
