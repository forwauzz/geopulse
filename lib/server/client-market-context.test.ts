import { describe, expect, it } from 'vitest';
import {
  confirmedMarket,
  discoveryMatchesMarket,
  resolveClientMarketContext,
} from './client-market-context';

describe('client market context', () => {
  it('does not treat the legacy generic market as confirmed', () => {
    expect(confirmedMarket(null, 'your market')).toBeNull();
    expect(confirmedMarket('Pointe-Claire, Quebec', 'your market')).toBe('Pointe-Claire, Quebec');
  });

  it('accepts a nearby city when the saved province matches', () => {
    expect(discoveryMatchesMarket('Pointe-Claire, Quebec', {
      city: 'Montreal',
      region: 'Quebec',
    })).toBe(true);
  });

  it('rejects the SanoMed UK namesake against the saved Quebec market', () => {
    expect(discoveryMatchesMarket('Pointe-Claire, Quebec', {
      city: 'Leatherhead',
      region: 'Surrey',
    })).toBe(false);
  });

  it('preserves the curated Canadian cohort when discovery conflicts', () => {
    const result = resolveClientMarketContext({
      clientLocation: null,
      existingLocation: 'Pointe-Claire, Quebec',
      clientCategory: 'healthcare',
      existingCategory: 'private medical clinic',
      existingCompetitors: ['priveosante.com', 'unionmd.ca', 'clinique1037.com'],
      discoveryContext: {
        companyName: 'SanoMed Solutions Ltd',
        category: 'occupational health provider',
        services: ['Occupational health assessments'],
        audience: 'UK employers',
        city: 'Leatherhead',
        region: 'Surrey',
      },
      discoveredCompetitors: ['wrong-uk-clinic.example'],
    });

    expect(result).toEqual({
      ok: true,
      location: 'Pointe-Claire, Quebec',
      category: 'private medical clinic',
      competitorDomains: ['priveosante.com', 'unionmd.ca', 'clinique1037.com'],
      discoveryStatus: 'rejected_conflict',
      discoveryReason: 'discovered_market_conflicts_with_saved_market',
    });
  });

  it('fails closed when neither the client nor an existing configuration confirms a market', () => {
    expect(resolveClientMarketContext({
      existingLocation: 'your market',
      discoveryContext: {
        companyName: 'Possible namesake',
        category: 'clinic',
        services: [],
        audience: null,
        city: 'London',
        region: 'England',
      },
      discoveredCompetitors: ['candidate.example'],
    })).toEqual({ ok: false, reason: 'client_location_confirmation_required' });
  });

  it('fails closed on a conflict when no curated cohort can safely replace discovery', () => {
    expect(resolveClientMarketContext({
      existingLocation: 'Pointe-Claire, Quebec',
      existingCategory: 'private medical clinic',
      discoveryContext: {
        companyName: 'SanoMed Solutions Ltd',
        category: 'occupational health provider',
        services: [],
        audience: null,
        city: 'Leatherhead',
        region: 'Surrey',
      },
    })).toEqual({ ok: false, reason: 'discovery_context_conflict' });
  });
});
