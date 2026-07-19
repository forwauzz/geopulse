import { notFound } from 'next/navigation';
import { getPaymentApiEnv } from '@/lib/server/cf-env';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { loadSelfImprovementSettings } from '@/lib/server/self-improvement';
import { loadAutomationSetting, configInt } from '@/lib/server/automation-settings';
import { resolveDiscoveryMode } from '@/lib/server/competitor-discovery';
import {
  setSelfImprovementFlag,
  setSelfImprovementRecipient,
  setMarketingFlag,
  setMarketingCap,
  runSelfImprovementNow,
  runMarketingNow,
} from './actions';

export const dynamic = 'force-dynamic';

function fmt(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// A server-action toggle: one submit button that flips the current boolean.
function Toggle({ action, field, current, onLabel = 'On', offLabel = 'Off' }: {
  action: (fd: FormData) => Promise<void>;
  field: string;
  current: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={current ? 'false' : 'true'} />
      <button
        type="submit"
        className={`inline-flex min-h-[32px] items-center gap-2 rounded-full px-3 text-xs font-semibold transition ${
          current ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${current ? 'bg-primary' : 'bg-outline-variant'}`} />
        {current ? onLabel : offLabel}
      </button>
    </form>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
      ok ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    }`}>
      <span className="material-symbols-outlined text-[13px]" aria-hidden>{ok ? 'check_circle' : 'error'}</span>
      {label}
    </span>
  );
}

export default async function AutomationConsolePage() {
  const env = await getPaymentApiEnv();
  if (env.AUTOMATION_CONSOLE_ENABLED?.trim().toLowerCase() !== 'true') notFound();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return <p className="text-error">Server misconfigured: missing Supabase service role.</p>;
  }
  const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const [self, marketing, runsRes, proposalsRes, channelsRes] = await Promise.all([
    loadSelfImprovementSettings(supabase),
    loadAutomationSetting(supabase, 'marketing_autopilot'),
    supabase.from('self_improvement_runs').select('id, created_at, trigger_source, status, score, letter_grade, emailed_to').order('created_at', { ascending: false }).limit(8),
    supabase.from('content_items').select('slug, title, status, created_at').eq('metadata->>proposed_by', 'marketing_autopilot').order('created_at', { ascending: false }).limit(8),
    supabase.from('distribution_accounts').select('id').eq('status', 'connected').limit(1),
  ]);

  const runs = (runsRes.data ?? []) as Array<{ id: string; created_at: string; trigger_source: string; status: string; score: number | null; letter_grade: string | null; emailed_to: string | null }>;
  const proposals = (proposalsRes.data ?? []) as Array<{ slug: string; title: string; status: string; created_at: string }>;
  const channelConnected = Array.isArray(channelsRes.data) && channelsRes.data.length > 0;

  const discoveryMode = resolveDiscoveryMode(env);
  const geminiKey = Boolean(env.GEMINI_API_KEY?.trim());
  const marketingCap = configInt(marketing.config, 'daily_cap', 2);
  const card = 'rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6';
  const kicker = 'font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant';

  return (
    <div className="space-y-6">
      <header>
        <p className={kicker}>Admin · Loop 5</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Automation</h1>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Admin-only autonomy toggles. All off by default; each kill switch overrides everything.
        </p>
      </header>

      {/* Self-improvement */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-sans text-lg font-bold text-on-background">Self-improvement loop</h2>
            <p className="mt-0.5 font-sans text-xs text-on-surface-variant">Daily self-audit of getgeopulse.com → emails the improvement plan.</p>
          </div>
          <form action={runSelfImprovementNow}>
            <button type="submit" className="inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:bg-primary-dim">Run now</button>
          </form>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3"><dt className="font-sans text-sm text-on-surface-variant">Enabled</dt><dd><Toggle action={setSelfImprovementFlag} field="enabled" current={self.enabled} /></dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="font-sans text-sm text-on-surface-variant">Kill switch</dt><dd><Toggle action={setSelfImprovementFlag} field="kill_switch" current={self.killSwitch} onLabel="Killed" offLabel="Live" /></dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="font-sans text-sm text-on-surface-variant">Autonomous ship</dt><dd><Toggle action={setSelfImprovementFlag} field="autonomous_ship_enabled" current={self.autonomousShipEnabled} /></dd></div>
        </dl>
        <form action={setSelfImprovementRecipient} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className={kicker} htmlFor="si-recipient">Report recipient</label>
          <input id="si-recipient" name="recipient" type="email" defaultValue={self.reportRecipient ?? ''} placeholder="admin@example.com"
            className="min-h-[38px] flex-1 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30" />
          <button type="submit" className="inline-flex min-h-[38px] items-center rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-background transition hover:bg-surface-container-high">Save</button>
        </form>
        {runs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead><tr className="text-left"><th className={`${kicker} p-2`}>When</th><th className={`${kicker} p-2`}>Source</th><th className={`${kicker} p-2`}>Status</th><th className={`${kicker} p-2`}>Score</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-outline-variant/20">
                    <td className="p-2 text-on-surface-variant">{fmt(r.created_at)}</td>
                    <td className="p-2 text-on-surface-variant">{r.trigger_source}</td>
                    <td className="p-2 text-on-background">{r.status}</td>
                    <td className="p-2 tabular-nums text-on-background">{r.score ?? '—'}{r.letter_grade ? ` (${r.letter_grade})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-4 font-sans text-xs text-on-surface-variant">No runs yet.</p>}
      </section>

      {/* Marketing autopilot */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-sans text-lg font-bold text-on-background">Marketing autopilot</h2>
            <p className="mt-0.5 font-sans text-xs text-on-surface-variant">Proposes review-gated content briefs for weak topics. Never auto-publishes.</p>
          </div>
          <form action={runMarketingNow}>
            <button type="submit" className="inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary transition hover:bg-primary-dim">Run now</button>
          </form>
        </div>
        <div className="mt-3"><StatusChip ok={channelConnected} label={channelConnected ? 'Channel connected — can post' : 'No channel connected — briefs only (connect X/LinkedIn/Ghost)'} /></div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3"><dt className="font-sans text-sm text-on-surface-variant">Enabled</dt><dd><Toggle action={setMarketingFlag} field="enabled" current={marketing.enabled} /></dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="font-sans text-sm text-on-surface-variant">Kill switch</dt><dd><Toggle action={setMarketingFlag} field="kill_switch" current={marketing.killSwitch} onLabel="Killed" offLabel="Live" /></dd></div>
        </dl>
        <form action={setMarketingCap} className="mt-4 flex items-center gap-2">
          <label className={kicker} htmlFor="mkt-cap">Daily cap</label>
          <input id="mkt-cap" name="cap" type="number" min={1} max={10} defaultValue={marketingCap}
            className="min-h-[38px] w-20 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30" />
          <button type="submit" className="inline-flex min-h-[38px] items-center rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-background transition hover:bg-surface-container-high">Save</button>
        </form>
        {proposals.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {proposals.map((p) => (
              <li key={p.slug} className="flex items-center justify-between gap-2 border-t border-outline-variant/20 py-1.5 text-sm">
                <span className="truncate text-on-background">{p.title}</span>
                <span className="shrink-0 text-on-surface-variant">{p.status} · {fmt(p.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 font-sans text-xs text-on-surface-variant">No proposals yet.</p>}
      </section>

      {/* Competitor discovery (read-only, env-driven) */}
      <section className={card}>
        <h2 className="font-sans text-lg font-bold text-on-background">Competitor discovery</h2>
        <p className="mt-0.5 font-sans text-xs text-on-surface-variant">Local competitor auto-discovery mode on the results scorecard.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${discoveryMode === 'gemini' ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
            Mode: {discoveryMode === 'gemini' ? 'Live (Google-Search grounding)' : 'Mock (samples)'}
          </span>
          <StatusChip ok={geminiKey} label={geminiKey ? 'Gemini key present' : 'No Gemini key'} />
        </div>
        <p className="mt-3 font-sans text-xs text-on-surface-variant">
          Set <code className="rounded bg-surface-container px-1">COMPETITOR_DISCOVERY_MODE=live</code> in wrangler.jsonc + redeploy to go live. Live grounded search needs Gemini billing enabled.
        </p>
      </section>
    </div>
  );
}
