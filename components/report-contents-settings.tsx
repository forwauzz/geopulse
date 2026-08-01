'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DEFAULT_REPORT_SETTINGS,
  PLANNED_SECTIONS,
  SECTION_DESCRIPTORS,
  describeOverrides,
  diffAgainstInherited,
  isLockedSection,
  type PartialReportSettings,
  type ReportEngineKey,
  type ReportSectionKey,
  type ReportSettings,
  type SectionDescriptor,
} from '@/lib/server/report-settings';
import type { AgencyReportSnapshotV2 } from '@/lib/server/agency-report-snapshot';
import { ReportPreviewPage } from '@/components/report-preview-page';

/**
 * Groups are derived from SECTION_DESCRIPTORS rather than hardcoded, so the checklist can never
 * drift from what actually renders. Ordering follows the delivered artifacts.
 */
type SectionMeta = SectionDescriptor;

const pick = (...keys: readonly ReportSectionKey[]): readonly SectionMeta[] =>
  keys.map((key) => SECTION_DESCRIPTORS.find((s) => s.key === key)!).filter(Boolean);

const GROUPS: readonly { readonly title: string; readonly items: readonly SectionMeta[] }[] = [
  {
    title: 'The shareable summary',
    items: pick(
      'headlineStats',
      'executiveSummary',
      'visibilityByEngine',
      'trendOverTime',
      'competitorsTracked',
      'buyerQuestions',
      'priorityActionPlan',
      'measurementReceipts'
    ),
  },
  {
    title: 'The downloadable report',
    items: pick('promptPerformance', 'opportunities', 'competitorCoCitations'),
  },
  {
    title: 'Always included',
    items: pick('scopeStatement', 'methodology'),
  },
];

const ENGINES: readonly { readonly key: ReportEngineKey; readonly label: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'google', label: 'Gemini' },
  { key: 'perplexity', label: 'Perplexity' },
];

