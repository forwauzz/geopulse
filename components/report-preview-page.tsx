'use client';

import { sectionRenderState, type ReportSectionKey, type ReportSettings } from '@/lib/server/report-settings';
import type { ReportPreviewPayload } from '@/lib/server/report-preview-payload';

/**
 * A page-shaped rendering of the signed-out client summary, driven by the same settings the
 * checklist writes.
 *
 * The section list and their ORDER mirror the live page at /client-summary/[clientId], read from
 * its DOM on 2026-08-01 — not from the mockups this was first built against. Two rows render side
 * by side there (visibility ‖ competitors, questions ‖ action plan), which is why those keys are
 * paired in the settings model.
 *
 * Fidelity caveat: this is a second renderer over the same content model, so it can drift. The
 * delivered artifact is the authority; this is the live view.
 */

function Section({
  id,
  title,
  state,
  emptyNote,
  children,
}: {
  readonly id: ReportSectionKey;
  readonly title: string;
  readonly state: 'render' | 'empty' | 'hidden';
  readonly emptyNote?: string;
  readonly children?: React.ReactNode;
}) {
  if (state === 'hidden') return null;
  return (
    <div
      data-testid={`preview-${id}`}
      data-state={state}
      className="border-t border-outline-variant/25 pt-2.5 first:border-t-0 first:pt-0"
    >
      <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">{title}</p>
      {state === 'empty' ? (
        <div className="mt-1.5 rounded border border-dashed border-outline-variant/70 px-2 py-2 text-center text-[8px] leading-snug text-on-surface-variant">
          {emptyNote ?? 'On, but no data for this period yet'}
        </div>
      ) : (
        <div className="mt-1.5">{children}</div>
      )}
    </div>
  );
}

