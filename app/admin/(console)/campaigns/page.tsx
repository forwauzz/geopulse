import Link from 'next/link';
import Image from 'next/image';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { loadAgentStatuses } from '@/lib/server/agent-console';
import { teamAvatar } from '@/lib/team-directory';
import {
  loadCampaignControlRoom,
  type CampaignHealth,
  type CampaignLane,
} from '@/lib/server/campaign-control-room';
import { loadProviderSpendSummary } from '@/lib/server/provider-spend-control';

export const dynamic = 'force-dynamic';

const TABS: Array<{ key: 'overview' | CampaignLane; label: string; icon: string }> = [
  { key: 'overview', label: 'Command center', icon: 'space_dashboard' },
  { key: 'social', label: 'Social media', icon: 'share' },
  { key: 'email', label: 'Email & newsletters', icon: 'mail' },
  { key: 'prospecting', label: 'Prospecting', icon: 'person_search' },
  { key: 'competitors', label: 'Competitors', icon: 'compare_arrows' },
  { key: 'benchmarks', label: 'Benchmarks', icon: 'monitoring' },
];

const LANE_META: Record<CampaignLane, { label: string; href: string; action: string }> = {
  social: { label: 'Social media', href: '/dashboard/distribution', action: 'Open publishing tools' },
  email: { label: 'Email & newsletters', href: '/dashboard/content', action: 'Open content pipeline' },
  prospecting: { label: 'Prospecting & outreach', href: '/admin/outreach', action: 'Open outreach tools' },
  competitors: { label: 'Competitor campaigns', href: '/admin/competitors', action: 'Open competitor tools' },
  benchmarks: { label: 'Benchmarks & client monitoring', href: '/dashboard/benchmarks', action: 'Open benchmark tools' },
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Toronto',
  }).format(new Date(iso));
}

function HealthBadge({ health }: { readonly health: CampaignHealth }) {
  const style = health === 'healthy'
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : health === 'attention'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : 'bg-red-500/15 text-red-700 dark:text-red-300';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {health === 'healthy' ? 'On track' : health === 'attention' ? 'Needs attention' : 'Blocked'}
    </span>
  );
}

