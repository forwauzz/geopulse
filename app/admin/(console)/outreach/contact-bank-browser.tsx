'use client';

import { useMemo, useState } from 'react';
import type { ContactRow } from '@/lib/server/outreach-contacts';

const input =
  'min-h-[40px] rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';

type StatusFilter = 'all' | 'saved' | 'in_sequence';

type SegmentMeta = { segment: string; total: number; saved: number };

type Props = {
  contacts: ContactRow[];
  segments: SegmentMeta[];
  /** Server actions passed from the page. */
  addSegmentToSequenceAction: (formData: FormData) => void | Promise<void>;
  deleteOutreachContactAction: (formData: FormData) => void | Promise<void>;
};

const CONTACTS_PER_SEGMENT = 40;

export function ContactBankBrowser({
  contacts,
  segments,
  addSegmentToSequenceAction,
  deleteOutreachContactAction,
}: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [openSegments, setOpenSegments] = useState<Set<string>>(new Set());
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  // One pass: filter by search + status + segment, then bucket by segment.
  const { grouped, matchCount } = useMemo(() => {
    const grouped = new Map<string, ContactRow[]>();
    let matchCount = 0;
    for (const c of contacts) {
      if (segmentFilter !== 'all' && c.segment !== segmentFilter) continue;
      const inSeq = Boolean(c.added_to_sequence_at);
      if (status === 'saved' && inSeq) continue;
      if (status === 'in_sequence' && !inSeq) continue;
      if (q) {
        const hay = `${c.email} ${c.company ?? ''} ${c.city ?? ''} ${c.segment} ${c.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const list = grouped.get(c.segment) ?? [];
      list.push(c);
      grouped.set(c.segment, list);
      matchCount += 1;
    }
    return { grouped, matchCount };
  }, [contacts, q, status, segmentFilter]);

  // A search or non-default filter auto-opens the matching segments so results are visible.
  const forceOpen = q.length > 0 || status !== 'all' || segmentFilter !== 'all';

  const visibleSegments = segments.filter((s) => segmentFilter === 'all' || s.segment === segmentFilter);

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div className="mt-4">
      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email, company, city, tag…"
          className={`${input} min-w-[220px] flex-1`}
          aria-label="Search contacts"
        />
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className={input}
          aria-label="Filter by segment"
        >
          <option value="all">All segments</option>
          {segments.map((s) => (
            <option key={s.segment} value={s.segment}>
              {s.segment} ({s.total})
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className={input}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="saved">Saved only</option>
          <option value="in_sequence">In sequence</option>
        </select>
        <button
          type="button"
          onClick={() => setOpenSegments(new Set(visibleSegments.map((s) => s.segment)))}
          className="rounded-xl border border-outline-variant/30 px-3 py-2 font-sans text-xs font-semibold text-on-surface hover:bg-surface-container"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setOpenSegments(new Set())}
          className="rounded-xl border border-outline-variant/30 px-3 py-2 font-sans text-xs font-semibold text-on-surface hover:bg-surface-container"
        >
          Collapse all
        </button>
      </div>
      <p className="mt-2 font-sans text-xs text-on-surface-variant">
        {matchCount} contact{matchCount === 1 ? '' : 's'} match
        {q || status !== 'all' || segmentFilter !== 'all' ? ' the current filters' : ''}.
      </p>

      {/* Collapsible per-segment groups */}
      <div className="mt-3 space-y-2">
        {visibleSegments.map((seg) => {
          const rows = grouped.get(seg.segment) ?? [];
          // Hide segments with no matches while a filter/search is active.
          if (forceOpen && rows.length === 0) return null;
          const isOpen = forceOpen || openSegments.has(seg.segment);
          const listExpanded = expandedLists.has(seg.segment);
          const shown = listExpanded ? rows : rows.slice(0, CONTACTS_PER_SEGMENT);

          return (
            <div key={seg.segment} className="rounded-xl border border-outline-variant/20 bg-surface-container-low">
              <button
                type="button"
                onClick={() => setOpenSegments((prev) => toggle(prev, seg.segment))}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined text-[18px] text-on-surface-variant transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    aria-hidden
                  >
                    chevron_right
                  </span>
                  <span className="font-sans text-sm font-bold text-on-background">{seg.segment}</span>
                </span>
                <span className="rounded-md bg-surface-container px-2 py-0.5 font-sans text-xs font-semibold text-on-surface-variant">
                  {forceOpen ? `${rows.length} shown · ` : ''}
                  {seg.saved} saved · {seg.total} total
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-outline-variant/10 px-4 pb-4 pt-3">
                  {/* One-click add-to-sequence for this segment. */}
                  {seg.saved > 0 && (
                    <form action={addSegmentToSequenceAction} className="mb-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="segment" value={seg.segment} />
                      <label className="block">
                        <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                          First send (Montréal time)
                        </span>
                        <input name="startAt" type="datetime-local" className={input} />
                      </label>
                      <select name="cadence" defaultValue="monthly" className={input}>
                        <option value="monthly">monthly</option>
                        <option value="weekly">weekly</option>
                      </select>
                      <button className="inline-flex min-h-[40px] items-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary hover:opacity-90">
                        Add {seg.saved} to sequence
                      </button>
                    </form>
                  )}

                  {rows.length === 0 ? (
                    <p className="font-sans text-xs text-on-surface-variant">No contacts match here.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left font-sans text-sm">
                        <thead>
                          <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                            <th className="pb-2 pr-3 font-semibold">Contact</th>
                            <th className="pb-2 pr-3 font-semibold">Company</th>
                            <th className="pb-2 pr-3 font-semibold">City</th>
                            <th className="pb-2 pr-3 font-semibold">Status</th>
                            <th className="pb-2 font-semibold" />
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((c) => (
                            <tr key={c.id} className="border-t border-outline-variant/10">
                              <td className="py-2 pr-3">
                                <span className="font-semibold text-on-background">{c.email}</span>
                                <div className="text-xs text-on-surface-variant">{c.url}</div>
                                {c.tags.length > 0 && (
                                  <div className="text-[11px] text-on-surface-variant">{c.tags.join(' · ')}</div>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant">{c.company ?? '—'}</td>
                              <td className="py-2 pr-3 text-on-surface-variant">{c.city ?? '—'}</td>
                              <td className="py-2 pr-3 text-xs">
                                {c.added_to_sequence_at ? (
                                  <span className="font-semibold text-sky-700 dark:text-sky-300">In sequence</span>
                                ) : (
                                  <span className="text-on-surface-variant">Saved</span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                <form action={deleteOutreachContactAction}>
                                  <input type="hidden" name="contactId" value={c.id} />
                                  <button className="rounded-lg border border-error/30 px-2.5 py-1 text-xs font-semibold text-error hover:bg-error/10">
                                    Remove
                                  </button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {rows.length > shown.length && (
                        <button
                          type="button"
                          onClick={() => setExpandedLists((prev) => toggle(prev, seg.segment))}
                          className="mt-2 font-sans text-xs font-semibold text-primary hover:underline"
                        >
                          Show all {rows.length}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
