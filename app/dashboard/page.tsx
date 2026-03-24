import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from './actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const { data: scans, error: scansErr } = await supabase
    .from('scans')
    .select('id, url, domain, score, letter_grade, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data: reports } = await supabase
    .from('reports')
    .select('id, scan_id, type, email_delivered_at, pdf_generated_at')
    .eq('user_id', user.id);

  const reportList = reports ?? [];

  if (scansErr) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-red-600">Could not load scans.</p>
      </main>
    );
  }

  const reportByScan = new Map<string, (typeof reportList)[number]>();
  for (const r of reportList) {
    if (r.scan_id) {
      reportByScan.set(r.scan_id, r);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-geo-accent">Account</p>
          <h1 className="mt-2 text-3xl font-bold text-geo-ink">Your scans</h1>
          <p className="mt-1 text-geo-mist">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-geo-mist/50 px-4 py-2 text-sm font-medium text-geo-ink hover:bg-geo-mist/10"
          >
            Sign out
          </button>
        </form>
      </div>

      <ul className="mt-10 space-y-4">
        {(scans ?? []).length === 0 ? (
          <li className="rounded-xl border border-dashed border-geo-mist/60 p-8 text-center text-geo-mist">
            No scans linked yet. Run a free audit on the{' '}
            <Link href="/" className="font-medium text-geo-accent hover:underline">
              home page
            </Link>
            .
          </li>
        ) : (
          (scans ?? []).map((s) => {
            const rep = reportByScan.get(s.id);
            return (
              <li
                key={s.id}
                className="flex flex-col gap-2 rounded-xl border border-geo-mist/30 bg-white/50 px-5 py-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-geo-ink">{s.domain}</span>
                  {s.score != null ? (
                    <span className="text-sm text-geo-mist">
                      AI Search Readiness Score:{' '}
                      <strong className="text-geo-ink">{s.score}</strong>
                      {s.letter_grade ? ` (${s.letter_grade})` : ''}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm text-geo-mist">{s.url}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link
                    href={`/results/${s.id}`}
                    className="font-medium text-geo-accent hover:underline"
                  >
                    View results
                  </Link>
                  {rep?.type === 'deep_audit' && rep.email_delivered_at ? (
                    <span className="text-geo-mist">Deep audit emailed</span>
                  ) : rep?.type === 'deep_audit' ? (
                    <span className="text-amber-700">Deep audit pending</span>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
