import { notFound } from 'next/navigation';
import { ScoreReport } from '@/components/score-report';
import { immersiveLabsScan } from '@/components/score-report.fixtures';

/**
 * Dev-only preview of the redesigned scorecard (loop-1), rendered against a real
 * production scan fixture. Not part of the product flow — 404s in prod.
 * Add ?paid=1 to preview the legacy paid (Stripe-steer) mode.
 */
export default async function ScorecardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { paid } = await searchParams;
  return (
    <main className="min-h-screen bg-surface">
      <ScoreReport
        data={immersiveLabsScan}
        legacyPaidEnabled={paid === '1'}
        benchmark={{ percentile: 78, median: 49, top10: 74, sampleSize: 129 }}
      />
    </main>
  );
}
