import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { userHasFeature } from '@/lib/server/user-feature-grants';
import {
  groupByDomain,
  latestComparison,
  loadUserScans,
  summarize,
  type CheckChange,
  type VerifyResult,
} from '@/lib/server/verify-agent';

export const dynamic = 'force-dynamic';

const VERDICT_COPY: Record<VerifyResult['verdict'], { label: string; tone: string }> = {
  improved: { label: 'Improved', tone: 'text-green-700 dark:text-green-300' },
  regressed: { label: 'Regressed', tone: 'text-error' },
  unchanged: { label: 'No change', tone: 'text-on-surface-variant' },
  inconclusive: { label: 'Inconclusive', tone: 'text-on-surface-variant' },
};

function CheckList({ title, items, tone }: { title: string; items: readonly CheckChange[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`font-sans text-xs font-bold uppercase tracking-wide ${tone}`}>
        {title} ({items.length})
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.check} className="font-sans text-sm text-on-surface-variant">
            <span className="text-on-background">{item.check}</span>
            {item.finding ? <span> — {item.finding}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function VerifyAgentPage({
  searchParams,
}: {
  searchParams?: Promise<{ domain?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/agents/verify');

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) redirect('/dashboard');
  const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const allowed =
    (await isUserPlatformAdmin(user.id, admin)) || (await userHasFeature(admin, user.id, 'verify_agent'));
  if (!allowed) redirect('/dashboard');

  const scans = await loadUserScans(admin as never, user.id);
  const byDomain = groupByDomain(scans);
  const comparable = [...byDomain.entries()].filter(([, list]) => list.length >= 2);

  const selectedDomain = sp.domain && byDomain.has(sp.domain) ? sp.domain : comparable[0]?.[0] ?? null;
  const result = selectedDomain ? latestComparison(byDomain.get(selectedDomain) ?? []) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
          <Link href="/dashboard/agents" className="hover:underline">
            Agents
          </Link>
        </p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">
          Verify Agent
        </h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Compares your two most recent audits of a site, so you can see what a change actually did
          instead of reading two reports side by side.
        </p>
      </header>

      {comparable.length === 0 ? (
        <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
          <p className="font-sans text-sm text-on-surface-variant">
            Nothing to compare yet. The agent needs two audits of the same site — a before and an
            after. Run one now, make your changes, then run another.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 font-sans text-sm font-semibold text-on-primary"
          >
            Audit a website
          </Link>
        </section>
      ) : null}

      {comparable.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Sites with a comparison">
          {comparable.map(([domain]) => (
            <Link
              key={domain}
              href={`/dashboard/agents/verify?domain=${encodeURIComponent(domain)}`}
              className={`rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition ${
                domain === selectedDomain
                  ? 'bg-surface-container-high text-on-background'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-background'
              }`}
            >
              {domain}
            </Link>
          ))}
        </nav>
      ) : null}

      {result ? (
        <section className="space-y-5 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
          <div>
            <p className={`font-sans text-xs font-bold uppercase tracking-wide ${VERDICT_COPY[result.verdict].tone}`}>
              {VERDICT_COPY[result.verdict].label}
            </p>
            <p className="mt-1 font-sans text-2xl font-black tracking-tight text-on-background">
              {result.domain}
            </p>
            <p className="mt-1 font-sans text-sm text-on-surface-variant">{summarize(result)}</p>
          </div>

          {result.regressed.length > 0 ? (
            <p className="rounded-xl bg-error/10 px-4 py-3 font-sans text-sm text-error">
              Something that used to pass is now failing. That is worth looking at even if the score
              went up — a rise elsewhere can hide it.
            </p>
          ) : null}

          <div className="space-y-4">
            <CheckList title="Fixed" items={result.fixed} tone="text-green-700 dark:text-green-300" />
            <CheckList title="Regressed" items={result.regressed} tone="text-error" />
            <CheckList title="Still failing" items={result.stillFailing} tone="text-on-surface-variant" />
            <CheckList title="Newly checked" items={result.newlyChecked} tone="text-on-surface-variant" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
