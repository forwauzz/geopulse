import { getCloudflareContext } from '@opennextjs/cloudflare';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { loadAgentStatuses } from '@/lib/server/agent-console';
import { loadAutomationSetting } from '@/lib/server/automation-settings';
import {
  loadRevenueAgencySnapshot,
  resolveRevenueAgencyConfig,
} from '@/lib/server/revenue-agency-agent';
import { judgeGrowthLoop } from '@/lib/server/growth-judge';
import { resolveSocialProofAgentConfig } from '@/lib/server/social-proof-agent';
import {
  runRevenueAgencyNow,
  runSocialProofNow,
  saveRevenueAgency,
  saveSocialProofAgent,
  setAgentFlag,
} from './actions';

export const dynamic = 'force-dynamic';

function AudienceBadge({ audience }: { audience: 'internal' | 'client' }) {
  return audience === 'internal' ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">
      <span className="material-symbols-outlined text-[13px]" aria-hidden>badge</span>
      Internal
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-widest text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">
      <span className="material-symbols-outlined text-[13px]" aria-hidden>storefront</span>
      Client-facing
    </span>
  );
}

function StateDot({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      enabled ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-surface-container text-on-surface-variant'
    }`}>
      <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-outline-variant'}`} />
      {enabled ? 'On' : 'Off'}
    </span>
  );
}

