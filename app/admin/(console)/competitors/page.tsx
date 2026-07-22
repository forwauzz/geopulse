import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { isAgentEnabled } from '@/lib/server/agent-flags';
import {
  DESTINATION_LABELS,
  loadCohortComparison,
  type AccessSignal,
  type Cohort,
  type DomainComparison,
  type PageSignal,
} from '@/lib/server/competitor-cohorts';
import type { DestinationId } from '../../../../workers/scan-engine/access-matrix';
import { addCohortDomainAction, removeCohortDomainAction, scanCohortDomainNowAction } from './actions';

export const dynamic = 'force-dynamic';

const input =
  'min-h-[40px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';

const DESTINATIONS: ReadonlyArray<{ id: DestinationId; label: string }> = (
  Object.keys(DESTINATION_LABELS) as DestinationId[]
).map((id) => ({ id, label: DESTINATION_LABELS[id] }));

function fmt(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Toronto' });
}

/** Neutral, factual cell — 'not verified' is a scanner limitation, never a claim about the site. */
function AccessCell({ signal }: { signal: AccessSignal | undefined }) {
  if (signal === 'allows') {
    return <span className="font-semibold text-green-700 dark:text-green-300">Allows ✓</span>;
  }
  if (signal === 'blocks') {
    return <span className="font-semibold text-red-700 dark:text-red-300">Blocks ✗</span>;
  }
  return (
    <span className="text-on-surface-variant" title="Our scanner could not verify this signal">
      — not verified
    </span>
  );
}

function PageCell({ signal }: { signal: PageSignal }) {
  if (signal === 'present') return <span className="font-semibold text-green-700 dark:text-green-300">Yes ✓</span>;
  if (signal === 'partial') return <span className="font-semibold text-amber-700 dark:text-amber-300">Partial</span>;
  if (signal === 'missing') return <span className="font-semibold text-red-700 dark:text-red-300">No</span>;
  return (
    <span className="text-on-surface-variant" title="Our scanner could not verify this signal">
      — not verified
    </span>
  );
}

