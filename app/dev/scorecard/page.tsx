import { notFound } from 'next/navigation';
import { ScoreReport } from '@/components/score-report';
import { CompetitorCompare } from '@/components/competitor-compare';
import { immersiveLabsScan } from '@/components/score-report.fixtures';

/**
 * Dev-only preview of the redesigned scorecard (loop-1), rendered against a real
 * production scan fixture. Not part of the product flow — 404s in prod.
 * ?paid=1 previews the legacy paid mode. ?compete=1 seeds the competitor table.
 */
export default async function ScorecardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; compete?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { paid, compete } = await searchParams;

  const benchmark = { percentile: 78, median: 49, top10: 74, sampleSize: 129 };
  const you = {
    domain: immersiveLabsScan.domain,
    score: immersiveLabsScan.score,
    letterGrade: immersiveLabsScan.letterGrade,
    categoryScores: immersiveLabsScan.categoryScores,
  };
  const seededCompetitors =
    compete === '1'
      ? [
          {
            domain: 'northwind-it.ca',
            score: 74,
            letterGrade: 'C',
            categoryScores: [
              { category: 'ai_readiness', score: 82, letterGrade: 'B-', checkCount: 8 },
              { category: 'extractability', score: 71, letterGrade: 'C-', checkCount: 11 },
              { category: 'trust', score: 58, letterGrade: 'F', checkCount: 3 },
            ],
          },
          {
            domain: 'summit-msp.com',
            score: 52,
            letterGrade: 'F',
            categoryScores: [
              { category: 'ai_readiness', score: 61, letterGrade: 'D', checkCount: 8 },
              { category: 'extractability', score: 48, letterGrade: 'F', checkCount: 11 },
              { category: 'trust', score: 40, letterGrade: 'F', checkCount: 3 },
            ],
          },
        ]
      : undefined;

  return (
    <main className="min-h-screen bg-surface">
      <ScoreReport
        data={immersiveLabsScan}
        legacyPaidEnabled={paid === '1'}
        benchmark={benchmark}
        competitorSlot={
          <CompetitorCompare
            you={you}
            siteKey="1x00000000000000000000AA"
            benchmark={benchmark}
            initialCompetitors={seededCompetitors}
          />
        }
      />
    </main>
  );
}
