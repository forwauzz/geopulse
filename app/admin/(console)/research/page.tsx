import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import {
  addWatchlistSource,
  reviewResearchProposal,
  runResearchSweepNow,
  toggleWatchlistSource,
} from './actions';

export const dynamic = 'force-dynamic';

const input =
  'min-h-[40px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' });
}

type ProposalRow = {
  id: string;
  detected_at: string;
  source_url: string;
  source_tier: number;
  spec_section: string;
  claim_before: string;
  claim_after: string;
  evidence: string;
  confidence: string;
  status: string;
};

type WatchRow = {
  id: string;
  url: string;
  label: string;
  tier: number;
  spec_section: string;
  enabled: boolean;
};

function tierBadge(tier: number): string {
  if (tier === 1) return 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200';
  if (tier === 2) return 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200';
  return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200';
}

export default async function AdminResearchPage() {
  const ctx = await loadAdminPageContext('/admin/research');
  if (!ctx.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{ctx.message}</p>
      </main>
    );
  }

  let proposals: ProposalRow[] = [];
  let watchlist: WatchRow[] = [];
  let tablesReady = true;
  try {
    const [{ data: props, error: pErr }, { data: watches, error: wErr }] = await Promise.all([
      ctx.adminDb
        .from('research_proposals')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(100),
      ctx.adminDb.from('research_watchlist').select('*').order('tier').order('label'),
    ]);
    if (pErr || wErr) tablesReady = false;
    proposals = (props ?? []) as ProposalRow[];
    watchlist = (watches ?? []) as WatchRow[];
  } catch {
    tablesReady = false;
  }

  const pending = proposals.filter((p) => p.status === 'pending');
  const reviewed = proposals.filter((p) => p.status !== 'pending').slice(0, 20);

  return (
    <div className="space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Admin</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Research agent</h1>
        <p className="mt-1 max-w-2xl font-sans text-sm text-on-surface-variant">
          Watches vendor crawler docs and study sources weekly, and drafts proposed spec changes for
          YOUR review. It never applies anything — approving a proposal records the decision; a human
          then edits the check catalog or copy by hand.
        </p>
      </header>

      {!tablesReady && (
        <p className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 font-sans text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Migration 055_research_agent.sql has not been applied to this database yet — the agent is a
          quiet no-op until then.
        </p>
      )}

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-sans text-lg font-bold text-on-background">
            Review queue{pending.length > 0 ? ` (${pending.length} pending)` : ''}
          </h2>
          <form action={runResearchSweepNow}>
            <button
              type="submit"
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Run sweep now
            </button>
          </form>
        </div>

        {pending.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-on-surface-variant">
            Nothing pending. The weekly sweep runs Mondays; changed sources appear here.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {pending.map((p) => (
              <div key={p.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest ${tierBadge(p.source_tier)}`}>
                    Tier {p.source_tier}
                  </span>
                  <span className="font-sans text-xs font-semibold text-on-background">{p.spec_section}</span>
                  <span className="font-sans text-xs text-on-surface-variant">confidence: {p.confidence}</span>
                  {p.source_tier === 3 && (
                    <span className="font-sans text-xs text-amber-700 dark:text-amber-300">
                      unverified — needs Tier 1/2 corroboration
                    </span>
                  )}
                  <span className="ml-auto font-sans text-xs text-on-surface-variant">{fmt(p.detected_at)}</span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg bg-surface-container-lowest p-3">
                    <p className="font-label text-[0.6rem] uppercase tracking-widest text-on-surface-variant">Before</p>
                    <p className="mt-1 font-sans text-sm text-on-surface-variant">{p.claim_before}</p>
                  </div>
                  <div className="rounded-lg bg-surface-container-lowest p-3">
                    <p className="font-label text-[0.6rem] uppercase tracking-widest text-on-surface-variant">Proposed</p>
                    <p className="mt-1 font-sans text-sm text-on-background">{p.claim_after}</p>
                  </div>
                </div>
                <p className="mt-2 font-sans text-xs text-on-surface-variant">Evidence: {p.evidence}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-sans text-xs font-semibold text-primary underline"
                  >
                    Open source
                  </a>
                  <form action={reviewResearchProposal}>
                    <input type="hidden" name="proposalId" value={p.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button
                      type="submit"
                      className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-on-primary transition hover:opacity-90"
                    >
                      Approve (I will apply it by hand)
                    </button>
                  </form>
                  <form action={reviewResearchProposal}>
                    <input type="hidden" name="proposalId" value={p.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button
                      type="submit"
                      className="rounded-lg border border-outline-variant/30 px-3 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-lowest"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        {reviewed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer font-sans text-xs font-semibold text-on-surface-variant">
              Recently reviewed ({reviewed.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {reviewed.map((p) => (
                <li key={p.id} className="font-sans text-xs text-on-surface-variant">
                  [{p.status}] {p.spec_section} — {p.claim_after.slice(0, 100)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Watchlist</h2>
        <p className="mt-1 font-sans text-xs text-on-surface-variant">
          Tier 1 = vendor/authoritative docs (may propose facts) · Tier 2 = independent studies ·
          Tier 3 = vendor blogs (leads only, never promoted to fact without corroboration).
        </p>
        <div className="mt-3 space-y-2">
          {watchlist.map((w) => (
            <div key={w.id} className={`flex flex-wrap items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2 ${w.enabled ? '' : 'opacity-50'}`}>
              <span className={`rounded-md px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest ${tierBadge(w.tier)}`}>
                T{w.tier}
              </span>
              <span className="font-sans text-sm font-semibold text-on-background">{w.label}</span>
              <span className="font-sans text-xs text-on-surface-variant">{w.spec_section}</span>
              <a href={w.url} target="_blank" rel="noopener noreferrer" className="truncate font-sans text-xs text-primary underline">
                {w.url}
              </a>
              <form action={toggleWatchlistSource} className="ml-auto">
                <input type="hidden" name="watchId" value={w.id} />
                <input type="hidden" name="enable" value={w.enabled ? 'false' : 'true'} />
                <button
                  type="submit"
                  className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-lowest"
                >
                  {w.enabled ? 'Disable' : 'Enable'}
                </button>
              </form>
            </div>
          ))}
        </div>

        <form action={addWatchlistSource} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="block md:col-span-2">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Source URL (https)</span>
            <input name="url" type="url" required placeholder="https://vendor.com/docs/crawlers" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Label</span>
            <input name="label" required placeholder="Vendor crawler docs" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Tier</span>
            <select name="tier" defaultValue="3" className={input}>
              <option value="1">1 — authoritative</option>
              <option value="2">2 — study</option>
              <option value="3">3 — vendor blog</option>
            </select>
          </label>
          <label className="block md:col-span-3">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Spec section it affects</span>
            <input name="specSection" placeholder="§2.2 / C3" className={input} />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-outline-variant/30 px-5 text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
            >
              Add source
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
