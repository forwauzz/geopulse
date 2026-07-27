import Image from 'next/image';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { addPriyaResearchIdea } from './actions';
import { SeoIdeasBoard, type SeoIdeaRow } from './seo-ideas-board';

export const dynamic = 'force-dynamic';

type OpportunityRow = {
  id: string;
  title: string;
  evidence: string;
  recommendation: string;
  priority: number;
  status: string;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
};

function channelFor(row: OpportunityRow): SeoIdeaRow['channel'] {
  const value = String(row.metadata?.research_channel ?? '');
  return value === 'reddit' || value === 'twitter' ? value : 'google';
}

const fieldClass =
  'min-h-[42px] w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 font-sans text-sm text-on-background outline-none focus:ring-2 focus:ring-primary/25';

export default async function AdminSeoIdeasPage() {
  const ctx = await loadAdminPageContext('/admin/seo-ideas');
  if (!ctx.ok) {
    return <p className="rounded-xl bg-error-container p-4 text-on-error-container">{ctx.message}</p>;
  }

  const { data } = await ctx.adminDb
    .from('seo_opportunities')
    .select('id,title,evidence,recommendation,priority,status,last_seen_at,metadata')
    .order('last_seen_at', { ascending: false })
    .limit(180);
  const rows = (data ?? []) as OpportunityRow[];
  const ideas: SeoIdeaRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    evidence: row.evidence,
    recommendation: row.recommendation,
    priority: row.priority,
    status: row.status,
    channel: channelFor(row),
    sourceUrl: typeof row.metadata?.source_url === 'string' ? row.metadata.source_url : null,
    sourceLabel: typeof row.metadata?.source_label === 'string'
      ? row.metadata.source_label
      : channelFor(row) === 'google' ? 'Search intelligence' : channelFor(row),
    suggestedReply: typeof row.metadata?.suggested_reply === 'string'
      ? row.metadata.suggested_reply
      : null,
    lastSeenAt: row.last_seen_at,
  }));

  const active = ideas.filter((idea) => idea.status === 'queued' || idea.status === 'in_progress').length;
  const community = ideas.filter((idea) => idea.channel !== 'google').length;

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl border border-outline-variant/25 bg-surface-container-lowest">
        <div className="grid md:grid-cols-[1.35fr_0.65fr]">
          <div className="p-6 md:p-8">
            <p className="font-label text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Priya&apos;s opportunity desk</p>
            <h1 className="mt-2 max-w-2xl font-sans text-3xl font-black uppercase leading-none tracking-tight text-on-background md:text-4xl">
              One SEO idea bank. Three live sources.
            </h1>
            <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-on-surface-variant">
              Google shows demand. Reddit exposes buyer pain. X catches the category while it moves.
              Priya turns every accepted idea into a source-backed article and a social derivative.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-primary px-3 py-1.5 font-label text-xs font-bold text-on-primary">{active} active loops</span>
              <span className="rounded-full bg-surface-container-high px-3 py-1.5 font-label text-xs font-bold text-on-surface">{community} community findings</span>
              <span className="rounded-full bg-surface-container-high px-3 py-1.5 font-label text-xs font-bold text-on-surface">Replies require approval</span>
            </div>
          </div>
          <div className="relative min-h-64 bg-surface-container-high md:min-h-0">
            <Image
              src="/team/priya-shah.webp"
              alt="Priya Shah, SEO strategist"
              fill
              priority
              sizes="(min-width: 768px) 33vw, 100vw"
              className="object-cover object-top"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 text-white">
              <p className="font-sans text-lg font-black">Priya Shah</p>
              <p className="font-sans text-xs text-white/80">Autonomous SEO and GEO strategist</p>
            </div>
          </div>
        </div>
      </header>

      <details className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5">
        <summary className="cursor-pointer font-sans text-sm font-bold text-on-background">
          Add a researched idea
          <span className="ml-2 font-normal text-on-surface-variant">for findings you or the team discover manually</span>
        </summary>
        <form action={addPriyaResearchIdea} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="space-y-1">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Source</span>
            <select name="channel" className={fieldClass} defaultValue="reddit">
              <option value="google">Google</option>
              <option value="reddit">Reddit</option>
              <option value="twitter">X</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Source label</span>
            <input name="sourceLabel" className={fieldClass} placeholder="r/SEO, X, Search Console" />
          </label>
          <label className="space-y-1 lg:col-span-2">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Idea title</span>
            <input name="title" required className={fieldClass} placeholder="The buyer question or content opportunity" />
          </label>
          <label className="space-y-1 lg:col-span-2">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Source URL</span>
            <input name="sourceUrl" type="url" required className={fieldClass} placeholder="https://..." />
          </label>
          <label className="space-y-1">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Evidence</span>
            <textarea name="evidence" required rows={4} className={fieldClass} placeholder="What people are saying or what the data shows" />
          </label>
          <label className="space-y-1">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Priya&apos;s recommended angle</span>
            <textarea name="recommendation" required rows={4} className={fieldClass} placeholder="The useful page or post we should create" />
          </label>
          <label className="space-y-1 lg:col-span-2">
            <span className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant">Optional community reply draft</span>
            <textarea name="replyDraft" rows={4} className={fieldClass} placeholder="lowercase, useful, transparent about our connection to geo-pulse" />
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className="min-h-[42px] rounded-xl bg-primary px-5 font-sans text-sm font-bold text-on-primary transition hover:opacity-90">
              Feed this to Priya
            </button>
          </div>
        </form>
      </details>

      <SeoIdeasBoard ideas={ideas} />
    </div>
  );
}