function Checkbox({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-3">
      <input
        className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary"
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
      />
      <span>
        <span className="block font-sans text-sm font-semibold text-on-background">{label}</span>
        {description && (
          <span className="mt-0.5 block font-sans text-xs leading-5 text-on-surface-variant">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export default async function AdminAgentsPage() {
  const ctx = await loadAdminPageContext('/admin/agents');
  if (!ctx.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{ctx.message}</p>
      </main>
    );
  }

  let env: Record<string, string | undefined> = {};
  try {
    const { env: rawEnv } = await getCloudflareContext({ async: true });
    env = rawEnv as unknown as Record<string, string | undefined>;
  } catch {
    env = process.env as unknown as Record<string, string | undefined>;
  }

  const [agents, socialSetting, revenueSetting, revenueSnapshot] = await Promise.all([
    loadAgentStatuses(ctx.adminDb, env),
    loadAutomationSetting(ctx.adminDb, 'social_proof_agent'),
    loadAutomationSetting(ctx.adminDb, 'revenue_agency'),
    loadRevenueAgencySnapshot(ctx.adminDb),
  ]);
  const social = resolveSocialProofAgentConfig(
    socialSetting.config,
    socialSetting.enabled,
    socialSetting.killSwitch
  );
  const revenue = resolveRevenueAgencyConfig(
    revenueSetting.config,
    revenueSetting.enabled,
    revenueSetting.killSwitch
  );
  const growthJudge = judgeGrowthLoop(revenueSnapshot);
  const internal = agents.filter(
    (agent) =>
      agent.audience === 'internal' &&
      agent.key !== 'social_proof' &&
      agent.key !== 'revenue_agency'
  );
  const client = agents.filter((agent) => agent.audience === 'client');
  const inputClass =
    'rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 font-sans text-sm text-on-background outline-none focus:border-primary';

  const renderAgent = (agent: (typeof agents)[number]) => (
    <div key={agent.key} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-sans text-sm font-bold text-on-background">{agent.name}</p>
        <AudienceBadge audience={agent.audience} />
        <span className="ml-auto"><StateDot enabled={agent.enabled} /></span>
      </div>
      <p className="mt-1 font-sans text-sm leading-6 text-on-surface-variant">{agent.description}</p>
      {agent.blockers.length > 0 && (
        <ul className="mt-2 space-y-1">
          {agent.blockers.map((blocker) => (
            <li key={blocker} className="flex items-start gap-1.5 font-sans text-xs text-amber-700 dark:text-amber-300">
              <span className="material-symbols-outlined mt-0.5 text-[13px]" aria-hidden>warning</span>
              {blocker}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {agent.control === 'flag' && agent.flagFeature ? (
          <>
            <form action={setAgentFlag}>
              <input type="hidden" name="feature" value={agent.flagFeature} />
              <input type="hidden" name="field" value="enabled" />
              <input type="hidden" name="value" value={agent.enabled ? 'false' : 'true'} />
              <button type="submit" className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-on-primary">
                Turn {agent.enabled ? 'off' : 'on'}
              </button>
            </form>
            <form action={setAgentFlag}>
              <input type="hidden" name="feature" value={agent.flagFeature} />
              <input type="hidden" name="field" value="kill_switch" />
              <input type="hidden" name="value" value={agent.killSwitch ? 'false' : 'true'} />
              <button type="submit" className="rounded-lg border border-outline-variant/30 px-3 py-1 text-xs font-semibold text-on-background">
                {agent.killSwitch ? 'Release kill switch' : 'Kill switch'}
              </button>
            </form>
          </>
        ) : (
          <span className="font-sans text-xs text-on-surface-variant">
            {agent.control === 'env'
              ? 'Switched via deployment configuration.'
              : agent.control === 'grants'
                ? 'Client-controlled; admin manages access per user.'
                : 'Managed in its own console.'}
          </span>
        )}
        {agent.manageHint && <span className="font-sans text-xs text-on-surface-variant/80">{agent.manageHint}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Admin</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Agents</h1>
        <p className="mt-1 max-w-2xl font-sans text-sm text-on-surface-variant">
          One simple place to control the growth loop. Nothing publishes unless its selected mode and safety gates allow it.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans text-lg font-bold text-on-background">Revenue Agency</h2>
              <StateDot enabled={revenue.mode !== 'off'} />
            </div>
            <p className="mt-1 font-sans text-sm text-on-surface-variant">
              Acquire → diagnose → prove → convert → retain.
            </p>
          </div>
          <form action={runRevenueAgencyNow}>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 font-sans text-sm font-bold text-on-primary">
              Run now
            </button>
          </form>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-5">
          {revenueSnapshot.stages.map((stage) => (
            <div
              key={stage.key}
              className={`rounded-xl border p-3 ${
                revenueSnapshot.focus === stage.key
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/20 bg-surface-container-low'
              }`}
            >
              <p className="font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">
                {stage.label}
              </p>
              <p className="mt-1 font-sans text-2xl font-black text-on-background">{stage.value}</p>
              <p className="mt-1 font-sans text-[0.7rem] leading-4 text-on-surface-variant">{stage.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-surface-container-low px-3 py-2 font-sans text-xs text-on-surface-variant">
          <strong className="text-on-background">Current focus: {revenueSnapshot.focus}.</strong>{' '}
          {growthJudge.recommendation}
        </p>

        <form action={saveRevenueAgency} className="mt-5 flex flex-wrap items-end gap-3 border-t border-outline-variant/20 pt-5">
          <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
            Mode
            <select name="mode" defaultValue={revenue.mode} className={inputClass}>
              <option value="off">Off</option>
              <option value="observe">Observe only</option>
              <option value="assist">Assist</option>
              <option value="autonomous">Autonomous</option>
            </select>
          </label>
          <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
            Daily run hour (UTC)
            <input name="runHourUtc" type="number" min="0" max="23" defaultValue={revenue.runHourUtc} className={`${inputClass} w-32`} />
          </label>
          <label className="flex items-center gap-2 pb-2 font-sans text-sm text-on-background">
            <input type="checkbox" name="socialProofEnabled" defaultChecked={revenue.socialProofEnabled} />
            Replenish proof queue
          </label>
          <label className="flex items-center gap-2 pb-2 font-sans text-sm text-on-background">
            <input type="checkbox" name="nurtureEnabled" defaultChecked={revenue.nurtureEnabled} />
            Nurture opted-in leads
          </label>
          <label className="flex items-center gap-2 pb-2 font-sans text-sm text-on-background">
            <input type="checkbox" name="prospectingEnabled" defaultChecked={revenue.prospectingEnabled} />
            Find qualified agencies
          </label>
          <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
            New contacts/day
            <input name="prospectingDailyCap" type="number" min="1" max="10" defaultValue={revenue.prospectingDailyCap} className={`${inputClass} w-28`} />
          </label>
          <label className="grid min-w-64 flex-1 gap-1 font-sans text-xs font-semibold text-on-surface-variant">
            Markets (comma-separated)
            <input name="prospectingMarkets" defaultValue={revenue.prospectingMarkets.join(', ')} className={inputClass} />
          </label>
          <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
            Daily email cap
            <input name="nurtureDailyCap" type="number" min="1" max="20" defaultValue={revenue.nurtureDailyCap} className={`${inputClass} w-28`} />
          </label>
          <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
            Wait hours
            <input name="nurtureDelayHours" type="number" min="1" max="168" defaultValue={revenue.nurtureDelayHours} className={`${inputClass} w-28`} />
          </label>
          <button type="submit" className="rounded-xl border border-outline-variant/30 px-4 py-2 font-sans text-sm font-bold text-on-background">
            Save
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans text-lg font-bold text-on-background">Social distribution + proof</h2>
              <StateDot enabled={social.mode !== 'off'} />
            </div>
            <p className="mt-1 max-w-2xl font-sans text-sm text-on-surface-variant">
              Turns verified GEO-Pulse evidence and published insights into safe, tracked social assets.
            </p>
          </div>
          <form action={runSocialProofNow}>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 font-sans text-sm font-bold text-on-primary">
              Create proof now
            </button>
          </form>
        </div>

        <form action={saveSocialProofAgent} className="mt-5">
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
              Mode
              <select name="mode" defaultValue={social.mode} className={inputClass}>
                <option value="off">Off</option>
                <option value="draft">Draft only</option>
                <option value="approval">Require approval</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </label>
            <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
              Posts per day
              <input name="dailyCap" type="number" min="1" max="5" defaultValue={social.dailyCap} className={`${inputClass} w-28`} />
            </label>
            <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
              Morning
              <input name="morningHourLocal" type="number" min="0" max="23" defaultValue={social.morningHourLocal} className={`${inputClass} w-24`} />
            </label>
            <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
              Evening
              <input name="eveningHourLocal" type="number" min="0" max="23" defaultValue={social.eveningHourLocal} className={`${inputClass} w-24`} />
            </label>
            <input type="hidden" name="timezone" value={social.timezone} />
            <label className="grid gap-1 font-sans text-xs font-semibold text-on-surface-variant">
              Minimum aggregate sample
              <input name="minAggregateSampleSize" type="number" min="5" max="500" defaultValue={social.minAggregateSampleSize} className={`${inputClass} w-40`} />
            </label>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <Checkbox name="educationalEnabled" label="Published article insights" defaultChecked={social.educationalEnabled} />
            <Checkbox name="industryHumorEnabled" label="Agency humor + industry memes" description="Light, useful posts for agency owners and SEO consultants; no unsupported claims." defaultChecked={social.industryHumorEnabled} />
            <Checkbox name="aggregateDataEnabled" label="Anonymous aggregate data" description="Directional product usage, never presented as an industry benchmark." defaultChecked={social.aggregateDataEnabled} />
            <Checkbox name="beforeAfterEnabled" label="Before-and-after proof" description="Own-site evidence by default; no ranking or traffic guarantees." defaultChecked={social.beforeAfterEnabled} />
            <Checkbox name="auditScreenshotsEnabled" label="Audit report screenshots" description="Only redacted or consented media can pass review." defaultChecked={social.auditScreenshotsEnabled} />
            <Checkbox name="clientProofEnabled" label="Client proof" description="Still requires an explicit consent record and claim-safe evidence." defaultChecked={social.clientProofEnabled} />
            <Checkbox name="carouselEnabled" label="Carousels" defaultChecked={social.carouselEnabled} />
            <Checkbox name="reelsEnabled" label="Reels" description="Publishing requires 9:16 media plus a recorded Meta preview approval." defaultChecked={social.reelsEnabled} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" className="rounded-xl border border-outline-variant/30 px-4 py-2 font-sans text-sm font-bold text-on-background">
              Save
            </button>
            <p className="font-sans text-xs text-on-surface-variant">
              Approval and consent gates stay active even in autonomous mode.
            </p>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Specialist agents</h2>
        <div className="mt-3 space-y-3">{internal.map(renderAgent)}</div>
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Client-facing agents</h2>
        <div className="mt-3 space-y-3">{client.map(renderAgent)}</div>
      </section>
    </div>
  );
}
