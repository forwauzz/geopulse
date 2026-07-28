'use client';

import { useState } from 'react';

export function ScorecardShareControls({
  scorecardUrl,
}: {
  readonly scorecardUrl: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyScorecardUrl() {
    try {
      await navigator.clipboard.writeText(scorecardUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copyScorecardUrl()}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden>content_copy</span>
        {copyState === 'copied' ? 'Scorecard link copied' : 'Copy scorecard link'}
      </button>
      <a
        href={scorecardUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden>open_in_new</span>
        Preview scorecard
      </a>
      <span className={`text-xs ${copyState === 'failed' ? 'text-error' : 'text-on-surface-variant'}`} role="status">
        {copyState === 'failed'
          ? 'Copy failed. Open the scorecard and copy its address.'
          : 'Anyone with the private link can view it.'}
      </span>
    </div>
  );
}
