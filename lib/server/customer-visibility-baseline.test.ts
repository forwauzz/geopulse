import { describe, expect, it, vi } from 'vitest';
import {
  buildBaselineBuyerPrompts,
  isApprovedCustomerQuerySet,
  resolveCompetitorCohort,
} from './customer-visibility-baseline';

describe('competitor cohort resolution', () => {
  const cohort = ['clinique360.com', 'remd.ca', 'unionmd.ca'];

  it('keeps a bound cohort without paying for a suggestion', async () => {
    const suggest = vi.fn(async () => ['ignored.example']);
    await expect(resolveCompetitorCohort({ bound: cohort, stored: [], suggest })).resolves.toEqual(cohort);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('treats an empty bound cohort as no answer rather than as an empty one', async () => {
    const suggest = vi.fn(async () => cohort);
    await expect(resolveCompetitorCohort({ bound: [], stored: [], suggest })).resolves.toEqual(cohort);
    expect(suggest).toHaveBeenCalledOnce();
  });

  it('keeps the stored cohort when discovery comes back empty', async () => {
    await expect(resolveCompetitorCohort({
      bound: [],
      stored: cohort,
      suggest: async () => [],
    })).resolves.toEqual(cohort);
  });

  it('never reports fewer competitors than the tenant already entered', async () => {
    for (const bound of [undefined, null, []] as const) {
      await expect(resolveCompetitorCohort({
        bound,
        stored: cohort,
        suggest: async () => [],
      })).resolves.toHaveLength(cohort.length);
    }
  });
});

describe('customer visibility baseline prompts', () => {
  it('creates a bounded blind buyer-question set from company context', () => {
    const prompts = buildBaselineBuyerPrompts({
      vertical: 'healthcare',
      subvertical: 'medical_clinic',
      location: 'Montreal, Canada',
    });

    expect(prompts).toHaveLength(10);
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(prompts.every((prompt) => prompt.endsWith('?') || prompt.endsWith('.'))).toBe(true);
    expect(prompts.join(' ')).toContain('medical clinic');
    expect(prompts.join(' ')).toContain('Montreal, Canada');
    expect(prompts.every((prompt) => prompt.includes('Montreal, Canada'))).toBe(true);
    expect(prompts.join(' ')).not.toContain('growing business');
  });

  it('falls back to useful generic prompts without inventing a market', () => {
    const prompts = buildBaselineBuyerPrompts({});
    expect(prompts).toHaveLength(10);
    expect(prompts[0]).toContain('business services');
    expect(prompts[0]).toContain('your market');
  });

  it('uses the confirmed buyer languages in the bounded prompt set', () => {
    const prompts = buildBaselineBuyerPrompts({
      subvertical: 'private medical clinic',
      location: 'Pointe-Claire, Quebec, Canada',
      languages: ['en-CA', 'fr-CA'],
    });
    expect(prompts).toHaveLength(10);
    expect(prompts.join(' ')).toContain('English and French');
  });

  it('uses confirmed buyer and service context without naming the measured brand', () => {
    const prompts = buildBaselineBuyerPrompts({
      vertical: 'software',
      subvertical: 'medical legal evidence software',
      location: 'Canada',
      buyer: 'plaintiff and defence legal teams',
      services: ['medical chronology automation', 'source-linked evidence extraction'],
    });
    const joined = prompts.join(' ');
    expect(prompts).toHaveLength(10);
    expect(new Set(prompts).size).toBe(10);
    expect(joined).toContain('plaintiff and defence legal teams');
    expect(joined).toContain('medical chronology automation');
    expect(joined).toContain('source linked evidence extraction');
    expect(joined.toLowerCase()).not.toContain('alie');
  });
});

describe('approved customer query-set preservation', () => {
  const verified = {
    source: 'official_site_and_founder_correction',
    source_verified_at: '2026-08-02T00:41:29.070Z',
    approved_for_measurement: true,
    canonical_domain: 'sanomedsolutions.com',
  };

  it('preserves exactly ten source-verified prompts for the same organization', () => {
    expect(isApprovedCustomerQuerySet({
      metadata: verified,
      status: 'active',
      canonicalDomain: 'sanomedsolutions.com',
      promptCount: 10,
    })).toBe(true);
  });

  it('rejects generic, wrong-domain, incomplete, or inactive sets', () => {
    expect(isApprovedCustomerQuerySet({
      metadata: { ...verified, approved_for_measurement: false },
      status: 'active', canonicalDomain: 'sanomedsolutions.com', promptCount: 10,
    })).toBe(false);
    expect(isApprovedCustomerQuerySet({
      metadata: verified,
      status: 'active', canonicalDomain: 'sanomed.co.uk', promptCount: 10,
    })).toBe(false);
    expect(isApprovedCustomerQuerySet({
      metadata: verified,
      status: 'active', canonicalDomain: 'sanomedsolutions.com', promptCount: 9,
    })).toBe(false);
    expect(isApprovedCustomerQuerySet({
      metadata: verified,
      status: 'archived', canonicalDomain: 'sanomedsolutions.com', promptCount: 10,
    })).toBe(false);
  });
});
