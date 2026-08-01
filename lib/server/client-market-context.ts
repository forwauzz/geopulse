import type { DiscoveredBusinessContext } from './competitor-discovery';

const UNCONFIRMED_MARKETS = new Set([
  '',
  'local market',
  'same local market',
  'the same local market',
  'your market',
]);

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function normalizePlace(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function placeParts(value: string): Set<string> {
  return new Set(
    value
      .split(',')
      .map(normalizePlace)
      .filter((part) => part.length >= 2),
  );
}

export function confirmedMarket(
  clientLocation: string | null | undefined,
  existingLocation: string | null | undefined,
): string | null {
  for (const candidate of [clientLocation, existingLocation]) {
    const value = clean(candidate);
    if (value && !UNCONFIRMED_MARKETS.has(normalizePlace(value))) return value;
  }
  return null;
}

export function discoveryMatchesMarket(
  market: string,
  discovery: Pick<DiscoveredBusinessContext, 'city' | 'region'> | null,
): boolean {
  if (!discovery) return true;
  const discoveredMarket = [clean(discovery.city), clean(discovery.region)]
    .filter((value): value is string => Boolean(value))
    .join(', ');
  if (!discoveredMarket) return false;

  const expected = placeParts(market);
  const actual = placeParts(discoveredMarket);
  return [...expected].some((part) => actual.has(part));
}

function uniqueDomains(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

export type ClientMarketResolution =
  | {
      readonly ok: true;
      readonly location: string;
      readonly category: string;
      readonly competitorDomains: readonly string[];
      readonly discoveryStatus: 'accepted' | 'not_available' | 'rejected_conflict';
      readonly discoveryReason: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: 'client_location_confirmation_required' | 'discovery_context_conflict';
    };

/**
 * Resolve the market used for prompts, competitors, and reports.
 *
 * Client-entered context and an existing measured configuration are authoritative. The existing
 * configuration wins when it represents a later correction. Model discovery may fill gaps, but it
 * cannot silently replace a saved market or a curated competitor cohort.
 */
export function resolveClientMarketContext(input: {
  readonly clientLocation?: string | null;
  readonly existingLocation?: string | null;
  readonly clientCategory?: string | null;
  readonly existingCategory?: string | null;
  readonly existingCompetitors?: readonly string[] | null;
  readonly discoveryContext?: DiscoveredBusinessContext | null;
  readonly discoveredCompetitors?: readonly string[] | null;
}): ClientMarketResolution {
  const location = confirmedMarket(input.clientLocation, input.existingLocation);
  if (!location) return { ok: false, reason: 'client_location_confirmation_required' };

  const existingCompetitors = uniqueDomains(input.existingCompetitors ?? []);
  const discoveredCompetitors = uniqueDomains(input.discoveredCompetitors ?? []);
  const category = clean(input.existingCategory)
    ?? clean(input.clientCategory)
    ?? clean(input.discoveryContext?.category)
    ?? 'business services';

  if (!input.discoveryContext) {
    return {
      ok: true,
      location,
      category,
      competitorDomains: existingCompetitors,
      discoveryStatus: 'not_available',
      discoveryReason: null,
    };
  }

  if (!discoveryMatchesMarket(location, input.discoveryContext)) {
    if (existingCompetitors.length === 0) {
      return { ok: false, reason: 'discovery_context_conflict' };
    }
    return {
      ok: true,
      location,
      category,
      competitorDomains: existingCompetitors,
      discoveryStatus: 'rejected_conflict',
      discoveryReason: 'discovered_market_conflicts_with_saved_market',
    };
  }

  return {
    ok: true,
    location,
    category,
    competitorDomains: existingCompetitors.length > 0 ? existingCompetitors : discoveredCompetitors,
    discoveryStatus: 'accepted',
    discoveryReason: null,
  };
}
