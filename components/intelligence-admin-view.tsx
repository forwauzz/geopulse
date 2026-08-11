import Link from 'next/link';
import type {
  IntelligenceAdminStatus,
  IntelligenceAlertRow,
  IntelligenceDomainRow,
  IntelligenceEvidenceRow,
  IntelligenceCommercialReadinessRow,
  IntelligenceLaneRow,
  IntelligenceOverview,
  IntelligencePatternRow,
  IntelligenceQualityRow,
  IntelligenceRunRow,
  IntelligenceWindowRow,
} from '@/lib/intelligence/admin-data';

const NAV = [
  ['/admin/intelligence', 'Overview'],
  ['/admin/intelligence/domains', 'Domains'],
  ['/admin/intelligence/lanes', 'Lanes'],
  ['/admin/intelligence/windows', 'Windows'],
  ['/admin/intelligence/evidence', 'Evidence'],
  ['/admin/intelligence/quality', 'Quality'],
  ['/admin/intelligence/patterns', 'Patterns'],
] as const;

function short(value: string | null, length = 12): string {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
function number(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return 'Not available';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function percent(value: number | null): string {
  return value === null ? 'Not available' : `${(value * 100).toFixed(1)}%`;
}
function Badge({ children, tone = 'neutral' }: {
  children: React.ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const tones = {
    good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bad: 'bg-red-500/10 text-red-700 dark:text-red-300',
    neutral: 'bg-surface-container-high text-on-surface-variant',
  };
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}
function qualityTone(value: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (['valid', 'valid_partial', 'complete', 'available'].includes(value)) return 'good';
  if (['incomplete', 'configuration_mismatch', 'not_available'].includes(value)) return 'warn';
  if (['provider_failure', 'orphaned', 'parser_suspect', 'duplicate', 'quarantined'].includes(value)) return 'bad';
  return 'neutral';
}

export function IntelligencePageFrame({
  title,
  description,
  status,
  message,
  children,
}: {
  title: string;
  description: string;
  status: IntelligenceAdminStatus;
  message: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="font-label text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
          Internal intelligence
        </p>
        <h1 className="font-headline text-3xl font-semibold text-on-background">{title}</h1>
        <p className="max-w-3xl text-sm text-on-surface-variant">{description}</p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Intelligence control room">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary">
            {label}
          </Link>
        ))}
      </nav>
      {status !== 'ready' ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h2 className="font-headline text-lg font-semibold text-on-surface">
            {status === 'migration_pending' ? 'Intelligence foundation pending' : 'Data temporarily unavailable'}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">{message}</p>
          <p className="mt-3 text-xs text-on-surface-variant">
            This page fails closed. It does not fall back to tenant or competitor evidence.
          </p>
        </section>
      ) : null}
      {children}
      <OperatorGlossary />
    </main>
  );
}

