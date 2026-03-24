import { ResultsView } from '@/components/results-view';

type PageProps = { params: Promise<{ id: string }> };

export default async function ResultsPage({ params }: PageProps) {
  const { id } = await params;
  const siteKey = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'] ?? '';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <ResultsView scanId={id} turnstileSiteKey={siteKey} />
    </main>
  );
}
