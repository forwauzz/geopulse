'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

export type SeoIdeaRow = {
  id: string;
  title: string;
  evidence: string;
  recommendation: string;
  priority: number;
  status: string;
  channel: 'google' | 'reddit' | 'twitter';
  sourceUrl: string | null;
  sourceLabel: string;
  suggestedReply: string | null;
  lastSeenAt: string;
};

const CHANNELS = [
  {
    key: 'google' as const,
    label: 'Google',
    image: '/images/blog/geo-vs-seo.png',
    description: 'Search demand, rankings, gaps, and Search Console evidence.',
  },
  {
    key: 'reddit' as const,
    label: 'Reddit',
    image: '/media/agency-brainstorm.webp',
    description: 'Real buyer questions, objections, tool comparisons, and language.',
  },
  {
    key: 'twitter' as const,
    label: 'X',
    image: '/media/journey-cards.webp',
    description: 'Fast-moving opinions, category shifts, proof requests, and emerging pain.',
  },
];

function priorityLabel(priority: number): string {
  if (priority <= 1) return 'high';
  if (priority === 2) return 'medium';
  return 'watch';
}

function statusClass(status: string): string {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'in_progress') return 'bg-sky-100 text-sky-800';
  if (status === 'dismissed') return 'bg-stone-200 text-stone-700';
  return 'bg-amber-100 text-amber-800';
}

export function SeoIdeasBoard({ ideas }: { ideas: SeoIdeaRow[] }) {
  const [source, setSource] = useState<'all' | SeoIdeaRow['channel']>('all');
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (source !== 'all' && idea.channel !== source) return false;
      if (status === 'active' && !['queued', 'in_progress'].includes(idea.status)) return false;
      if (status !== 'all' && status !== 'active' && idea.status !== status) return false;
      if (!needle) return true;
      return `${idea.title} ${idea.evidence} ${idea.recommendation} ${idea.sourceLabel}`
        .toLowerCase()
        .includes(needle);
    });
  }, [ideas, query, source, status]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="sr-only">Search ideas</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ideas, evidence, or recommendations"
              className="min-h-[42px] w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-4 font-sans text-sm text-on-background outline-none focus:ring-2 focus:ring-primary/25"
            />
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Filter by source">
            {(['all', 'google', 'reddit', 'twitter'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSource(value)}
                className={`min-h-[42px] rounded-xl px-4 font-sans text-xs font-bold uppercase tracking-wider transition ${
                  source === value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant/25 bg-surface-container-low text-on-surface'
                }`}
              >
                {value === 'twitter' ? 'X' : value}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="min-h-[42px] rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 font-sans text-sm text-on-background outline-none focus:ring-2 focus:ring-primary/25"
            aria-label="Filter by status"
          >
            <option value="active">Active only</option>
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {CHANNELS.map((channel) => {
          const rows = filtered.filter((idea) => idea.channel === channel.key);
          return (
            <section
              key={channel.key}
              className={`${source !== 'all' && source !== channel.key ? 'hidden' : ''} overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest`}
            >
              <div className="relative h-36 overflow-hidden">
                <Image
                  src={channel.image}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 33vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <div className="flex items-end justify-between gap-3">
                    <h2 className="font-sans text-xl font-black uppercase tracking-tight">{channel.label}</h2>
                    <span className="rounded-full bg-white/20 px-2.5 py-1 font-label text-xs font-bold backdrop-blur">
                      {rows.length}
                    </span>
                  </div>
                  <p className="mt-1 font-sans text-xs text-white/85">{channel.description}</p>
                </div>
              </div>

              <div className="space-y-3 p-3">
                {rows.length === 0 ? (
                  <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm text-on-surface-variant">
                    No ideas match these filters.
                  </p>
                ) : rows.map((idea) => (
                  <details
                    key={idea.id}
                    className="group rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 open:bg-surface-container-lowest"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-wider ${statusClass(idea.status)}`}>
                              {idea.status.replace('_', ' ')}
                            </span>
                            <span className="rounded-full border border-outline-variant/25 px-2 py-0.5 font-label text-[0.62rem] font-bold uppercase tracking-wider text-on-surface-variant">
                              {priorityLabel(idea.priority)}
                            </span>
                          </div>
                          <h3 className="mt-2 font-sans text-sm font-bold leading-snug text-on-background">
                            {idea.title}
                          </h3>
                          <p className="mt-1 line-clamp-2 font-sans text-xs leading-relaxed text-on-surface-variant">
                            {idea.evidence}
                          </p>
                        </div>
                        <span className="mt-1 text-lg text-on-surface-variant transition group-open:rotate-45">+</span>
                      </div>
                    </summary>

                    <div className="mt-4 space-y-3 border-t border-outline-variant/20 pt-4">
                      <div>
                        <p className="font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">Evidence</p>
                        <p className="mt-1 font-sans text-sm leading-relaxed text-on-surface">{idea.evidence}</p>
                      </div>
                      <div>
                        <p className="font-label text-[0.62rem] font-bold uppercase tracking-widest text-on-surface-variant">Priya&apos;s angle</p>
                        <p className="mt-1 font-sans text-sm leading-relaxed text-on-surface">{idea.recommendation}</p>
                      </div>
                      {idea.suggestedReply && (
                        <div className="rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-amber-950">
                          <p className="font-label text-[0.62rem] font-bold uppercase tracking-widest">Approval-only community reply</p>
                          <p className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed">{idea.suggestedReply}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-sans text-[0.68rem] text-on-surface-variant">{idea.sourceLabel}</span>
                        {idea.sourceUrl && (
                          <a
                            href={idea.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-sans text-xs font-bold text-primary underline"
                          >
                            Open source
                          </a>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
