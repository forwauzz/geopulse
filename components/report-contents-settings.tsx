'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DEFAULT_REPORT_SETTINGS,
  describeOverrides,
  diffAgainstInherited,
  isLockedSection,
  type PartialReportSettings,
  type ReportEngineKey,
  type ReportSectionKey,
  type ReportSettings,
} from '@/lib/server/report-settings';
import type { ReportPreviewPayload } from '@/lib/server/report-preview-payload';
import { ReportPreviewPage } from '@/components/report-preview-page';

type SectionMeta = {
  readonly key: ReportSectionKey;
  readonly label: string;
  readonly help: string;
  readonly source: string;
};

/** Grouped for the checklist. Order here is the order of the report itself. */
const GROUPS: readonly { readonly title: string; readonly items: readonly SectionMeta[] }[] = [
  {
    title: 'Site health',
    items: [
      { key: 'readinessScore', label: 'Overall readiness score and grade', help: 'The headline number, out of 100.', source: 'scans.score' },
      { key: 'categoryBreakdown', label: 'Category breakdown', help: 'Readiness, extractability and trust, with weights. This is what explains a low visibility result.', source: 'categoryScores' },
      { key: 'holdingScoreDown', label: "What's holding the score down", help: 'The failing checks, in plain language, ordered by impact.', source: 'highlightedIssues' },
      { key: 'crawlDetail', label: 'Crawl and access detail', help: 'Robots status, pages fetched, render mode. Technical.', source: 'coverageSummary' },
    ],
  },
  {
    title: 'AI answer visibility',
    items: [
      { key: 'combinedVisibility', label: 'Combined visibility', help: 'One figure across every included engine.', source: 'citation_rate' },
      { key: 'perEngineBreakdown', label: 'Per-engine breakdown', help: 'Visibility on each engine separately.', source: '*_visibility_pct' },
      { key: 'namedVsLinked', label: 'Named vs linked', help: 'Whether engines mention the business, and whether they cite the site as a source.', source: 'brand_mention / url_citation' },
      { key: 'questionByQuestion', label: 'Question-by-question results', help: 'Every tracked question, cited or not, and who appeared instead.', source: 'prompts[]' },
      { key: 'averagePosition', label: 'Average position when cited', help: 'Empty until the client has a citation to average.', source: 'rankPosition' },
    ],
  },
  {
    title: 'Competitive',
    items: [
      { key: 'whoIsWinning', label: 'Who is winning these answers', help: 'Ranked by how many tracked questions each domain wins.', source: 'competitors[]' },
      { key: 'shareOfAnswers', label: 'Share of answers', help: "The client's share of all sources cited.", source: 'share_of_voice' },
      { key: 'trackedCompetitorSet', label: 'Tracked competitive set', help: 'Names the competitors being measured against.', source: 'competitor_list' },
    ],
  },
  {
    title: 'Framing',
    items: [
      { key: 'executiveSummary', label: 'Executive summary', help: 'A written opening that states the finding.', source: 'narrative' },
      { key: 'trendOverTime', label: 'Trend over time', help: 'Appears once there are two comparable periods.', source: 'period rollup' },
      { key: 'whatWeAreDoingNext', label: "What we're doing next", help: 'The open actions, presented as the plan.', source: 'outcome actions' },
    ],
  },
  {
    title: 'Always included',
    items: [
      { key: 'scopeStatement', label: 'Scope statement', help: 'Which engines, how many questions, tracked since when.', source: 'Always' },
      { key: 'methodology', label: 'Methodology and definitions', help: 'How each figure is measured, and the session-variance caveat.', source: 'Always' },
    ],
  },
];

const ENGINES: readonly { readonly key: ReportEngineKey; readonly label: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'google', label: 'Gemini' },
  { key: 'perplexity', label: 'Perplexity' },
  { key: 'claude', label: 'Claude' },
  { key: 'copilot', label: 'Copilot' },
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
  saveAction,
  previewPayload,
  brandName,
  brandColor,
}: {
  readonly agencyName: string;
  readonly initialSettings: ReportSettings;
  readonly initialOverride: PartialReportSettings;
  readonly saveAction: (override: PartialReportSettings) => Promise<{ ok: boolean; error?: string }>;
  readonly previewPayload: ReportPreviewPayload | null;
  readonly brandName: string;
  readonly brandColor: string;
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
    () => diffAgainstInherited(settings, DEFAULT_REPORT_SETTINGS),
    [settings]
  );
  const savedOverride = useMemo(
    () => diffAgainstInherited(savedSettings, DEFAULT_REPORT_SETTINGS),
    [savedSettings]
  );
  const initialCount = useMemo(() => describeOverrides(savedOverride).count, [savedOverride]);
  const dirty = useMemo(
    () => JSON.stringify(draftOverride) !== JSON.stringify(savedOverride),
    [draftOverride, savedOverride]
  );

  function toggleSection(key: ReportSectionKey) {
    if (isLockedSection(key)) return;
    setSaved(null);
    setSettings((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }));
  }

  function toggleEngine(key: ReportEngineKey) {
    setSaved(null);
    setSettings((prev) => ({ ...prev, engines: { ...prev.engines, [key]: !prev.engines[key] } }));
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
          {pending ? 'Saving…' : `Save ${agencyName} default`}
        </button>
      </div>

      <div className={`grid gap-4 ${paneOpen ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'lg:grid-cols-[minmax(0,1fr)_46px]'}`}>
        {/* ---------------- checklist ---------------- */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">Layout</p>
            <h2 className="mt-2 font-headline text-lg font-semibold text-on-background">One report or one per engine?</h2>
            <div className="mt-3 flex gap-2">
              {(['combined', 'per_engine'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSaved(null);
                    setSettings((p) => ({ ...p, layout: value }));
                  }}
                  data-testid={`layout-${value}`}
                  className={`flex-1 rounded-xl px-3 py-3 text-left ${
                    settings.layout === value
                      ? 'border-2 border-primary bg-surface-container-low'
                      : 'border border-outline-variant/45 bg-surface-container-lowest'
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-on-background">
                    {value === 'combined' ? 'One combined report' : 'Separate per engine'}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-snug text-on-surface-variant">
                    {value === 'combined'
                      ? 'All engines in a single PDF, combined figure plus per-engine breakdown.'
                      : 'One file per engine, per client, per month.'}
                  </span>
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
                        <span className="block text-[13px] font-semibold leading-snug text-on-background">{item.label}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-on-surface-variant">{item.help}</span>
                      </span>
                      <span className="mt-0.5 shrink-0 rounded bg-surface-container-low px-1.5 py-0.5 text-[9.5px] font-semibold text-on-surface-variant">
                        {item.source}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
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
                  payload={previewPayload}
                  settings={settings}
                  brandName={brandName}
                  brandColor={brandColor}
                />
                <p className="mt-2.5 text-[10.5px] leading-snug text-on-surface-variant">
                  {previewPayload
                    ? `The page ${previewPayload.clientName} receives, using their last measured period. A section switched off is removed; a section on with no data yet shows why.`
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
