'use client';

/**
 * "How this score is computed" (spec C6) — the score must be reproducible from what
 * this panel shows: bucket subtotals with earned/possible weights, the hygiene bucket
 * explicitly excluded from the headline, and the eligibility band beside the number.
 */

export type BucketScoreData = {
  bucket: string;
  label: string;
  score: number;
  earnedWeight: number;
  possibleWeight: number;
  checkCount: number;
  notTestedCount: number;
  excludedFromHeadline: boolean;
};

export type EligibilityData = { band: string; label: string } | null;

export function EligibilityBadge({ eligibility }: { eligibility: EligibilityData }) {
  if (!eligibility) return null;
  const tone =
    eligibility.band === 'ai_visible'
      ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200'
      : eligibility.band === 'partially_blocked'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
        : eligibility.band === 'blocked'
          ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200'
          : 'bg-surface-container-high text-on-surface-variant';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-label text-[0.65rem] font-bold uppercase tracking-widest ${tone}`}>
      {eligibility.label}
    </span>
  );
}

export function ScoringExplainer({
  bucketScores,
  eligibility,
}: {
  bucketScores: BucketScoreData[];
  eligibility: EligibilityData;
}) {
  if (bucketScores.length === 0) return null;
  const headline = bucketScores.filter((b) => !b.excludedFromHeadline);
  const hygiene = bucketScores.find((b) => b.excludedFromHeadline);

  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">
            Score transparency
          </p>
          <h2 className="mt-2 font-headline text-xl font-bold text-on-background">
            How this score is computed
          </h2>
        </div>
        <EligibilityBadge eligibility={eligibility} />
      </div>
      <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
        The AI-readiness score blends two buckets by published weights. Checks we could not test
        are excluded entirely — they never lower the score. Website hygiene is reported below but
        deliberately kept out of the AI score: those items are good practice, not citation levers.
        This score measures readiness; it is not a prediction that AI engines will cite you.
      </p>

      <ul className="mt-4 space-y-3">
        {headline.map((b) => (
          <li key={b.bucket} className="rounded-xl bg-surface-container-low px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-body text-sm font-semibold text-on-background">{b.label}</p>
              <p className="font-body text-sm text-on-surface-variant">
                {b.score >= 0 ? `${String(b.score)}/100` : 'Not tested'}
                <span className="ml-2 text-xs">
                  ({String(b.earnedWeight)} of {String(b.possibleWeight)} weight earned
                  {b.notTestedCount > 0 ? `, ${String(b.notTestedCount)} not tested` : ''})
                </span>
              </p>
            </div>
          </li>
        ))}
        {hygiene && (
          <li className="rounded-xl border border-dashed border-outline-variant/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-body text-sm font-semibold text-on-surface-variant">{hygiene.label}</p>
              <p className="font-body text-xs text-on-surface-variant">
                {hygiene.checkCount} checks reported — 0% of the AI score
              </p>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