export function ReportPreviewPage({
  payload,
  settings,
  brandName,
  brandColor,
}: {
  readonly payload: ReportPreviewPayload | null;
  readonly settings: ReportSettings;
  readonly brandName: string;
  readonly brandColor: string;
}) {
  if (!payload) {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest p-6 text-center">
        <p className="text-[11px] font-semibold text-on-background">Nothing measured yet</p>
        <p className="mt-1 text-[10px] leading-snug text-on-surface-variant">
          This client has no stored scan or measurement, so there is nothing to preview.
        </p>
      </div>
    );
  }

  const s = settings.sections;
  const st = (key: ReportSectionKey, hasData: boolean) => sectionRenderState(s[key], hasData);
  // Enabled is what the agency chose; measured is whether a run produced a figure. An engine
  // measured at 0% is still measured — only the charts drop unmeasured engines.
  const enabledEngines = payload.engines.filter(
    (engine) => settings.engines[engine.key as keyof typeof settings.engines] !== false
  );
  const engines = enabledEngines.filter((engine) => engine.measured);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm" data-testid="preview-page">
      <div className="h-[5px]" style={{ background: brandColor }} />
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <span className="font-headline text-[9.5px] font-semibold tracking-[0.16em] text-black">
            {brandName.toUpperCase()}
          </span>
          <span className="text-[7.5px] text-on-surface-variant">{payload.period}</span>
        </div>
        <p className="font-headline text-[15px] font-semibold leading-tight text-black">{payload.clientName}</p>
        {payload.topic ? (
          <p className="text-[8px] leading-snug text-on-surface-variant">
            {payload.domain}
            {payload.location ? ` · ${payload.location}` : ''}
          </p>
        ) : null}

        {/* scope — locked on */}
        <div
          data-testid="preview-scopeStatement"
          data-state="render"
          className="rounded border border-dashed border-outline-variant/60 bg-surface-container-low px-2 py-1.5 text-[7.5px] leading-relaxed text-on-surface-variant"
        >
          <b className="text-black">Scope</b> —{' '}
          {enabledEngines.length > 0 ? enabledEngines.map((e) => e.label).join(', ') : 'no engines selected'}
          {payload.questionsTracked ? ` · ${payload.questionsTracked} questions` : ''}
          {payload.trackedSince ? ` · since ${payload.trackedSince}` : ''}
        </div>

        <Section id="executiveSummary" title="Executive summary" state={st('executiveSummary', true)}>
          <div className="space-y-1">
            <div className="h-1 w-full rounded bg-surface-container" />
            <div className="h-1 w-[88%] rounded bg-surface-container" />
          </div>
        </Section>

        <Section
          id="headlineStats"
          title="Headline figures"
          state={st('headlineStats', payload.readinessScore !== null)}
        >
          <div className="flex gap-1.5">
            {[
              { label: 'readiness', value: payload.readinessScore !== null ? `${payload.readinessScore}/100` : '—' },
              { label: 'AI visibility', value: `${payload.combinedVisibilityPct}%` },
              { label: 'questions', value: String(payload.questionsTracked || '—') },
            ].map((tile) => (
              <div key={tile.label} className="flex-1 rounded border border-outline-variant/40 py-1.5 text-center">
                <div className="font-headline text-[12px] font-semibold text-black">{tile.value}</div>
                <div className="text-[6.5px] text-on-surface-variant">{tile.label}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Rendered as a pair on the live page — the settings model keeps them in lockstep. */}
        <Section
          id="visibilityByEngine"
          title="Visibility by AI platform"
          state={st('visibilityByEngine', engines.length > 0)}
        >
          <div className="space-y-1.5">
            {engines.map((engine) => (
              <div key={engine.key} className="flex items-center gap-2">
                <span className="w-[52px] shrink-0 text-[7.5px] font-semibold text-black">{engine.label}</span>
                <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-container">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(1, engine.visibilityPct)}%`, background: brandColor }}
                  />
                </span>
                <span className="w-[30px] text-right text-[7.5px] font-semibold text-black">
                  {engine.visibilityPct}%
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="competitorsTracked"
          title="Competitors tracked"
          state={st('competitorsTracked', payload.competitorSet.length > 0)}
        >
          <div className="flex flex-wrap gap-1">
            {payload.competitorSet.slice(0, 4).map((domain) => (
              <span
                key={domain}
                className="rounded-full bg-surface-container px-1.5 py-0.5 text-[6.5px] text-on-surface-variant"
              >
                {domain}
              </span>
            ))}
          </div>
        </Section>

        <Section
          id="buyerQuestions"
          title="What buyers are asking AI"
          state={st('buyerQuestions', payload.questionsTracked > 0)}
        >
          <div className="space-y-1">
            <div className="h-1 w-full rounded bg-surface-container" />
            <div className="h-1 w-[94%] rounded bg-surface-container" />
            <div className="h-1 w-[97%] rounded bg-surface-container" />
          </div>
        </Section>

        <Section id="priorityActionPlan" title="Priority action plan" state={st('priorityActionPlan', true)}>
          <div className="space-y-1">
            <div className="h-1 w-[90%] rounded bg-surface-container" />
            <div className="h-1 w-[82%] rounded bg-surface-container" />
          </div>
        </Section>

        <Section
          id="measurementReceipts"
          title="What the AI answers actually showed"
          state={st('measurementReceipts', engines.length > 0)}
        >
          <div className="flex gap-1.5">
            {engines.slice(0, 3).map((engine) => (
              <div key={engine.key} className="flex-1 rounded border border-outline-variant/40 py-1.5 text-center">
                <div className="font-headline text-[11px] font-semibold text-black">{engine.visibilityPct}%</div>
                <div className="text-[6.5px] text-on-surface-variant">{engine.label}</div>
              </div>
            ))}
          </div>
        </Section>

        <div
          data-testid="preview-methodology"
          data-state="render"
          className="border-t border-outline-variant/25 pt-2.5"
        >
          <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
            Methodology and definitions
          </p>
          <div className="mt-1.5 h-1 w-full rounded bg-surface-container" />
        </div>

        <div className="flex justify-end border-t border-outline-variant/30 pt-1.5">
          <span className="text-[6.5px] text-on-surface-variant">Measurement by GEO-Pulse</span>
        </div>
      </div>
    </div>
  );
}
