'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { teamAvatar } from '@/lib/team-directory';
import type {
  GrowthCalendarActivity,
  GrowthCalendarChannel,
  GrowthCalendarData,
  GrowthCalendarDisplayState,
  GrowthCalendarInboxItem,
} from '@/lib/server/growth-calendar';

const CHANNELS: Array<{ key: GrowthCalendarChannel; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'email', label: 'Email' },
  { key: 'blog', label: 'Blog' },
  { key: 'sales', label: 'Sales' },
  { key: 'experiment', label: 'Experiments' },
  { key: 'internal', label: 'Internal' },
];

const STATE_META: Record<GrowthCalendarDisplayState, { readonly label: string; readonly icon: string; readonly card: string; readonly badge: string }> = {
  live: { label: 'LIVE', icon: '✓', card: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100', badge: 'bg-emerald-600 text-white' },
  next: { label: 'NEXT', icon: '◷', card: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100', badge: 'bg-blue-600 text-white' },
  action: { label: 'NEEDS HELP', icon: '!', card: 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-100', badge: 'bg-orange-600 text-white' },
  stopped: { label: 'NOT GOING OUT', icon: '—', card: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300', badge: 'bg-slate-600 text-white' },
};

function StateBadge({ state, compact = false }: { readonly state: GrowthCalendarDisplayState; readonly compact?: boolean }) {
  const meta = STATE_META[state];
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full font-black uppercase tracking-wide ${meta.badge} ${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[10px]'}`}><span aria-hidden>{meta.icon}</span>{meta.label}</span>;
}

function channelLabel(channel: GrowthCalendarChannel): string {
  return CHANNELS.find((item) => item.key === channel)?.label ?? channel;
}

function ChannelMark({ channel, small = false }: { readonly channel: GrowthCalendarChannel; readonly small?: boolean }) {
  const size = small ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-[11px]';
  if (channel === 'instagram') {
    return (
      <span className={`${size} relative grid shrink-0 place-items-center rounded-md bg-[radial-gradient(circle_at_30%_110%,#ffd36a_0_26%,#f34278_48%,#8a3ab9_72%,#405de6_100%)] text-white`} aria-label="Instagram">
        <span className="h-[55%] w-[55%] rounded-[3px] border-[1.5px] border-white"><span className="mx-auto mt-[22%] block h-[35%] w-[35%] rounded-full border border-white" /></span>
      </span>
    );
  }
  if (channel === 'linkedin') return <span className={`${size} grid shrink-0 place-items-center rounded bg-[#0a66c2] font-black text-white`} aria-label="LinkedIn">in</span>;
  const icon = channel === 'email' ? 'mail' : channel === 'blog' ? 'article' : channel === 'sales' ? 'handshake' : channel === 'experiment' ? 'science' : 'check_circle';
  const tone = channel === 'email' ? 'bg-emerald-700' : channel === 'blog' ? 'bg-amber-700' : channel === 'sales' ? 'bg-cyan-700' : channel === 'experiment' ? 'bg-violet-700' : 'bg-slate-600';
  return <span className={`${size} material-symbols-outlined grid shrink-0 place-items-center rounded-md ${tone} text-white`} aria-label={channelLabel(channel)}>{icon}</span>;
}

function Agent({ owner, compact = false }: { readonly owner: string; readonly compact?: boolean }) {
  const avatar = teamAvatar(owner);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {avatar ? <Image src={avatar} alt="" width={compact ? 18 : 28} height={compact ? 18 : 28} className={`${compact ? 'h-[18px] w-[18px]' : 'h-7 w-7'} shrink-0 rounded-full object-cover ring-1 ring-outline-variant/25`} /> : <span className={`${compact ? 'h-[18px] w-[18px] text-[8px]' : 'h-7 w-7 text-[10px]'} grid shrink-0 place-items-center rounded-full bg-surface-container-high font-bold`}>{owner.slice(0, 1)}</span>}
      <span className="truncate">{owner}</span>
    </span>
  );
}

function startOfWeek(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatWeek(start: Date): string {
  const end = addDays(start, 6);
  const left = new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric' }).format(start);
  const right = new Intl.DateTimeFormat('en-CA', { month: start.getMonth() === end.getMonth() ? undefined : 'long', day: 'numeric', year: 'numeric' }).format(end);
  return `${left}–${right}`;
}

function previewText(value: string | null, limit = 520): string {
  if (!value) return 'No preview copy is stored for this activity yet.';
  const plain = value.replace(/[#*_>`\[\]]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return plain.length > limit ? `${plain.slice(0, limit).trim()}…` : plain;
}

function previewStateLabel(activity: GrowthCalendarActivity): string {
  if (activity.displayState === 'live') return 'Published post';
  if (activity.displayState === 'next') return 'Scheduled preview';
  if (activity.displayState === 'stopped') return 'Archive preview';
  return 'Draft preview';
}

function InstagramPreview({ activity }: { readonly activity: GrowthCalendarActivity }) {
  const [slide, setSlide] = useState(0);
  useEffect(() => setSlide(0), [activity.id]);
  const media = activity.media;
  const current = media[slide];
  const isVideo = current?.kind === 'video';
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
      <div className="flex items-center gap-3 p-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-on-background font-headline text-sm font-bold text-background">G</span><div><p className="text-sm font-bold text-on-background">get_geopulse</p><p className="text-[10px] text-on-surface-variant">{previewStateLabel(activity)}</p></div><span className="ml-auto font-bold text-on-surface-variant">•••</span></div>
      {current ? (
        <div className="relative aspect-square bg-black">
          {isVideo ? <video className="h-full w-full object-contain" src={current.url} controls preload="metadata" /> : <img className="h-full w-full object-cover" src={current.url} alt={current.altText ?? `Creative ${slide + 1}`} />}
          {media.length > 1 ? <><span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">{slide + 1}/{media.length}</span><button type="button" onClick={() => setSlide((slide - 1 + media.length) % media.length)} className="absolute left-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow" aria-label="Previous slide">‹</button><button type="button" onClick={() => setSlide((slide + 1) % media.length)} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow" aria-label="Next slide">›</button></> : null}
        </div>
      ) : <div className="grid aspect-square place-items-center bg-surface-container-low p-8 text-center text-sm text-on-surface-variant"><div><span className="material-symbols-outlined text-4xl">movie</span><p className="mt-2 font-semibold text-on-background">Media preview pending</p><p className="mt-1 text-xs">Scheduling remains visibly dependent on provider-ready media.</p></div></div>}
      <div className="flex items-center justify-between px-3 pt-3 text-xl"><span>♡　◯　⌁</span><span>◇</span></div>
      <p className="whitespace-pre-line px-3 pb-4 pt-2 text-xs leading-5"><strong className="mr-1">get_geopulse</strong>{previewText(activity.previewText, 420)}</p>
    </div>
  );
}

function LinkedInPreview({ activity }: { readonly activity: GrowthCalendarActivity }) {
  const media = activity.media[0];
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
      <div className="flex items-center gap-3 p-4"><ChannelMark channel="linkedin" /><div><p className="text-sm font-bold text-on-background">GEO-Pulse</p><p className="text-[10px] text-on-surface-variant">Company page · {previewStateLabel(activity)}</p></div><span className="ml-auto font-bold">•••</span></div>
      <div className="whitespace-pre-line px-4 pb-4 text-sm leading-6">{previewText(activity.previewText)}</div>
      {media ? media.kind === 'video' ? <video className="max-h-[28rem] w-full bg-black" src={media.url} controls preload="metadata" /> : <img className="max-h-[28rem] w-full object-contain bg-surface-container-low" src={media.url} alt={media.altText ?? 'LinkedIn creative'} /> : null}
      <div className="border-t border-outline-variant/15 px-4 py-3 text-xs text-on-surface-variant">Like　 Comment　 Repost　 Send</div>
    </div>
  );
}

function EmailPreview({ activity }: { readonly activity: GrowthCalendarActivity }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
      {[['From', 'GEO-Pulse <reports@getgeopulse.com>'], ['To', activity.summary ?? 'Qualified cohort · suppressed contacts excluded'], ['Subject', activity.previewTitle ?? activity.title]].map(([label, value]) => <div key={label} className="grid grid-cols-[4rem_1fr] border-b border-outline-variant/15 px-4 py-3 text-xs"><span className="text-on-surface-variant">{label}</span><strong className="min-w-0 break-words text-on-background">{value}</strong></div>)}
      <div className="whitespace-pre-line px-4 py-6 text-sm leading-6 text-on-background">{previewText(activity.previewText, 900)}</div>
    </div>
  );
}

function BlogPreview({ activity }: { readonly activity: GrowthCalendarActivity }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
      <div className="bg-surface-container-low px-4 py-2 text-[10px] text-on-surface-variant">getgeopulse.com / insights / preview</div>
      {activity.media[0] ? <img className="h-44 w-full object-cover" src={activity.media[0].url} alt={activity.media[0].altText ?? ''} /> : null}
      <article className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{activity.vertical?.replaceAll('_', ' ') ?? 'Buyer visibility'}</p><h3 className="mt-2 font-headline text-2xl font-bold text-on-background">{activity.previewTitle ?? activity.title}</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-on-surface-variant">{previewText(activity.previewText, 650)}</p></article>
    </div>
  );
}

function ActivityPreview({ activity }: { readonly activity: GrowthCalendarActivity }) {
  if (activity.channel === 'instagram') return <InstagramPreview activity={activity} />;
  if (activity.channel === 'linkedin') return <LinkedInPreview activity={activity} />;
  if (activity.channel === 'email') return <EmailPreview activity={activity} />;
  if (activity.channel === 'blog') return <BlogPreview activity={activity} />;
  return <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-8 text-center"><ChannelMark channel={activity.channel} /><h3 className="mt-4 font-headline text-xl font-bold">No public asset</h3><p className="mt-2 text-sm leading-6 text-on-surface-variant">This is an internal, sales or experiment activity. Its accountability contract is shown in Details.</p></div>;
}

function DetailRow({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-outline-variant/10 py-2.5 text-xs last:border-0"><span className="text-on-surface-variant">{label}</span><div className="min-w-0 font-semibold text-on-background">{value}</div></div>;
}

function ActivityDetails({ activity }: { readonly activity: GrowthCalendarActivity }) {
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Accountability</p><div className="mt-2"><DetailRow label="Owner" value={<Agent owner={activity.owner} />} /><DetailRow label="Next action" value={activity.nextAction ?? 'No next action recorded'} /><DetailRow label="Due" value={formatDateTime(activity.dueAt)} /><DetailRow label="Attempts" value={`${activity.attemptCount} / ${activity.maxAttempts}`} /></div></section>
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Campaign connection</p><div className="mt-2"><DetailRow label="Campaign" value={activity.campaignName ?? 'Not linked'} /><DetailRow label="Role" value={activity.campaignRole ?? '—'} /><DetailRow label="Vertical" value={activity.vertical?.replaceAll('_', ' ') ?? '—'} /><DetailRow label="Experiment" value={activity.interventionName ?? '—'} /><DetailRow label="Funnel stage" value={activity.funnelStage ?? '—'} /></div></section>
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Lineage & approval</p><div className="mt-2"><DetailRow label="Source" value={activity.sourceContentUrl ? <a href={activity.sourceContentUrl} className="text-primary underline">{activity.sourceContentTitle ?? 'Open source content'}</a> : activity.sourceContentTitle ?? 'Direct activity'} /><DetailRow label="Approval" value={activity.approvalLabel ?? 'Approval not recorded'} /><DetailRow label="Approved at" value={activity.approvedAt ? formatDateTime(activity.approvedAt) : '—'} /></div></section>
      {activity.dependencies.length > 0 ? <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Dependencies</p><ul className="mt-2 space-y-2 text-xs text-on-background">{activity.dependencies.map((item) => <li key={item} className="flex gap-2"><span>•</span><span>{item}</span></li>)}</ul></section> : null}
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Decision contract & outcome</p><div className="mt-2"><DetailRow label="Success" value={activity.successCondition ?? 'Not declared'} /><DetailRow label="Stop / revise" value={activity.stopCondition ?? 'Not declared'} /><DetailRow label={activity.outcomeLabel ?? 'Outcome'} value={activity.outcomeValue ?? 'No outcome yet'} /></div>{activity.destinationUrl ? <a href={activity.destinationUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">Open live destination <span className="material-symbols-outlined text-sm">open_in_new</span></a> : null}</section>
    </div>
  );
}

function ActivityDrawer({ activity, onClose }: { readonly activity: GrowthCalendarActivity; readonly onClose: () => void }) {
  const [tab, setTab] = useState<'preview' | 'details'>('preview');
  useEffect(() => setTab('preview'), [activity.id]);
  return (
    <aside className="flex min-h-[42rem] min-w-0 flex-col border-l border-outline-variant/20 bg-surface-container-low">
      <div className="border-b border-outline-variant/20 bg-surface-container-lowest p-4"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><ChannelMark channel={activity.channel} /><span className="truncate text-[10px] font-bold uppercase tracking-[0.16em]">{channelLabel(activity.channel)} · {activity.sourceType.replaceAll('_', ' ')}</span></div><div className="flex items-center gap-2"><StateBadge state={activity.displayState} /><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-outline-variant/25 text-on-surface-variant hover:bg-surface-container" aria-label="Close preview"><span className="material-symbols-outlined text-lg">close</span></button></div></div><h2 className="mt-3 font-headline text-2xl font-bold leading-tight text-on-background">{activity.title}</h2><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><span>{formatDateTime(activity.startsAt)}</span><span>·</span><Agent owner={activity.owner} compact /></div><div className="mt-4 grid grid-cols-2 rounded-xl bg-surface-container p-1"><button type="button" onClick={() => setTab('preview')} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === 'preview' ? 'bg-surface-container-lowest text-on-background shadow-sm' : 'text-on-surface-variant'}`}>Preview</button><button type="button" onClick={() => setTab('details')} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === 'details' ? 'bg-surface-container-lowest text-on-background shadow-sm' : 'text-on-surface-variant'}`}>Details & owner</button></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{tab === 'preview' ? <ActivityPreview activity={activity} /> : <ActivityDetails activity={activity} />}</div>
      <div className="grid grid-cols-2 gap-2 border-t border-outline-variant/20 bg-surface-container-lowest p-4"><Link href={activity.detailHref} className="rounded-xl border border-outline-variant/25 px-3 py-2.5 text-center text-xs font-bold hover:bg-surface-container-low">Open source</Link><button type="button" disabled={activity.displayState !== 'next'} className="rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">{activity.displayState === 'live' ? 'Already live' : activity.displayState === 'stopped' ? 'Stopped' : activity.displayState === 'action' ? 'Fix first' : 'Approve & schedule'}</button></div>
    </aside>
  );
}

function EventCard({ activity, selected, onSelect }: { readonly activity: GrowthCalendarActivity; readonly selected: boolean; readonly onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-xl border p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary ${STATE_META[activity.displayState].card} ${selected ? 'ring-2 ring-on-background ring-offset-1' : ''}`}>
      <div className="flex items-start gap-2"><ChannelMark channel={activity.channel} small /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-1"><StateBadge state={activity.displayState} compact /><span className="shrink-0 text-[9px] opacity-70">{formatTime(activity.startsAt)}</span></div><p className="mt-1 line-clamp-2 text-[11px] font-bold leading-[0.9rem]">{activity.title}</p><div className="mt-1 text-[9px] opacity-70"><Agent owner={activity.owner} compact /></div></div></div>
    </button>
  );
}

function ActionInbox({ items }: { readonly items: readonly GrowthCalendarInboxItem[] }) {
  if (items.length === 0) return <div className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-10 text-center"><span className="material-symbols-outlined text-4xl text-primary">task_alt</span><h2 className="mt-3 font-headline text-2xl font-bold">Action inbox is clear</h2><p className="mt-2 text-sm text-on-surface-variant">No replies, failures, overdue work or approvals currently need attention.</p></div>;
  return (
    <section className="overflow-hidden rounded-3xl border border-outline-variant/20 bg-surface-container-lowest shadow-float"><div className="border-b border-outline-variant/15 p-5"><h2 className="font-headline text-2xl font-bold">Needs attention now</h2><p className="mt-1 text-sm text-on-surface-variant">Replies, failures, approvals and owned work—sorted by urgency.</p></div><div className="divide-y divide-outline-variant/15">{items.map((item) => <article key={item.id} className="grid gap-4 p-5 md:grid-cols-[8rem_minmax(0,1fr)_12rem_auto] md:items-center"><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${item.severity === 'urgent' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : item.severity === 'today' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-surface-container-high text-on-surface-variant'}`}>{item.severity}</span><div><p className="font-bold text-on-background">{item.title}</p><p className="mt-1 text-xs leading-5 text-on-surface-variant">{item.detail ?? item.nextAction}</p><p className="mt-2 text-xs font-semibold text-primary">Next: {item.nextAction}</p></div><div className="text-xs"><Agent owner={item.owner} /><p className="mt-2 text-on-surface-variant">Due {formatDateTime(item.dueAt)}</p><p className="mt-1 text-on-surface-variant">Attempts {item.attemptCount}/{item.maxAttempts}</p></div><Link href={item.href} className="rounded-xl border border-outline-variant/25 px-3 py-2 text-center text-xs font-bold hover:bg-surface-container-low">Open {item.sourceLabel}</Link></article>)}</div></section>
  );
}

export function GrowthCalendarClient({ data }: { readonly data: GrowthCalendarData }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'calendar' | 'inbox'>('calendar');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const [activeChannels, setActiveChannels] = useState<Set<GrowthCalendarChannel>>(() => new Set(CHANNELS.map((item) => item.key)));
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekActivities = useMemo(() => data.activities.filter((activity) => activeChannels.has(activity.channel) && days.some((day) => dateKey(day) === dateKey(activity.startsAt))), [activeChannels, data.activities, days]);
  const visible = useMemo(() => weekActivities.filter((activity) => showHistory || activity.displayState !== 'stopped'), [showHistory, weekActivities]);
  const selected = selectedId ? visible.find((activity) => activity.id === selectedId) ?? null : null;
  const live = weekActivities.filter((activity) => activity.displayState === 'live').length;
  const next = weekActivities.filter((activity) => activity.displayState === 'next').length;
  const action = weekActivities.filter((activity) => activity.displayState === 'action').length;
  const stopped = weekActivities.filter((activity) => activity.displayState === 'stopped').length;
  useEffect(() => {
    if (selectedId && !visible.some((activity) => activity.id === selectedId)) setSelectedId(null);
  }, [selectedId, visible]);
  useEffect(() => setExpandedDays(new Set()), [weekStart, showHistory, activeChannels]);
  const toggleChannel = (channel: GrowthCalendarChannel) => setActiveChannels((current) => { const next = new Set(current); if (next.has(channel)) next.delete(channel); else next.add(channel); return next; });
  const toggleDay = (key: string) => setExpandedDays((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Marketing operations</p><h1 className="mt-2 font-headline text-3xl font-black text-on-background md:text-4xl">Growth calendar</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">See what went live, what goes out next and what needs help. Select any card to preview it.</p></div><div className="flex rounded-xl bg-surface-container p-1"><button type="button" onClick={() => setView('calendar')} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === 'calendar' ? 'bg-surface-container-lowest shadow-sm' : 'text-on-surface-variant'}`}>Calendar</button><button type="button" onClick={() => setView('inbox')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${view === 'inbox' ? 'bg-surface-container-lowest shadow-sm' : 'text-on-surface-variant'}`}>Action inbox <span className="text-[10px] font-medium">all work</span>{data.inbox.length > 0 ? <span className="rounded-full bg-error px-1.5 py-0.5 text-[10px] text-on-error">{data.inbox.length}</span> : null}</button></div></header>
      {data.warnings.length > 0 ? <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"><strong>{data.warnings.length} source sync issue{data.warnings.length === 1 ? '' : 's'}:</strong> {data.warnings.join(' · ')}</div> : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        [live, '✓ LIVE', 'this week', 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'],
        [next, '◷ NEXT', 'this week', 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'],
        [action, '! NEEDS HELP', 'this week', 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30'],
      ].map(([value, label, note, tone]) => <div key={String(label)} className={`rounded-2xl border p-4 shadow-float ${tone}`}><p className="text-[10px] font-black uppercase tracking-[0.14em]">{label}</p><div className="mt-2 flex items-baseline gap-2"><strong className="font-headline text-3xl text-on-background">{value}</strong><span className="text-xs text-on-surface-variant">{note}</span></div></div>)}<button type="button" onClick={() => setShowHistory((current) => !current)} aria-pressed={showHistory} className="rounded-2xl border border-slate-300 bg-slate-100 p-4 text-left shadow-float transition hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900/40"><p className="text-[10px] font-black uppercase tracking-[0.14em]">— NOT GOING OUT</p><div className="mt-2 flex items-baseline gap-2"><strong className="font-headline text-3xl text-on-background">{stopped}</strong><span className="text-xs text-on-surface-variant">{showHistory ? 'shown · click to hide' : 'hidden · click to show'}</span></div></button></section>
      {view === 'inbox' ? <ActionInbox items={data.inbox} /> : <section className="overflow-hidden rounded-3xl border border-outline-variant/20 bg-surface-container-lowest shadow-float"><div className="border-b border-outline-variant/20 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid h-9 w-9 place-items-center rounded-xl border border-outline-variant/25" aria-label="Previous week">‹</button><button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid h-9 w-9 place-items-center rounded-xl border border-outline-variant/25" aria-label="Next week">›</button><button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-xl border border-outline-variant/25 px-3 py-2 text-xs font-bold">Today</button><span className="ml-1 font-headline text-lg font-bold">{formatWeek(weekStart)}</span></div><div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">{CHANNELS.map((item) => <button type="button" key={item.key} onClick={() => toggleChannel(item.key)} aria-pressed={activeChannels.has(item.key)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${activeChannels.has(item.key) ? 'border-outline-variant/30 bg-surface-container-low text-on-background' : 'border-transparent text-on-surface-variant opacity-45'}`}><ChannelMark channel={item.key} small />{item.label}</button>)}</div></div><p className="mt-2 text-[11px] text-on-surface-variant">Showing {visible.length} working item{visible.length === 1 ? '' : 's'}{showHistory ? ', including history' : `. ${stopped} cancelled or archived hidden`}.</p></div><div className={selected ? 'grid xl:grid-cols-[minmax(0,1fr)_370px]' : ''}><div className="min-w-0 overflow-x-auto"><div className="grid min-w-[840px] grid-cols-7">{days.map((day) => { const key = dateKey(day); const activities = visible.filter((activity) => dateKey(activity.startsAt) === key).sort((left, right) => { const order: Record<GrowthCalendarDisplayState, number> = { action: 0, next: 1, live: 2, stopped: 3 }; return order[left.displayState] - order[right.displayState] || new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(); }); const expanded = expandedDays.has(key); const shown = expanded ? activities : activities.slice(0, 4); const hidden = activities.length - shown.length; const today = key === dateKey(new Date()); return <article key={key} className="min-h-[31rem] border-r border-outline-variant/15 last:border-r-0"><header className={`border-b border-outline-variant/15 px-3 py-3 ${today ? 'bg-primary/10' : 'bg-surface-container-low'}`}><p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{new Intl.DateTimeFormat('en-CA', { weekday: 'short' }).format(day)}</p><p className={`mt-1 font-headline text-xl font-bold ${today ? 'text-primary' : 'text-on-background'}`}>{day.getDate()}</p></header><div className="space-y-2 p-2">{shown.map((activity) => <EventCard key={activity.id} activity={activity} selected={selected?.id === activity.id} onSelect={() => setSelectedId(activity.id)} />)}{hidden > 0 ? <button type="button" onClick={() => toggleDay(key)} className="w-full rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low px-2 py-2 text-[10px] font-bold text-primary hover:bg-surface-container">+ {hidden} more</button> : expanded && activities.length > 4 ? <button type="button" onClick={() => toggleDay(key)} className="w-full px-2 py-2 text-[10px] font-bold text-on-surface-variant">Show less</button> : null}{activities.length === 0 ? <p className="py-16 text-center text-[10px] text-on-surface-variant">Nothing planned</p> : null}</div></article>; })}</div></div>{selected ? <ActivityDrawer activity={selected} onClose={() => setSelectedId(null)} /> : null}</div></section>}
      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant"><p>{data.campaigns.filter((campaign) => campaign.status === 'active').map((campaign) => `${campaign.role}: ${campaign.name} (${campaign.allocationPercent}%)`).join(' · ') || 'No active campaigns'}</p><p>Read model refreshed {formatDateTime(data.generatedAt)}</p></footer>
    </div>
  );
}