function Check({ on, locked }: { readonly on: boolean; readonly locked?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.6px] ${
        locked
          ? 'border-outline-variant/60 bg-surface-container'
          : on
            ? 'border-primary bg-primary'
            : 'border-outline-variant bg-surface-container-lowest'
      }`}
    >
      {(on || locked) && (
        <span
          className={`absolute left-[5px] top-[2px] h-[9px] w-[5px] rotate-45 border-b-2 border-r-2 ${
            locked ? 'border-on-surface-variant/50' : 'border-white'
          }`}
        />
      )}
    </span>
  );
}

export function ReportContentsSettings({
  agencyName,
  initialSettings,
  initialOverride,
  inheritedSettings = DEFAULT_REPORT_SETTINGS,
  saveAction,
  previewSnapshot,
  brandName,
  brandColor,
  saveLabel,
}: {
  readonly agencyName: string;
  readonly initialSettings: ReportSettings;
  readonly initialOverride: PartialReportSettings;
  readonly inheritedSettings?: ReportSettings;
  readonly saveAction: (override: PartialReportSettings) => Promise<{ ok: boolean; error?: string }>;
  readonly previewSnapshot: AgencyReportSnapshotV2 | null;
  readonly brandName: string;
  readonly brandColor: string;
  readonly saveLabel?: string;
}) {
  const [settings, setSettings] = useState<ReportSettings>(initialSettings);
  const [paneOpen, setPaneOpen] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /**
   * The last state known to be persisted. Held in state rather than read from the prop: the prop
   * only changes when the server re-renders, so comparing against it leaves the bar reading
   * "unsaved" after a save that actually succeeded.
   */
  const [savedSettings, setSavedSettings] = useState<ReportSettings>(initialSettings);

  // At agency level the level above is what ships.
  const draftOverride = useMemo(
    () => diffAgainstInherited(settings, inheritedSettings),
    [settings, inheritedSettings]
  );
  const savedOverride = useMemo(
    () => diffAgainstInherited(savedSettings, inheritedSettings),
    [savedSettings, inheritedSettings]
  );
  const initialCount = useMemo(() => describeOverrides(savedOverride).count, [savedOverride]);
  const dirty = useMemo(
    () => JSON.stringify(draftOverride) !== JSON.stringify(savedOverride),
    [draftOverride, savedOverride]
  );

  function toggleSection(key: ReportSectionKey) {
    if (isLockedSection(key)) return;
    setSaved(null);
    setSettings((prev) => {
      const next = !prev.sections[key];
      return { ...prev, sections: { ...prev.sections, [key]: next } };
    });
  }

  function toggleEngine(key: ReportEngineKey) {
    setSaved(null);
    setSettings((prev) => {
      const enabledCount = Object.values(prev.engines).filter(Boolean).length;
      if (prev.engines[key] && enabledCount === 1) return prev;
      return { ...prev, engines: { ...prev.engines, [key]: !prev.engines[key] } };
    });
  }

  function togglePrompt(queryKey: string) {
    if (!previewSnapshot) return;
    setSaved(null);
    setSettings((prev) => {
      const all = previewSnapshot.availableQuestions.map((question) => question.queryKey);
      const current = prev.promptKeys.length > 0 ? [...prev.promptKeys] : all;
      const next = current.includes(queryKey)
        ? current.filter((key) => key !== queryKey)
        : [...current, queryKey];
      if (next.length === 0) return prev;
      return { ...prev, promptKeys: next.length === all.length ? [] : next.sort() };
    });
  }

  function toggleCompetitor(name: string) {
    if (!previewSnapshot) return;
    setSaved(null);
    setSettings((prev) => {
      const all = previewSnapshot.availableCompetitors.map((competitor) => competitor.name);
      const current = prev.competitors.length > 0 ? [...prev.competitors] : all;
      const next = current.includes(name)
        ? current.filter((competitor) => competitor !== name)
        : [...current, name];
      if (next.length === 0) return prev;
      return { ...prev, competitors: next.length === all.length ? [] : next.sort() };
    });
  }

  function onSave() {
    const attempted = settings;
    startTransition(async () => {
      const result = await saveAction(draftOverride);
      if (result.ok) setSavedSettings(attempted);
      setSaved(result.ok ? 'Saved' : (result.error ?? 'Could not save'));
    });
  }

  return (
    <div className="space-y-5">
      <div
        data-testid="unsaved-bar"
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          dirty ? 'border-gold/40 bg-gold/10' : 'border-outline-variant/30 bg-surface-container-low'
        }`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dirty ? 'bg-gold' : 'bg-outline-variant'}`} aria-hidden />
        <span className="flex-1 text-sm font-semibold text-on-background" data-testid="dirty-label">
          {dirty
            ? `${describeOverrides(draftOverride).count} setting${describeOverrides(draftOverride).count === 1 ? '' : 's'} changed · unsaved`
            : saved
              ? saved
              : `${initialCount} setting${initialCount === 1 ? '' : 's'} differ from the GEO-Pulse default`}
        </span>
        <button
          type="button"
          onClick={() => {
            setSettings(savedSettings);
            setSaved(null);
          }}
          disabled={!dirty || pending}
          className="min-h-[38px] rounded-lg border border-outline-variant/50 px-3.5 text-sm font-semibold text-on-background disabled:opacity-40"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || pending}
          data-testid="save-button"
          className="min-h-[38px] rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-40"
        >
          {pending ? 'Saving…' : (saveLabel ?? `Save ${agencyName} default`)}
        </button>
      </div>

      <div className={`grid gap-4 ${paneOpen ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'lg:grid-cols-[minmax(0,1fr)_46px]'}`}>
        {/* ---------------- checklist ---------------- */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Delivery contract</p>
            <h2 className="mt-2 font-headline text-lg font-semibold text-on-background">One canonical client report</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-on-surface-variant">Dashboard, client share page, PDF and email all use one stored multi-engine snapshot. Missing engines are disclosed and omitted, never counted as zero.</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {([1, 3, 6, 12] as const).map((months) => (
                <button
                  key={months}
                  type="button"
                  onClick={() => {
                    setSaved(null);
                    setSettings((prev) => ({ ...prev, comparisonMonths: months }));
                  }}
                  className={`rounded-xl px-2 py-2.5 text-center text-xs font-bold ${settings.comparisonMonths === months ? 'bg-primary text-on-primary' : 'border border-outline-variant/45 text-on-background'}`}
                >
                  {months} mo
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Answer engines</p>
            <h2 className="mt-2 font-headline text-lg font-semibold text-on-background">Which engines to report on</h2>
            <p className="mt-1 text-[12.5px] text-on-surface-variant">
              An engine with no measurement for the period is omitted — nothing is ever shown at 0% because it was not run.
            </p>
            <div className="mt-2">
              {ENGINES.map((engine) => (
                <button
                  key={engine.key}
                  type="button"
                  onClick={() => toggleEngine(engine.key)}
                  data-testid={`engine-${engine.key}`}
                  className="flex w-full items-center gap-3 border-t border-outline-variant/25 py-2.5 text-left first:border-t-0"
                >
                  <Check on={settings.engines[engine.key]} />
                  <span className="text-[13px] font-semibold text-on-background">{engine.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Truthful curation</p>
            <h2 className="mt-2 font-headline text-lg font-semibold text-on-background">Which evidence to present</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-on-surface-variant">Lead with the work the agency is accountable for. Any selection is named in the scope statement and versioned with the report.</p>
            {previewSnapshot ? (
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Buyer questions</p>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-outline-variant/30 px-3">
                    {previewSnapshot.availableQuestions.map((question) => {
                      const on = settings.promptKeys.length === 0 || settings.promptKeys.includes(question.queryKey);
                      return <button key={question.queryKey} type="button" onClick={() => togglePrompt(question.queryKey)} className="flex w-full items-start gap-2 border-t border-outline-variant/20 py-2.5 text-left first:border-t-0"><Check on={on} /><span className="text-[12px] font-semibold leading-snug text-on-background">{question.queryText}</span></button>;
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Competitors</p>
                  <div className="mt-2 rounded-xl border border-outline-variant/30 px-3">
                    {previewSnapshot.availableCompetitors.length > 0 ? previewSnapshot.availableCompetitors.map((competitor) => {
                      const on = settings.competitors.length === 0 || settings.competitors.includes(competitor.name);
                      return <button key={competitor.name} type="button" onClick={() => toggleCompetitor(competitor.name)} className="flex w-full items-center gap-2 border-t border-outline-variant/20 py-2.5 text-left first:border-t-0"><Check on={on} /><span className="text-[12px] font-semibold text-on-background">{competitor.name}</span></button>;
                    }) : <p className="py-3 text-xs text-on-surface-variant">No competing domain appeared in this snapshot.</p>}
                  </div>
                </div>
              </div>
            ) : <p className="mt-4 rounded-xl bg-surface-container-low p-4 text-xs text-on-surface-variant">A verified snapshot is required before evidence can be selected.</p>}
          </section>

          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Contents</p>
            <h2 className="mt-2 font-headline text-lg font-semibold text-on-background">What goes in the report</h2>
            <p className="mt-1 text-[12.5px] text-on-surface-variant">Every item is data GEO-Pulse already collects.</p>

            {GROUPS.map((group) => (
              <div key={group.title}>
                <p className="pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const locked = isLockedSection(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleSection(item.key)}
                      disabled={locked}
                      data-testid={`section-${item.key}`}
                      aria-pressed={settings.sections[item.key]}
                      className={`flex w-full items-start gap-3 border-t border-outline-variant/25 py-2.5 text-left ${
                        locked ? 'cursor-default' : ''
                      }`}
                    >
                      <Check on={settings.sections[item.key]} locked={locked} />
                      <span className="flex-1">
                        <span className="block text-[13px] font-semibold leading-snug text-on-background">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-on-surface-variant">
                          {item.help}
                          {item.conditional ? ' Only renders when the period produced this data.' : ''}
                        </span>
                      </span>
                      <span className="mt-0.5 flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded bg-surface-container-low px-1.5 py-0.5 text-[9.5px] font-semibold text-on-surface-variant">
                          {item.source}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/70">
                          {item.surfaces.length === 2 ? 'both' : item.surfaces[0] === 'pdf' ? 'PDF' : 'summary'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}

            <div className="mt-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
                Not available yet
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-on-surface-variant">
                These are collected but not yet rendered in either artifact, so there is nothing to switch on.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {PLANNED_SECTIONS.map((planned) => (
                  <li key={planned.label} className="text-[11.5px] leading-snug text-on-surface-variant">
                    <span className="font-semibold text-on-background/70">{planned.label}</span> — {planned.blockedBy}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* ---------------- live preview ---------------- */}
        {paneOpen ? (
          <div className="lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-float">
              <div className="flex items-center gap-2 border-b border-outline-variant/30 px-3 py-2.5">
                <span className="rounded-md bg-surface-container px-2.5 py-1 text-[11.5px] font-semibold text-on-background">
                  Preview
                </span>
                <button
                  type="button"
                  onClick={() => setPaneOpen(false)}
                  data-testid="collapse-preview"
                  aria-label="Collapse preview"
                  className="ml-auto grid h-7 w-7 place-items-center rounded-md border border-outline-variant/50 text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_right</span>
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto bg-surface-container px-3 py-3" data-testid="preview-body">
                <ReportPreviewPage
                  snapshot={previewSnapshot}
                  settings={settings}
                  brandName={brandName}
                  brandColor={brandColor}
                />
                <p className="mt-2.5 text-[10.5px] leading-snug text-on-surface-variant">
                  {previewSnapshot
                    ? `The exact page ${previewSnapshot.clientName} receives, using their stored canonical snapshot. Draft content switches reflow this same renderer.`
                    : 'Nothing is generated to build this — it composes the last stored period.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:sticky lg:top-6">
            <div className="flex min-h-[220px] w-[46px] flex-col items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest py-2.5 shadow-float">
              <button
                type="button"
                onClick={() => setPaneOpen(true)}
                data-testid="expand-preview"
                aria-label="Expand preview"
                className="grid h-7 w-7 place-items-center rounded-md border border-outline-variant/50 text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden>chevron_left</span>
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant [writing-mode:vertical-rl]">
                Preview
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
