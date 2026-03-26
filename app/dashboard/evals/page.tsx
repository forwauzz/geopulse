import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { requireAdminOrRedirect } from '@/lib/server/require-admin';

export const dynamic = 'force-dynamic';

type EvalRow = {
  id: string;
  rubric_version: string;
  generator_version: string;
  overall_score: number | null;
  created_at: string;
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TrendSvg(rows: readonly EvalRow[]): ReactNode {
  const scores = rows
    .slice()
    .reverse()
    .map((r) => r.overall_score)
    .filter((s): s is number => typeof s === 'number' && !Number.isNaN(s));
  if (scores.length < 2) {
    return (
      <p className="font-body text-sm text-on-surface-variant">
        Run <code className="rounded bg-surface-container-high px-1">npm run eval:smoke</code> twice to see a trend line.
      </p>
    );
  }
  const w = 320;
  const h = 120;
  const pad = 8;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const pts = scores
    .map((s, i) => {
      const x = pad + (i / Math.max(1, scores.length - 1)) * (w - pad * 2);
      const y = h - pad - ((s - min) / span) * (h - pad * 2);
      return `${String(x)},${String(y)}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      className="h-32 w-full max-w-sm text-primary"
      role="img"
      aria-label="Overall score over time"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

export default async function ReportEvalsAdminPage() {
  const supabaseSession = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseSession.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/evals');
  }

  requireAdminOrRedirect(user.email);

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const service = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !service) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">Server misconfigured: missing Supabase service role.</p>
      </main>
    );
  }

  const adminDb = createServiceRoleClient(url, service);
  const { data: runs, error } = await adminDb
    .from('report_eval_runs')
    .select('id,rubric_version,generator_version,overall_score,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">Could not load eval runs.</p>
      </main>
    );
  }

  const list = (runs ?? []) as EvalRow[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Report quality evals</h1>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Structural rubric scores over time (offline smoke). Service-role writes only.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
        >
          Back to dashboard
        </Link>
      </div>

      <section className="mt-10 rounded-xl bg-surface-container-lowest p-6 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Overall score trend</h2>
        <div className="mt-4">{TrendSvg(list)}</div>
      </section>

      <section className="mt-8">
        <h2 className="font-headline text-lg font-semibold text-on-background">Recent runs</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-outline-variant/15">
          <table className="w-full min-w-[640px] border-collapse text-left font-body text-sm">
            <thead>
              <tr className="border-b border-outline-variant/15 bg-surface-container-low">
                <th className="px-4 py-3 font-semibold text-on-background">When</th>
                <th className="px-4 py-3 font-semibold text-on-background">Rubric</th>
                <th className="px-4 py-3 font-semibold text-on-background">Generator</th>
                <th className="px-4 py-3 font-semibold text-on-background">Score</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                    No eval runs yet. Run <code className="rounded bg-surface-container-high px-1">npm run eval:smoke</code> locally
                    with <code className="rounded bg-surface-container-high px-1">SUPABASE_SERVICE_ROLE_KEY</code> set.
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id} className="border-b border-outline-variant/10">
                    <td className="px-4 py-3 text-on-surface-variant">{formatTs(row.created_at)}</td>
                    <td className="px-4 py-3 text-on-background">{row.rubric_version}</td>
                    <td className="px-4 py-3 text-on-background">{row.generator_version}</td>
                    <td className="px-4 py-3 font-medium text-on-background">
                      {row.overall_score != null ? String(row.overall_score) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
