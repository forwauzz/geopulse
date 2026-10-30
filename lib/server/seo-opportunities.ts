import type { SearchConsoleRow } from './seo-providers';

export type SeoOpportunityDraft = {
  key: string;
  kind: 'striking_distance' | 'high_impression_low_ctr' | 'content_gap';
  priority: 1 | 2 | 3;
  title: string;
  evidence: string;
  recommendation: string;
  owner: 'Jordan' | 'Marcus';
};

export function classifySearchConsoleOpportunity(row: SearchConsoleRow): SeoOpportunityDraft | null {
  if (row.position >= 4 && row.position <= 20 && row.impressions >= 10) {
    return {
      key: `striking-distance:${row.query.toLowerCase()}`,
      kind: 'striking_distance',
      priority: row.impressions >= 100 ? 1 : 2,
      title: `Move “${row.query}” onto page one`,
      evidence: `${row.impressions} impressions at average position ${row.position.toFixed(1)} with ${row.clicks} clicks.`,
      recommendation: `Improve the best matching page for “${row.query}”, strengthen its evidence and internal links, then measure the change.`,
      owner: 'Jordan',
    };
  }
  if (row.position > 0 && row.position <= 10 && row.impressions >= 20 && row.ctr < 0.03) {
    return {
      key: `low-ctr:${row.query.toLowerCase()}`,
      kind: 'high_impression_low_ctr',
      priority: row.impressions >= 100 ? 1 : 2,
      title: `Win more clicks for “${row.query}”`,
      evidence: `${row.impressions} impressions at position ${row.position.toFixed(1)}, but only ${(row.ctr * 100).toFixed(1)}% CTR.`,
      recommendation: `Rewrite the title and description around the searcher’s outcome, while keeping the page aligned with “${row.query}”.`,
      owner: 'Jordan',
    };
  }
  return null;
}

export function aggregateSearchConsoleRows(rows: readonly SearchConsoleRow[]): SearchConsoleRow[] {
  const grouped = new Map<string, {
    query: string;
    clicks: number;
    impressions: number;
    weightedPosition: number;
    fallbackPosition: number;
    rowCount: number;
    primaryPage: string | null;
    primaryPageImpressions: number;
  }>();
  for (const row of rows) {
    const key = row.query.trim().toLowerCase();
    if (!key) continue;
    const current = grouped.get(key) ?? {
      query: row.query.trim(),
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      fallbackPosition: 0,
      rowCount: 0,
      primaryPage: null,
      primaryPageImpressions: -1,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosition += row.position * row.impressions;
    current.fallbackPosition += row.position;
    current.rowCount += 1;
    if (row.impressions > current.primaryPageImpressions) {
      current.primaryPage = row.page;
      current.primaryPageImpressions = row.impressions;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()].map((row) => ({
    query: row.query,
    page: row.primaryPage,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    position: row.impressions > 0
      ? row.weightedPosition / row.impressions
      : row.fallbackPosition / Math.max(row.rowCount, 1),
  }));
}
