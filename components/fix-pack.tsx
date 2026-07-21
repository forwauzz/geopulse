'use client';

/**
 * Fix Pack card (spec C10): the report doesn't just diagnose — it hands over the fix.
 * A ready-to-use robots.txt (training choice is the owner's toggle) and copy-paste
 * Cloudflare rulesets, generated from the same registry the scan graded with.
 */
import { useMemo, useState } from 'react';
import {
  buildCloudflareBotSafelist,
  buildCloudflareSecurityHeaders,
  buildRobotsTxt,
  type TrainingChoice,
} from '@/lib/shared/fix-pack';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-2 font-body text-sm font-semibold text-on-background transition hover:bg-surface-container-low"
    >
      <span className="material-symbols-outlined text-base" aria-hidden>
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? 'Copied' : label}
    </button>
  );
}

export function FixPackCard({ domain }: { domain: string }) {
  const [training, setTraining] = useState<TrainingChoice>('block');
  const robots = useMemo(() => buildRobotsTxt({ domain, trainingChoice: training }), [domain, training]);
  const safelist = useMemo(() => buildCloudflareBotSafelist(), []);
  const headers = useMemo(() => buildCloudflareSecurityHeaders(), []);

  function downloadRobots() {
    const blob = new Blob([robots], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'robots.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border border-primary/20 bg-surface-container-lowest p-6">
      <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">Fix pack</p>
      <h2 className="mt-2 font-headline text-xl font-bold text-on-background">
        Ready-to-use fixes — not homework
      </h2>
      <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
        Generated for {domain} from this scan. Download, forward, or paste — no engineer required.
      </p>

      {/* robots.txt */}
      <div className="mt-5 rounded-xl bg-surface-container-low p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-sm font-semibold text-on-background">Your robots.txt</p>
          <div className="flex items-center gap-2">
            <span className="font-body text-xs text-on-surface-variant">AI training crawlers:</span>
            <button
              type="button"
              onClick={() => setTraining(training === 'block' ? 'allow' : 'block')}
              className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2.5 py-1 font-label text-[0.65rem] font-bold uppercase tracking-widest text-on-background transition hover:bg-surface-container-highest"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden>swap_horiz</span>
              {training === 'block' ? 'Blocked (opted out)' : 'Allowed'}
            </button>
          </div>
        </div>
        <p className="mt-1 font-body text-xs leading-5 text-on-surface-variant">
          AI search agents are always allowed — that is your visibility. The training toggle is a
          business choice with no effect on being cited.
        </p>
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-surface-container-lowest p-3 font-mono text-xs leading-5 text-on-surface-variant">
          {robots}
        </pre>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadRobots}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>download</span>
            Download robots.txt
          </button>
          <CopyButton text={robots} label="Copy contents" />
        </div>
      </div>

      {/* Cloudflare safelist */}
      <div className="mt-4 rounded-xl bg-surface-container-low p-4">
        <p className="font-body text-sm font-semibold text-on-background">{safelist.title}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 font-body text-sm leading-6 text-on-surface-variant">
          {safelist.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <pre className="mt-3 overflow-auto rounded-lg bg-surface-container-lowest p-3 font-mono text-xs leading-5 text-on-surface-variant">
          {safelist.expression}
        </pre>
        <p className="mt-2 font-body text-xs leading-5 text-on-surface-variant">{safelist.note}</p>
        <div className="mt-3">
          <CopyButton text={safelist.expression} label="Copy rule expression" />
        </div>
      </div>

      {/* Security headers */}
      <div className="mt-4 rounded-xl bg-surface-container-low p-4">
        <p className="font-body text-sm font-semibold text-on-background">{headers.title}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 font-body text-sm leading-6 text-on-surface-variant">
          {headers.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <pre className="mt-3 overflow-auto rounded-lg bg-surface-container-lowest p-3 font-mono text-xs leading-5 text-on-surface-variant">
          {headers.headers.map((h) => `${h.name}: ${h.value}`).join('\n')}
        </pre>
        <p className="mt-2 font-body text-xs leading-5 text-on-surface-variant">{headers.note}</p>
        <div className="mt-3">
          <CopyButton
            text={headers.headers.map((h) => `${h.name}: ${h.value}`).join('\n')}
            label="Copy headers"
          />
        </div>
      </div>
    </section>
  );
}
