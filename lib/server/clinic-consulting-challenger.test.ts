import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildClinicConsultingChallengerPreview } from './clinic-consulting-challenger';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'eval/fixtures', name), 'utf8'));
}

describe('clinic consulting challenger benchmark', () => {
  it('keeps a balanced bilingual question set and a target-only pilot schedule', () => {
    const preview = buildClinicConsultingChallengerPreview(
      fixture('benchmark-clinic-consulting-quebec-v1-query-set.json'),
      fixture('benchmark-clinic-consulting-quebec-v1-domains.json'),
    );

    expect(preview.summary.queryCount).toBe(20);
    expect(preview.summary.languages).toEqual({ 'en-CA': 10, 'fr-CA': 10 });
    expect(preview.summary.scheduledDomains).toEqual(['techehealthservices.com']);
    expect(preview.summary.roles).toMatchObject({
      target_subject: 1,
      direct_consultancy: 3,
      adjacent_consultancy: 4,
      product_substitute: 2,
    });
    expect(preview.summary.aggregateClaims).toBe('blocked');
    expect(preview.summary.claimBlockers).toContain('cohort_below_minimum');
    expect(preview.summary.claimBlockers).toContain('schedule_below_minimum');
  });

  it('fails closed if a second domain is silently scheduled', () => {
    const cohort = fixture('benchmark-clinic-consulting-quebec-v1-domains.json') as any;
    cohort.domains[1].metadata.schedule_enabled = true;
    expect(() => buildClinicConsultingChallengerPreview(
      fixture('benchmark-clinic-consulting-quebec-v1-query-set.json'),
      cohort,
    )).toThrow('pilot_schedules_target_only');
  });
});