function DeltaBadges({ deltas }: { deltas: DomainComparison['deltas'] }) {
  if (deltas.length === 0) return null;
  const shown = deltas.slice(0, 2);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((delta) => (
        <span
          key={delta.label}
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            delta.direction === 'improved'
              ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200'
          }`}
        >
          {delta.direction === 'improved' ? '▲' : '▼'} {delta.label}
        </span>
      ))}
      {deltas.length > shown.length && (
        <span className="text-[10px] text-on-surface-variant">+{deltas.length - shown.length} more</span>
      )}
    </div>
  );
}

function DomainRow({ d }: { d: DomainComparison }) {
  return (
    <tr className="border-t border-outline-variant/10">
      <td className="py-2.5 pr-2 text-center">
        {d.rank != null ? (
          <span className="font-sans text-sm font-bold tabular-nums text-on-surface-variant">#{d.rank}</span>
        ) : (
          <span className="text-xs text-on-surface-variant">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        <span className="font-sans font-bold text-on-background">{d.displayName}</span>
        {d.isCustomer && (
          <span className="ml-2 rounded-md bg-tertiary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-tertiary">
            You
          </span>
        )}
        <div className="text-xs text-on-surface-variant">{d.canonicalDomain}</div>
      </td>
      <td className="py-2.5 pr-3 text-on-background">
        {d.scoreState === 'measured' && d.score != null ? (
          <span className="font-sans font-bold tabular-nums">{d.score}</span>
        ) : (
          <span className="text-xs text-on-surface-variant">
            {d.scoreState === 'never_scanned' ? 'not scanned yet' : 'couldn’t verify'}
          </span>
        )}
        <DeltaBadges deltas={d.deltas} />
      </td>
      {DESTINATIONS.map((dest) => (
        <td key={dest.id} className="py-2.5 pr-3 text-xs">
          <AccessCell signal={d.destinations[dest.id]} />
        </td>
      ))}
      <td className="py-2.5 pr-3 text-xs">
        <PageCell signal={d.structuredData} />
      </td>
      <td className="py-2.5 pr-3 text-xs">
        <PageCell signal={d.llmsTxt} />
      </td>
      <td className="py-2.5 pr-3 text-xs text-on-surface-variant">{fmt(d.scannedAt)}</td>
      <td className="py-2.5 text-right">
        <div className="flex justify-end gap-1.5">
          <form action={scanCohortDomainNowAction}>
            <input type="hidden" name="domainId" value={d.domainId} />
            <button className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container">
              Scan now
            </button>
          </form>
          <form action={removeCohortDomainAction}>
            <input type="hidden" name="domainId" value={d.domainId} />
            <button className="rounded-lg border border-error/30 px-2.5 py-1 text-xs font-semibold text-error hover:bg-error/10">
              Remove
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

function CohortStandingsChips({ cohort }: { cohort: Cohort }) {
  const s = cohort.standings;
  const chip =
    'rounded-lg bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface';
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <span className={chip}>
        {s.measuredCount} of {s.totalCount} scanned
      </span>
      {s.medianScore != null && <span className={chip}>Market median {s.medianScore}</span>}
      {DESTINATIONS.map(({ id, label }) => {
        const stat = s.destinationAllows[id];
        if (!stat) return null;
        return (
          <span key={id} className={chip}>
            {stat.allows}/{stat.of} allow {label}
          </span>
        );
      })}
    </div>
  );
}

export default async function AdminCompetitorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ addError?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const ctx = await loadAdminPageContext('/admin/competitors');
  if (!ctx.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{ctx.message}</p>
      </main>
    );
  }

  const [cohorts, sweepEnabled] = await Promise.all([
    loadCohortComparison(ctx.adminDb),
    isAgentEnabled(ctx.adminDb, 'competitor_benchmark', { failOpen: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans text-2xl font-bold text-on-background">Local competitors</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Hand-curated market cohorts, re-scanned weekly. Everything below is an observable technical
          fact from public HTTP responses — never a judgment about any business.
        </p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          sweepEnabled
            ? 'border-green-500/30 bg-green-500/5 text-on-surface'
            : 'border-amber-500/30 bg-amber-500/5 text-on-surface'
        }`}
      >
        {sweepEnabled ? (
          <>Weekly sweep is <strong>on</strong> — stale domains re-scan automatically (max 2 per hour).</>
        ) : (
          <>
            Weekly sweep is <strong>off</strong> (fail-closed default). “Scan now” still works per
            domain; turn the sweep on in <a className="font-semibold underline" href="/admin/agents">/admin/agents</a>.
          </>
        )}
      </div>

      {params?.addError && (
        <div className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          Couldn’t add that business: {params.addError}
        </div>
      )}

      <section className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest p-5">
        <h2 className="font-sans text-base font-bold text-on-background">Add a business to a cohort</h2>
        <p className="mt-1 text-xs text-on-surface-variant">
          Cohort = market + region. Mark exactly one business per cohort as the customer baseline.
        </p>
        <form action={addCohortDomainAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="url" required placeholder="https://competitor.ca" className={input} />
          <input name="displayName" placeholder="Display name (optional)" className={input} />
          <input name="vertical" required defaultValue="MSP / IT services" placeholder="Market" className={input} />
          <input name="geoRegion" required defaultValue="Montréal, QC" placeholder="Region" className={input} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input type="checkbox" name="isCustomer" className="h-4 w-4" />
              Customer
            </label>
            <button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:opacity-90">
              Add
            </button>
          </div>
        </form>
      </section>

      {cohorts.length === 0 && (
        <p className="text-sm text-on-surface-variant">
          No cohorts yet. Add the customer and two or three of their actual local rivals to see the
          side-by-side.
        </p>
      )}

      {cohorts.map((cohort) => (
        <section
          key={`${cohort.vertical}|${cohort.geoRegion}`}
          className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest p-5"
        >
          <h2 className="font-sans text-base font-bold text-on-background">
            {cohort.vertical} · {cohort.geoRegion}
          </h2>
          <CohortStandingsChips cohort={cohort} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="pb-2 pr-2 font-semibold">Rank</th>
                  <th className="pb-2 pr-3 font-semibold">Business</th>
                  <th className="pb-2 pr-3 font-semibold">Score</th>
                  {DESTINATIONS.map((d) => (
                    <th key={d.id} className="pb-2 pr-3 font-semibold">
                      {d.label}
                    </th>
                  ))}
                  <th className="pb-2 pr-3 font-semibold">Structured data</th>
                  <th className="pb-2 pr-3 font-semibold">llms.txt</th>
                  <th className="pb-2 pr-3 font-semibold">Last scanned</th>
                  <th className="pb-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {cohort.domains.map((d) => (
                  <DomainRow key={d.domainId} d={d} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs text-on-surface-variant">
        Method: each row is a standard GEO-Pulse scan of the site’s public homepage and robots.txt on
        the date shown. “Allows/Blocks” reflects the site’s own published crawler rules per AI
        destination; “— not verified” means our scanner could not observe the signal (for example the
        site blocks automated fetches) and says nothing about the business. Internal use only — get a
        legal read before showing named-competitor pages to clients.
      </p>
    </div>
  );
}