function LoopStateBadge({ state }: { readonly state: string }) {
  const style = state === 'completed'
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : state === 'blocked'
      ? 'bg-red-500/15 text-red-700 dark:text-red-300'
      : state === 'verifying'
        ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${style}`}>{state.replaceAll('_', ' ')}</span>;
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  readonly searchParams?: Promise<{ tab?: string; loop?: string }>;
}) {
  const ctx = await loadAdminPageContext('/admin/campaigns');
  if (!ctx.ok) return <p className="text-error">{ctx.message}</p>;

  let env: Record<string, string | undefined> = {};
  try {
    const { env: rawEnv } = await getCloudflareContext({ async: true });
    env = rawEnv as unknown as Record<string, string | undefined>;
  } catch {
    env = process.env as unknown as Record<string, string | undefined>;
  }

  const agents = await loadAgentStatuses(ctx.adminDb, env);
  const [room, openLoopResult, completedLoopResult, providerSpend] = await Promise.all([
    loadCampaignControlRoom({ supabase: ctx.adminDb, agents }),
    ctx.adminDb
      .from('agent_work_loops')
      .select('id,source_type,source_key,parent_loop_id,lane,owner,state,severity,title,detail,next_action,due_at,attempt_count,founder_required,blocker,evidence,metadata,resolved_at,updated_at')
      .in('state', ['discovered', 'assigned', 'executing', 'verifying', 'blocked'])
      .order('due_at', { ascending: true })
      .limit(500),
    ctx.adminDb
      .from('agent_work_loops')
      .select('id,source_type,source_key,parent_loop_id,lane,owner,state,severity,title,detail,next_action,due_at,attempt_count,founder_required,blocker,evidence,metadata,resolved_at,updated_at')
      .eq('state', 'completed')
      .order('resolved_at', { ascending: false })
      .limit(50),
    loadProviderSpendSummary(ctx.adminDb),
  ]);
  const loops = [...(openLoopResult.data ?? []), ...(completedLoopResult.data ?? [])];
  const loopsById = new Map(loops.map((loop: any) => [String(loop.id), loop]));
  const loopCounts = {
    backlog: loops.filter((loop: any) => loop.state === 'discovered').length,
    action: loops.filter((loop: any) => loop.state === 'assigned').length,
    running: loops.filter((loop: any) => loop.state === 'executing').length,
    verifying: loops.filter((loop: any) => loop.state === 'verifying').length,
    blocked: loops.filter((loop: any) => loop.state === 'blocked' || loop.founder_required).length,
    completed: loops.filter((loop: any) => loop.state === 'completed').length,
  };
  const params = await searchParams;
  const requested = params?.tab ?? 'overview';
  const requestedLoop = params?.loop ?? 'all';
  const loopView = ['all', 'backlog', 'action', 'running', 'verifying', 'blocked', 'completed'].includes(requestedLoop)
    ? requestedLoop
    : 'all';
  const visibleLoops = loops.filter((loop: any) => {
    if (loopView === 'all') return true;
    if (loopView === 'backlog') return loop.state === 'discovered';
    if (loopView === 'action') return loop.state === 'assigned';
    if (loopView === 'running') return loop.state === 'executing';
    if (loopView === 'verifying') return loop.state === 'verifying';
    if (loopView === 'blocked') return loop.state === 'blocked' || loop.founder_required;
    return loop.state === 'completed';
  });
  const activeTab = TABS.some((tab) => tab.key === requested) ? requested as 'overview' | CampaignLane : 'overview';
  const visible = activeTab === 'overview'
    ? room.campaigns
    : room.campaigns.filter((campaign) => campaign.lane === activeTab);
  const activeMeta = activeTab === 'overview' ? null : LANE_META[activeTab];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-on-background p-6 text-background shadow-float md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-fixed">Executive control room</p>
            <h1 className="mt-3 font-headline text-3xl font-black md:text-4xl">Campaigns</h1>
            <p className="mt-3 text-sm leading-6 text-background/70">
              One view of every revenue-producing workflow. Maya assigns exceptions to the right owner; the existing campaign tools remain the source of truth.
            </p>
          </div>
          <div className="rounded-2xl bg-background/10 px-5 py-4 text-right">
            <p className="text-xs uppercase tracking-widest text-background/60">Company campaign health</p>
            <div className="mt-2"><HealthBadge health={room.health} /></div>
            <p className="mt-2 text-xs text-background/60">Updated {fmt(room.generatedAt)}</p>
          </div>
        </div>
        <p className="mt-6 rounded-2xl bg-background/10 px-4 py-3 text-sm text-background/80">{room.summary}</p>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === 'overview' ? '/admin/campaigns' : `/admin/campaigns?tab=${tab.key}`}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              activeTab === tab.key ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {(Object.entries(LANE_META) as Array<[CampaignLane, (typeof LANE_META)[CampaignLane]]>).map(([lane, meta]) => {
              const count = room.laneCounts[lane];
              return (
                <Link key={lane} href={`/admin/campaigns?tab=${lane}`} className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-float transition hover:bg-surface-container-low">
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{meta.label}</p>
                  <p className="mt-3 text-3xl font-black text-on-background">{count.total}</p>
                  <p className={`mt-2 text-xs ${count.blocked > 0 ? 'text-error' : count.attention > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-primary'}`}>
                    {count.blocked > 0 ? `${count.blocked} blocked` : count.attention > 0 ? `${count.attention} need attention` : 'All on track'}
                  </p>
                </Link>
              );
            })}
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float md:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Hard spend limits</p>
              <h2 className="mt-2 font-headline text-xl font-bold text-on-background">Provider budgets</h2>
              <p className="mt-1 text-sm text-on-surface-variant">New paid API work stops at these monthly application caps unless you set a time-limited founder override.</p>
            </div>
            {providerSpend.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {providerSpend.map((row) => (
                  <article key={row.provider} className="rounded-xl bg-surface-container-low p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold capitalize text-on-background">{row.provider}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                        row.status === 'blocked'
                          ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                          : row.status === 'attention'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}>{row.status}</span>
                    </div>
                    <p className="mt-3 text-2xl font-black text-on-background">${row.spentUsd.toFixed(2)} <span className="text-sm font-medium text-on-surface-variant">of ${row.capUsd.toFixed(2)}</span></p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${row.percentUsed}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">Spend controls activate when migration 070 is installed.</p>
            )}
          </section>

          <section id="loop-control" className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Closed-loop operations</p>
                <h2 className="mt-2 font-headline text-xl font-bold text-on-background">Loop Control</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Every Priya finding and Maya exception stays owned until evidence verifies the outcome.</p>
              </div>
              <div className="flex gap-2">
                {loopView !== 'all' ? <Link href="/admin/campaigns#loop-control" className="rounded-xl border border-outline-variant/25 px-4 py-2 text-sm font-semibold text-on-background">Show all</Link> : null}
                <Link href="/admin/automation#seo-agent" className="rounded-xl border border-outline-variant/25 px-4 py-2 text-sm font-semibold text-on-background">Open SEO evidence</Link>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ['Idea bank', loopCounts.backlog],
                ['Needs action', loopCounts.action],
                ['Running', loopCounts.running],
                ['Verifying', loopCounts.verifying],
                ['Blocked', loopCounts.blocked],
                ['Completed', loopCounts.completed],
              ].map(([label, value], index) => {
                const key = ['backlog', 'action', 'running', 'verifying', 'blocked', 'completed'][index]!;
                return (
                <Link key={String(label)} href={`/admin/campaigns?loop=${key}#loop-control`} className={`rounded-xl p-4 transition hover:bg-surface-container ${loopView === key ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-surface-container-low'}`}>
                  <p className="text-xs text-on-surface-variant">{label}</p>
                  <p className="mt-1 text-2xl font-black text-on-background">{value}</p>
                </Link>
              )})}
            </div>
            {loops.length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      <th className="py-3 pr-4">Work</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Parent</th>
                      <th className="px-4 py-3">Deadline</th>
                      <th className="px-4 py-3">Attempts</th>
                      <th className="px-4 py-3">Cost</th>
                      <th className="px-4 py-3">Proof / next action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLoops.slice(0, 30).map((loop: any) => {
                      const evidence = loop.evidence && Object.keys(loop.evidence).length > 0
                        ? Object.entries(loop.evidence).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
                        : null;
                      const parent: any = loop.parent_loop_id ? loopsById.get(String(loop.parent_loop_id)) : null;
                      const rawCost = loop.metadata?.cost_usd ?? loop.evidence?.cost_usd;
                      const cost = Number.isFinite(Number(rawCost)) ? `$${Number(rawCost).toFixed(2)}` : '—';
                      return (
                        <tr key={loop.id} className="border-t border-outline-variant/15 align-top">
                          <td className="py-4 pr-4">
                            <p className="font-semibold text-on-background">{loop.title}</p>
                            <p className="mt-1 text-xs text-on-surface-variant">{loop.lane} · {loop.detail ?? loop.source_type}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-2">
                              {teamAvatar(loop.owner) ? <Image src={teamAvatar(loop.owner)!} alt="" width={48} height={48} className="h-7 w-7 rounded-full object-cover" /> : null}
                              {loop.owner}
                            </span>
                          </td>
                          <td className="px-4 py-4"><LoopStateBadge state={loop.founder_required ? 'blocked' : loop.state} /></td>
                          <td className="max-w-52 px-4 py-4 text-xs text-on-surface-variant">
                            {parent?.title ?? (loop.parent_loop_id ? 'Parent outside current view' : '—')}
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant">{fmt(loop.due_at)}</td>
                          <td className="px-4 py-4 text-on-surface-variant">{loop.attempt_count ?? 0}</td>
                          <td className="px-4 py-4 text-on-surface-variant">{cost}</td>
                          <td className="max-w-md px-4 py-4 text-xs leading-5 text-on-surface-variant">
                            {evidence ?? loop.blocker ?? loop.next_action ?? 'Waiting for production evidence.'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">The first hourly run will backfill the active SEO and campaign work.</p>
            )}
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Image src="/team/maya-brooks.webp" alt="Maya Brooks, AI Chief of Staff" width={80} height={80} className="h-11 w-11 rounded-full object-cover shadow-sm" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Maya · AI Chief of Staff</p>
                </div>
                <h2 className="mt-2 font-headline text-xl font-bold text-on-background">The whip list</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Only exceptions appear here. Every item has an owner and a place to resolve it.</p>
              </div>
              <Link href="/admin/agents" className="rounded-xl border border-outline-variant/25 px-4 py-2 text-sm font-semibold text-on-background">Manage the team</Link>
            </div>
            {room.actions.length > 0 ? (
              <div className="mt-5 divide-y divide-outline-variant/15">
                {room.actions.slice(0, 20).map((action) => (
                  <article key={action.key} className="grid gap-3 py-4 md:grid-cols-[100px_1fr_auto] md:items-start">
                    <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      action.severity === 'now' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : action.severity === 'today' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-surface-container text-on-surface-variant'
                    }`}>{action.severity}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        {teamAvatar(action.owner) ? <Image src={teamAvatar(action.owner)!} alt="" width={48} height={48} className="h-7 w-7 rounded-full object-cover" /> : null}
                        <p className="font-semibold text-on-background">{action.owner}: {action.title}</p>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-on-surface-variant">{action.detail}</p>
                      <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                        <span className="font-bold text-on-background">
                          {action.resolution === 'approval' ? 'Approval needed' : action.resolution === 'external' ? 'External blocker' : `${action.owner} can fix`}
                        </span>
                        {' · '}{action.playbook}
                      </p>
                    </div>
                    <Link href={action.href} className="text-sm font-semibold text-primary hover:underline">Fix it</Link>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-emerald-500/10 px-4 py-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">No exceptions. Maya has nothing to escalate.</p>
            )}
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-on-background">Scheduler heartbeat</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Cloudflare runs the campaign dispatcher every hour.</p>
              </div>
              <HealthBadge health={room.cron.healthy ? 'healthy' : 'blocked'} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-surface-container-low p-4"><p className="text-xs text-on-surface-variant">Expected</p><p className="mt-1 font-semibold text-on-background">{room.cron.expectedEvery}</p></div>
              <div className="rounded-xl bg-surface-container-low p-4"><p className="text-xs text-on-surface-variant">Last heartbeat</p><p className="mt-1 font-semibold text-on-background">{fmt(room.cron.lastHeartbeatAt)}</p></div>
              <Link href="/admin/logs" className="rounded-xl bg-surface-container-low p-4"><p className="text-xs text-on-surface-variant">Evidence</p><p className="mt-1 font-semibold text-primary">Open campaign logs</p></Link>
            </div>
          </section>
        </>
      ) : null}

      <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-float">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/15 px-5 py-4 md:px-6">
          <div>
            <h2 className="font-headline text-lg font-bold text-on-background">{activeMeta?.label ?? 'All active campaigns'}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{visible.length} tracked workflow{visible.length === 1 ? '' : 's'}</p>
          </div>
          {activeMeta ? <Link href={activeMeta.href} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">{activeMeta.action}</Link> : null}
        </div>
        {visible.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  <th className="px-5 py-3 md:px-6">Campaign</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3">Next</th>
                  <th className="px-5 py-3 text-right md:px-6">Manage</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-outline-variant/15 align-top">
                    <td className="px-5 py-4 md:px-6">
                      <p className="font-semibold text-on-background">{campaign.name}</p>
                      <p className="mt-1 max-w-md text-xs leading-5 text-on-surface-variant">{campaign.channel} · {campaign.detail}</p>
                    </td>
                    <td className="px-4 py-4 text-on-background">
                      <span className="inline-flex items-center gap-2">
                        {teamAvatar(campaign.owner) ? <Image src={teamAvatar(campaign.owner)!} alt="" width={48} height={48} className="h-7 w-7 rounded-full object-cover" /> : null}
                        {campaign.owner}
                      </span>
                    </td>
                    <td className="px-4 py-4"><HealthBadge health={campaign.health} /><p className="mt-1 text-xs text-on-surface-variant">{campaign.status}</p></td>
                    <td className="px-4 py-4 text-on-surface-variant">{fmt(campaign.lastActivityAt)}</td>
                    <td className="px-4 py-4 text-on-surface-variant">{fmt(campaign.nextActivityAt)}</td>
                    <td className="px-5 py-4 text-right md:px-6"><Link href={campaign.href} className="font-semibold text-primary hover:underline">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-on-surface-variant">No campaign records in this lane yet.</p>
        )}
      </section>
    </div>
  );
}
