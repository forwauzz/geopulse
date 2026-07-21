/**
 * Peer benchmark for the scorecard: where a score sits vs all sites GEO-Pulse has scanned.
 * v0 computes in JS from the `score` column (one int per completed scan) — fine at current
 * volume; add KV caching / an SQL percentile RPC if the scans table grows large.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ScoreBenchmark = {
  percentile: number; // % of scanned sites at or below this score
  median: number;
  top10: number; // p90 threshold
  sampleSize: number;
};

const MIN_SAMPLE = 20;

export async function getScoreBenchmark(
  supabase: SupabaseClient,
  score: number | null
): Promise<ScoreBenchmark | null> {
  if (score == null || !Number.isFinite(score)) return null;

  const { data, error } = await supabase
    .from('scans')
    .select('score')
    .eq('status', 'complete')
    .not('score', 'is', null)
    // Admin-curated competitor-cohort scans must not shift the customer-facing peer pool.
    .neq('run_source', 'internal_benchmark')
    .limit(5000);

  if (error || !Array.isArray(data)) return null;

  const scores = data
    .map((r) => Number((r as { score: number }).score))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const n = scores.length;
  if (n < MIN_SAMPLE) return null;

  const quantile = (p: number): number =>
    scores[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))] ?? 0;
  const atOrBelow = scores.filter((s) => s <= score).length;

  return {
    percentile: Math.round((atOrBelow / n) * 100),
    median: Math.round(quantile(0.5)),
    top10: Math.round(quantile(0.9)),
    sampleSize: n,
  };
}
