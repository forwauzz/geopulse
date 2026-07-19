'use client';

import { useActionState, useState } from 'react';
import { runFixAgentAction, type FixAgentState } from './actions';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          },
          () => setCopied(false)
        );
      }}
      className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2.5 font-label text-[0.62rem] font-bold uppercase tracking-wider text-on-surface-variant transition hover:text-on-background"
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden>
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function AgentRunner() {
  const [state, formAction, pending] = useActionState<FixAgentState, FormData>(runFixAgentAction, {
    status: 'idle',
  });

  return (
    <div className="space-y-5">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 font-sans text-sm font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px] ${pending ? 'animate-spin' : ''}`} aria-hidden>
            {pending ? 'progress_activity' : 'auto_fix_high'}
          </span>
          {pending ? 'Agent is working…' : 'Ask the agent for my fixes'}
        </button>
      </form>

      {state.status === 'error' ? (
        <p className="rounded-xl bg-error/10 px-4 py-3 font-sans text-sm text-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ok' ? (
        <div className="space-y-4">
          <p className="font-sans text-sm text-on-surface-variant">
            {state.fixes.length} fix{state.fixes.length === 1 ? '' : 'es'} for{' '}
            <strong className="text-on-background">{state.domain}</strong>
            {state.score != null ? ` (score ${state.score})` : ''} — paste these in and re-run your audit.
          </p>
          <ol className="space-y-4">
            {state.fixes.map((fix, i) => (
              <li key={`${fix.title}-${i}`} className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-base font-bold text-on-background">
                      {i + 1}. {fix.title}
                    </p>
                    {fix.why ? (
                      <p className="mt-1 font-sans text-sm text-on-surface-variant">{fix.why}</p>
                    ) : null}
                  </div>
                  <CopyButton text={fix.snippet} />
                </div>
                {fix.where ? (
                  <p className="mt-3 font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                    Where: {fix.where}
                  </p>
                ) : null}
                <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-container-high p-3 font-mono text-xs leading-relaxed text-on-background">
                  <code>{fix.snippet}</code>
                </pre>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
