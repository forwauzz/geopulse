/**
 * Anonymized market position for a deep-audit report (issue #125).
 *
 * When the audited domain belongs to a seeded local cohort, the report can say where the
 * business ranks among the market we monitor — "#7 of 29 MSP / IT services businesses in
 * Québec" — plus the market median and per-AI-destination adoption stats. AGGREGATES ONLY:
 * no competitor is ever named, so there is nothing to disparage.
 *
 * Rank uses the FRESH audit score (the number on the report cover) against the cohort's
 * stored measured scores, so the section always agrees with the rest of the report.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DestinationId } from '../../workers/scan-engine/access-matrix';
import { toCanonicalBenchmarkDomain } from './benchmark-domains';
import {
  DESTINATION_LABELS,
  loadCohortComparison,
  type Cohort,
} from './competitor-cohorts';

/** Below this many measured businesses (including the audited one) a rank is noise, not signal. */
export const MIN_MEASURED_FOR_POSITION = 5;

export type MarketPosition = {
  readonly rank: number;
  readonly of: number;
  readonly medianScore: number;
  readonly vertical: string;
  readonly geoRegion: string;
  /** Human-ready lines like "9 of 27 allow ChatGPT search". */
  readonly marketStats: string[];
};

/** Pure, exported for tests. Returns null when the domain isn't in the cohort or the sample is thin. */
export function computeMarketPosition(
  cohort: Cohort,
  canonicalDomain: string,
  freshScore: number | null
): MarketPosition | null {
  if (freshScore == null || !Number.isFinite(freshScore)) return null;
  const self = cohort.domains.find((d) => d.canonicalDomain === canonicalDomain);
  if (!self) return null;

  const otherScores = cohort.domains
    .filter((d) => d.canonicalDomain !== canonicalDomain && d.scoreState === 'measured' && d.score != null)
    .map((d) => d.score as number);
  const allScores = [...otherScores, freshScore].sort((a, b) => a - b);
  if (allScores.length < MIN_MEASURED_FOR_POSITION) return null;

  const rank = 1 + otherScores.filter((s) => s > freshScore).length;
  const mid = allScores.length / 2;
  const medianScore =
    allScores.length % 2 === 1
      ? (allScores[Math.floor(mid)] ?? 0)
      : Math.round(((allScores[mid - 1] ?? 0) + (allScores[mid] ?? 0)) / 2);

  const marketStats: string[] = [];
  for (const dest of Object.keys(DESTINATION_LABELS) as DestinationId[]) {
    const stat = cohort.standings.destinationAllows[dest];
    if (!stat || stat.of < MIN_MEASURED_FOR_POSITION) continue;
    marketStats.push(`${String(stat.allows)} of ${String(stat.of)} allow ${DESTINATION_LABELS[dest]}`);
  }

  return {
    rank,
    of: allScores.length,
    medianScore,
    vertical: cohort.vertical,
    geoRegion: cohort.geoRegion,
    marketStats,
  };
}

/** Cohort lookup + compute; never throws — a report must render fine without a market section. */
export async function getMarketPosition(
  supabase: SupabaseClient,
  domain: string,
  freshScore: number | null
): Promise<MarketPosition | null> {
  try {
    const canonical = toCanonicalBenchmarkDomain(domain);
    if (!canonical) return null;
    const cohorts = await loadCohortComparison(supabase);
    for (const cohort of cohorts) {
      const position = computeMarketPosition(cohort, canonical, freshScore);
      if (position) return position;
    }
    return null;
  } catch {
    return null;
  }
}
