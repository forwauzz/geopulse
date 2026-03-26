import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from './actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/server/require-admin';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function gradeColor(grade: string | null): string {
  if (!grade) return 'bg-surface-container-high text-on-surface-variant';
  if (grade.startsWith('A')) return 'bg-primary/15 text-primary';
  if (grade.startsWith('B')) return 'bg-tertiary/15 text-tertiary';
  if (grade.startsWith('C')) return 'bg-warning/20 text-on-background';
  return 'bg-error/15 text-error';
}

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
    .select('id, scan_id, type, email_delivered_at, pdf_generated_at, pdf_url')
    .eq('user_id', user.id);

  const reportList = reports ?? [];

  if (scansErr) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-error">Could not load scans.</p>
      </main>
    );
  }

  const reportByScan = new Map<string, (typeof reportList)[number]>();
  for (const r of reportList) {
    if (r.scan_id) {
      reportByScan.set(r.scan_id, r);
    }
  }

  const scanList = scans ?? [];
  const totalScans = scanList.length;
  const scores = scanList.map((s) => s.score).filter((s): s is number => s != null);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const deepAuditCount = reportList.filter((r) => r.type === 'deep_audit').length;

  return (
    <main className="mx-auto min-h-[60vh] max-w-3xl px-6 py-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Account</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Your scans</h1>
          <p className="mt-1 font-body text-on-surface-variant">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-primary px-4 py-2 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            New scan
          </Link>
          {isAdminEmail(user.email) && (
            <>
              <Link
                href="/dashboard/attribution"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Attribution
              </Link>
              <Link
                href="/dashboard/evals"
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
              >
                Report evals
              </Link>
            </>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Quick stats */}
      {totalScans > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Scans</p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">{totalScans}</p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Avg score</p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {avgScore != null ? `${avgScore}/100` : '\u2014'}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Deep audits</p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">{deepAuditCount}</p>
          </div>
        </div>
      )}

      {/* Scan list */}
      <ul className="mt-8 space-y-4">
        {totalScans === 0 ? (
          <li className="rounded-xl bg-surface-container-low p-8 text-center font-body text-on-surface-variant">
            No scans linked yet. Run a free audit on the{' '}
            <Link href="/" className="font-medium text-tertiary hover:underline">
              home page
            </Link>
            .
          </li>
        ) : (
          scanList.map((s) => {
            const rep = reportByScan.get(s.id);
            const isDeepAudit = rep?.type === 'deep_audit';
            const isDelivered = isDeepAudit && !!rep?.email_delivered_at;
            const hasPdf = isDeepAudit && !!rep?.pdf_url;

            return (
              <li
                key={s.id}
                className="rounded-xl bg-surface-container-lowest px-5 py-5 shadow-float"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-headline text-lg font-semibold text-on-background">{s.domain}</span>
                    {s.letter_grade && (
                      <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${gradeColor(s.letter_grade)}`}>
                        {s.letter_grade}
                      </span>
                    )}
                  </div>
                  {s.score != null && (
                    <span className="font-body text-sm text-on-surface-variant">
                      <strong className="text-on-background">{s.score}</strong>/100
                    </span>
                  )}
                </div>

                <p className="mt-1 truncate font-body text-sm text-on-surface-variant">{s.url}</p>
                <p className="mt-1 font-body text-xs text-on-surface-variant">{formatDate(s.created_at)}</p>

                {/* Status badge */}
                <div className="mt-3 flex items-center gap-2">
                  {isDelivered ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      <span className="material-symbols-outlined text-sm">task_alt</span>
                      Report delivered
                    </span>
                  ) : isDeepAudit ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-warning/10 px-2.5 py-1 text-xs font-medium text-on-background">
                      <span className="material-symbols-outlined text-sm">hourglass_top</span>
                      Generating report
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-lg bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                      Free scan
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-3 border-t border-outline-variant/10 pt-3 font-body text-sm">
                  <Link href={`/results/${s.id}`} className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline">
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    View results
                  </Link>
                  {hasPdf && rep?.pdf_url && (
                    <a
                      href={rep.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-tertiary hover:underline"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                      Download PDF
                    </a>
                  )}
                  <Link
                    href={`/?url=${encodeURIComponent(s.url)}`}
                    className="inline-flex items-center gap-1 font-medium text-on-surface-variant hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    Rescan
                  </Link>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
