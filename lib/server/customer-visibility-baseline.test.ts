import { describe, expect, it } from 'vitest';
import { buildBaselineBuyerPrompts, isApprovedCustomerQuerySet } from './customer-visibility-baseline';

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
