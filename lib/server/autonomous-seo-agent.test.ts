import { describe, expect, it } from 'vitest';
import { affordableTaskCount, classifySearchConsoleOpportunity } from './autonomous-seo-agent';

describe('autonomous SEO spend guard', () => {
  it('never schedules beyond the hard monthly budget', () => {
    expect(affordableTaskCount({ spentUsd: 9.999, hardBudgetUsd: 10, requested: 100 })).toBe(1);
    expect(affordableTaskCount({ spentUsd: 10, hardBudgetUsd: 10, requested: 100 })).toBe(0);
  });
});

describe('Search Console opportunity classification', () => {
  it('finds a striking-distance query', () => {
    expect(classifySearchConsoleOpportunity({
      query: 'ai visibility platform',
      page: '/ai-visibility',
      clicks: 1,
      impressions: 120,
      ctr: 0.008,
      position: 8.2,
    })).toMatchObject({ kind: 'striking_distance', priority: 1, owner: 'Jordan' });
  });

  it('ignores insufficient evidence', () => {
    expect(classifySearchConsoleOpportunity({
      query: 'tiny sample',
      page: null,
      clicks: 0,
      impressions: 3,
      ctr: 0,
      position: 9,
    })).toBeNull();
  });
});