function Card({ label, value, note, tone = 'neutral' }: {
  label: string;
  value: string;
  note: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const borders = {
    good: 'border-emerald-500/25',
    warn: 'border-amber-500/30',
    bad: 'border-red-500/25',
    neutral: 'border-outline-variant/20',
  };
  return (
    <div className={`rounded-2xl border bg-surface-container-low p-4 ${borders[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-2 font-headline text-2xl font-semibold text-on-surface">{value}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{note}</p>
    </div>
  );
}

export function IntelligenceOverviewView({ overview }: { overview: IntelligenceOverview }) {
  const totalWindows = overview.eligibleWindowCount + overview.ineligibleWindowCount;
  const completeness = totalWindows ? overview.eligibleWindowCount / totalWindows : null;
  return (
    <>
      <section>
        <h2 className="mb-3 font-headline text-lg font-semibold text-on-surface">Health before headlines</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card
            label="Collecting now"
            value={overview.latestObservedAt ? new Date(overview.latestObservedAt).toLocaleString() : 'Not available'}
            note={overview.recentSourceKinds.length ? overview.recentSourceKinds.join(', ') : 'No indexed source activity yet'}
            tone={overview.latestObservedAt ? 'good' : 'warn'}
          />
          <Card label="Window completeness" value={percent(completeness)} note={`${number(overview.eligibleWindowCount)} eligible · ${number(overview.ineligibleWindowCount)} gated`} tone={completeness !== null && completeness >= 0.8 ? 'good' : 'warn'} />
          <Card label="Open quality alerts" value={number(overview.openAlertCount)} note="Stale, failed, incomplete, or anomalous" tone={overview.openAlertCount ? 'bad' : 'good'} />
          <Card label="Evidence catalog" value={number(overview.evidenceCount)} note={`${number(overview.qualityCount)} replayable quality classifications`} />
          <Card label="Measurable interventions" value={number(overview.interventionCount)} note="Exact-compatible before/after pairs only" />
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/intelligence/domains" className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 hover:border-primary/30">
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">Canonical history</p>
          <p className="mt-2 font-headline text-xl font-semibold text-on-surface">{number(overview.domainCount)} domains</p>
          <p className="mt-1 text-sm text-on-surface-variant">{number(overview.runCount)} indexed runs across scans, benchmarks, evals, reports, and interventions.</p>
        </Link>
        <Link href="/admin/intelligence/quality" className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 hover:border-primary/30">
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">Operator queue</p>
          <p className="mt-2 font-headline text-xl font-semibold text-on-surface">Inspect gated evidence</p>
          <p className="mt-1 text-sm text-on-surface-variant">Original source statuses remain unchanged; repairs are append-only and audited.</p>
        </Link>
      </section>
    </>
  );
}

const BLOCKER_LABELS: Record<string, string> = {
  cohort_below_minimum: 'Fewer than 50 stored businesses',
  schedule_below_minimum: 'Fewer than 50 businesses enabled for the frozen schedule',
  no_completed_comparable_domains: 'No businesses completed under the comparable MSP protocol',
  completed_cohort_below_minimum: 'Fewer than 50 businesses have comparable completed runs',
  insufficient_repeated_windows: 'Fewer than four eligible windows per completed business',
  evidence_stale_or_missing: 'Latest eligible evidence is missing or older than 72 hours',
  mixed_protocol_variants: 'The evidence mixes protocol versions',
};

export function IntelligenceCommercialReadinessView({
  readiness,
}: {
  readiness: IntelligenceCommercialReadinessRow | null;
}) {
  if (!readiness) return <Empty>No MSP readiness row is available yet.</Empty>;
  const publishable = readiness.assessment.aggregateClaims === 'observational_only';
  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">MSP commercial evidence</p>
          <h2 className="mt-1 font-headline text-xl font-semibold text-on-surface">Can we market what the engine learned?</h2>
        </div>
        <Badge tone={publishable ? 'good' : 'warn'}>{publishable ? 'Observational claims ready' : 'Aggregate claims blocked'}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Stored cohort" value={number(readiness.cohortDomainCount)} note={`${number(readiness.scheduledDomainCount)} scheduled`} />
        <Card label="Comparable businesses" value={number(readiness.completedDomainCount)} note="50 required before aggregate claims" tone={readiness.completedDomainCount >= 50 ? 'good' : 'warn'} />
        <Card label="Eligible windows" value={number(readiness.eligibleWindowCount)} note={`${number(readiness.ineligibleWindowCount)} gated`} />
        <Card label="Protocol variants" value={number(readiness.protocolVariantCount)} note="Exactly one required" tone={readiness.protocolVariantCount === 1 ? 'good' : 'warn'} />
      </div>
      <p className="text-sm text-on-surface-variant">{readiness.assessment.safeLanguage}</p>
      {readiness.assessment.blockers.length ? (
        <ul className="grid gap-2 text-sm text-on-surface-variant sm:grid-cols-2">
          {readiness.assessment.blockers.map((blocker) => (
            <li key={blocker} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              {BLOCKER_LABELS[blocker] ?? blocker}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-on-surface-variant">Causal claims remain blocked. Verified before/after observations may support hypotheses, not promises that a change caused an outcome.</p>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-outline-variant/30 p-8 text-center text-sm text-on-surface-variant">{children}</div>;
}

function Table({ headers, children }: { headers: readonly string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-container-low">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-outline-variant/20 text-xs uppercase tracking-wide text-on-surface-variant">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/15">{children}</tbody>
      </table>
    </div>
  );
}
const Cell = ({ children }: { children: React.ReactNode }) => <td className="px-4 py-3 align-top text-on-surface">{children}</td>;

export function IntelligenceDomainsView({ rows }: { rows: readonly IntelligenceDomainRow[] }) {
  if (!rows.length) return <Empty>No eligible domain timeline rows yet.</Empty>;
  return (
    <Table headers={['Domain', 'Observed', 'Model / mode', 'Coverage', 'Citation rate', 'Compatibility']}>
      {rows.map((row, index) => (
        <tr key={`${row.canonical_domain_id}:${row.observed_at}:${index}`}>
          <Cell><span className="font-mono text-xs">{short(row.canonical_domain_id, 18)}</span></Cell>
          <Cell>{row.observed_at ? new Date(row.observed_at).toLocaleString() : '—'}<div className="text-xs text-on-surface-variant">{number(row.freshness_hours, 1)}h old</div></Cell>
          <Cell>{row.model_id ?? '—'}<div className="text-xs text-on-surface-variant">{row.run_mode ?? '—'}</div></Cell>
          <Cell>{percent(row.coverage)}</Cell>
          <Cell>{percent(row.citation_rate)}</Cell>
          <Cell><Badge tone={row.comparison_label === 'exact_lane_version' ? 'good' : 'warn'}>{row.comparison_label ?? 'unknown'}</Badge></Cell>
        </tr>
      ))}
    </Table>
  );
}

export function IntelligenceLanesView({ rows }: { rows: readonly IntelligenceLaneRow[] }) {
  if (!rows.length) return <Empty>No measurement lanes are indexed yet.</Empty>;
  return (
    <Table headers={['Lane', 'Provider', 'Model', 'Mode', 'Review', 'Drilldown']}>
      {rows.map((row) => (
        <tr key={row.id}>
          <Cell><span className="font-mono text-xs">{short(row.fingerprint, 28)}</span><div className="text-xs text-on-surface-variant">{row.vertical} · {row.protocol_version}</div></Cell>
          <Cell>{row.provider}</Cell>
          <Cell>{row.model_id}</Cell>
          <Cell>{row.run_mode}</Cell>
          <Cell><Badge tone={row.review_state === 'verified' ? 'good' : 'warn'}>{row.review_state}</Badge></Cell>
          <Cell><Link className="text-xs font-semibold text-primary hover:underline" href={`/admin/intelligence/windows?lane=${encodeURIComponent(row.id)}`}>View windows →</Link></Cell>
        </tr>
      ))}
    </Table>
  );
}

export function IntelligenceWindowsView({ rows, runs }: {
  rows: readonly IntelligenceWindowRow[];
  runs: readonly IntelligenceRunRow[];
}) {
  return (
    <div className="space-y-6">
      {rows.length ? (
        <Table headers={['Window', 'Eligible', 'Coverage', 'Sample', 'Anomalies / missing', 'Drilldown']}>
          {rows.map((row) => (
            <tr key={`${row.source_kind}:${row.source_id}`}>
              <Cell><span className="font-mono text-xs">{short(row.source_id, 30)}</span><div className="text-xs text-on-surface-variant">{row.source_kind}</div></Cell>
              <Cell><Badge tone={row.eligible ? 'good' : 'bad'}>{row.eligible ? 'Eligible' : 'Gated'}</Badge></Cell>
              <Cell>{percent(row.coverage)}</Cell>
              <Cell>{number(row.sample_size)}</Cell>
              <Cell>{row.anomaly_codes.length ? row.anomaly_codes.join(', ') : row.missing_cells.length ? `${row.missing_cells.length} missing cells` : 'None'}</Cell>
              <Cell>
                {row.window_id || row.lane_id ? (
                  <Link className="text-xs font-semibold text-primary hover:underline" href={`/admin/intelligence/windows?lane=${encodeURIComponent(row.lane_id ?? '')}&window=${encodeURIComponent(row.window_id ?? '')}`}>View runs →</Link>
                ) : <span className="text-xs text-on-surface-variant">Synthetic window</span>}
              </Cell>
            </tr>
          ))}
        </Table>
      ) : <Empty>No windows match this lane.</Empty>}
      {runs.length ? (
        <section className="space-y-3">
          <h2 className="font-headline text-lg font-semibold text-on-surface">Runs in selected window</h2>
          <Table headers={['Source run', 'Status', 'Provider / model', 'Mode', 'Observed', 'Evidence']}>
            {runs.map((run) => (
              <tr key={run.id}>
                <Cell><span className="font-mono text-xs">{run.source_kind}:{short(run.source_id, 18)}</span></Cell>
                <Cell><Badge tone={qualityTone(run.quality_state)}>{run.quality_state}</Badge><div className="text-xs text-on-surface-variant">source: {run.source_status ?? 'unknown'}</div></Cell>
                <Cell>{run.provider ?? '—'}<div className="text-xs text-on-surface-variant">{run.model_id ?? '—'}</div></Cell>
                <Cell>{run.run_mode ?? '—'}</Cell>
                <Cell>{run.observed_at ? new Date(run.observed_at).toLocaleString() : '—'}</Cell>
                <Cell><Link className="text-xs font-semibold text-primary hover:underline" href={`/admin/intelligence/evidence?sourceKind=${encodeURIComponent(run.source_kind)}&sourceId=${encodeURIComponent(run.source_id)}`}>Trace evidence →</Link></Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}

export function IntelligenceEvidenceView({ rows }: { rows: readonly IntelligenceEvidenceRow[] }) {
  if (!rows.length) return <Empty>No evidence metadata matches this source. Raw content is never used as a fallback.</Empty>;
  return (
    <Table headers={['Evidence', 'Class', 'Source', 'Status', 'Privacy', 'Provenance version']}>
      {rows.map((row) => (
        <tr key={row.stable_evidence_id}>
          <Cell><span className="font-mono text-xs">{short(row.stable_evidence_id, 22)}</span><div className="text-xs text-on-surface-variant">{row.evidence_kind}</div></Cell>
          <Cell>{row.object_class}</Cell>
          <Cell><span className="font-mono text-xs">{row.source_kind}:{short(row.source_id, 14)}</span></Cell>
          <Cell><Badge tone={row.artifact_status === 'present' ? 'good' : row.artifact_status === 'missing' ? 'bad' : 'warn'}>{row.artifact_status}</Badge></Cell>
          <Cell><Badge tone={row.privacy === 'private_tenant' ? 'warn' : 'neutral'}>{row.privacy}</Badge></Cell>
          <Cell><span className="text-xs">parser {row.parser_version ?? '—'}<br />extractor {row.extractor_version ?? '—'}</span></Cell>
        </tr>
      ))}
    </Table>
  );
}

export function IntelligenceQualityView({ classifications, alerts }: {
  classifications: readonly IntelligenceQualityRow[];
  alerts: readonly IntelligenceAlertRow[];
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-headline text-lg font-semibold text-on-surface">Open alerts</h2>
        {alerts.length ? (
          <Table headers={['Severity', 'Reason', 'Source', 'Observed', 'State']}>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <Cell><Badge tone={alert.severity === 'critical' ? 'bad' : 'warn'}>{alert.severity}</Badge></Cell>
                <Cell>{alert.reason_code}</Cell>
                <Cell><span className="font-mono text-xs">{alert.source_kind}:{short(alert.source_id, 14)}</span></Cell>
                <Cell>{new Date(alert.observed_at).toLocaleString()}</Cell>
                <Cell>{alert.resolved_at ? 'Resolved' : 'Open'}</Cell>
              </tr>
            ))}
          </Table>
        ) : <Empty>No open quality alerts.</Empty>}
      </section>
      <section className="space-y-3">
        <h2 className="font-headline text-lg font-semibold text-on-surface">Latest classifications</h2>
        {classifications.length ? (
          <Table headers={['Derived state', 'Original status', 'Source', 'Reasons', 'Age', 'Evidence']}>
            {classifications.map((row) => (
              <tr key={row.stable_classification_id}>
                <Cell><Badge tone={qualityTone(row.quality_state)}>{row.quality_state}</Badge></Cell>
                <Cell>{row.original_status ?? '—'}</Cell>
                <Cell><span className="font-mono text-xs">{row.source_kind}:{short(row.source_id, 14)}</span></Cell>
                <Cell>{row.reason_codes.join(', ') || '—'}</Cell>
                <Cell>{row.age_hours === null ? '—' : `${number(row.age_hours, 1)}h`}</Cell>
                <Cell><Link className="text-xs font-semibold text-primary hover:underline" href={`/admin/intelligence/evidence?sourceKind=${encodeURIComponent(row.source_kind)}&sourceId=${encodeURIComponent(row.source_id)}`}>Trace →</Link></Cell>
              </tr>
            ))}
          </Table>
        ) : <Empty>No quality classifications have been applied yet.</Empty>}
      </section>
    </div>
  );
}

export function IntelligencePatternsView({ rows }: { rows: readonly IntelligencePatternRow[] }) {
  if (!rows.length) return <Empty>No compatible intervention follow-up exists yet. The source currently has no startup recommendations.</Empty>;
  return (
    <Table headers={['Recommendation', 'Domain', 'Availability', 'Delta', 'Elapsed', 'Sample / compatibility']}>
      {rows.map((row) => (
        <tr key={row.recommendation_id}>
          <Cell><span className="font-mono text-xs">{short(row.recommendation_id, 18)}</span></Cell>
          <Cell><span className="font-mono text-xs">{short(row.canonical_domain_id, 18)}</span></Cell>
          <Cell><Badge tone={qualityTone(row.metric_status)}>{row.metric_status}</Badge></Cell>
          <Cell>{row.citation_rate_delta === null ? 'Not available' : `${(row.citation_rate_delta * 100).toFixed(1)} pp`}</Cell>
          <Cell>{row.elapsed_hours === null ? 'Not available' : `${number(row.elapsed_hours, 1)}h`}</Cell>
          <Cell>{number(row.sample_size)} · {row.comparison_label}<div className="text-xs text-on-surface-variant">{row.causality_label.replaceAll('_', ' ')}</div></Cell>
        </tr>
      ))}
    </Table>
  );
}

function OperatorGlossary() {
  return (
    <aside className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 text-sm">
      <h2 className="font-headline text-lg font-semibold text-on-surface">Operator glossary</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt className="font-semibold text-on-surface">Lane</dt><dd className="text-on-surface-variant">A versioned provider, model, run-mode, prompt, parser, and metric protocol.</dd></div>
        <div><dt className="font-semibold text-on-surface">Eligible window</dt><dd className="text-on-surface-variant">Complete compatible cells with no unresolved anomaly or quarantine.</dd></div>
        <div><dt className="font-semibold text-on-surface">Not available</dt><dd className="text-on-surface-variant">Missing or insufficient compatible evidence—not a numeric zero.</dd></div>
        <div><dt className="font-semibold text-on-surface">Intervention delta</dt><dd className="text-on-surface-variant">An observational before/after association, never proof of causation.</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
        <Link className="text-primary hover:underline" href="/methodology/ai-search-readiness-audit">Audit methodology</Link>
        <Link className="text-primary hover:underline" href="/admin/intelligence/quality">Quality policy</Link>
        <Link className="text-primary hover:underline" href="/admin/intelligence/evidence">Evidence lineage</Link>
      </div>
    </aside>
  );
}
