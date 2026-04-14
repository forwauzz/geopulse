import { BenchmarkRunDetailView } from '@/components/benchmark-run-detail-view';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createBenchmarkAdminData } from '@/lib/server/benchmark-admin-data';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ runGroupId: string }>;
};

export default async function BenchmarkRunGroupDetailPage({ params }: Props) {
  const { runGroupId } = await params;
  const adminContext = await loadAdminPageContext(`/dashboard/benchmarks/${runGroupId}`);
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const benchmarkData = createBenchmarkAdminData(adminContext.adminDb);

  let detail;
  try {
    detail = await benchmarkData.getRunGroupDetail(runGroupId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not load benchmark run detail.';
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Benchmark run detail
        </h1>
        <p className="mt-4 text-error">{message}</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">
          Benchmark run detail
        </h1>
        <p className="mt-4 text-on-surface-variant">Run group not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <BenchmarkRunDetailView detail={detail} />
    </main>
  );
}
