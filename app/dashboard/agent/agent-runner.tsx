'use client';

import { useActionState, useState } from 'react';
import {
  applyFixesAsPrAction,
  runFixAgentCompleteAction,
  setAutoPrEnabledAction,
  type AutoPrToggleState,
  type FixAgentCompleteState,
  type FixAgentPrState,
} from './actions';

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

/**
 * Standing permission for the agent to open pull requests.
 *
 * Submitting the form is the authorization — it is saved server-side against the signed-in user,
 * so the agent never opens a PR on a run the user has not opted into.
 */
function AutoPrToggle({ initial }: { initial: boolean }) {
  const [state, action, pending] = useActionState<AutoPrToggleState, FormData>(setAutoPrEnabledAction, {
    enabled: initial,
    message: null,
  });

  return (
    <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
      <form action={action} className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold text-on-background">
            Open the pull request for me
          </p>
          <p className="mt-0.5 font-sans text-xs text-on-surface-variant">
            When this is on, a run goes all the way: fresh audit, fixes, and the PR on your connected
            repo. It only ever opens a pull request — never merges, and never overwrites a file that
            already exists.
          </p>
        </div>
        <input type="hidden" name="enabled" value={state.enabled ? 'false' : 'true'} />
        <button
          type="submit"
          disabled={pending}
          role="switch"
          aria-checked={state.enabled}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
            state.enabled ? 'bg-primary' : 'bg-surface-container-high'
          }`}
        >
          <span className="sr-only">Open the pull request for me</span>
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition ${
              state.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </form>
      {state.message ? (
        <p className="mt-2 font-sans text-sm text-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function AgentRunner({ autoPrEnabled = false }: { autoPrEnabled?: boolean }) {
  const [state, formAction, pending] = useActionState<FixAgentCompleteState, FormData>(
    runFixAgentCompleteAction,
    { status: 'idle' }
  );
  const [prState, prAction, prPending] = useActionState<FixAgentPrState, FormData>(
    applyFixesAsPrAction,
    { status: 'idle' }
  );

  return (
    <div className="space-y-5">
      <AutoPrToggle initial={autoPrEnabled} />

      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 font-sans text-sm font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-60"
        >
          <span
            className={`material-symbols-outlined text-[18px] ${pending ? 'animate-spin' : ''}`}
            aria-hidden
          >
            {pending ? 'progress_activity' : 'auto_fix_high'}
          </span>
          {pending ? 'Auditing, then fixing…' : 'Run the agent'}
        </button>
        <p className="mt-2 font-sans text-xs text-on-surface-variant">
          Runs a fresh audit first, so the fixes match your site as it is right now.
        </p>
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
            {state.score != null ? ` (score ${state.score})` : ''}.
          </p>

          {state.pr ? (
            <p className="rounded-xl bg-surface-container-low px-4 py-3 font-sans text-sm text-on-background">
              ✅ Opened{' '}
              <a
                href={state.pr.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline"
              >
                PR #{state.pr.number}
              </a>{' '}
              on your repo. Review and merge when you are happy with it.
            </p>
          ) : null}

          {/* The run succeeded even though the PR did not — say so, and keep the fixes usable. */}
          {state.prError ? (
            <p className="rounded-xl bg-error/10 px-4 py-3 font-sans text-sm text-error" role="alert">
              The fixes are ready, but the PR could not be opened: {state.prError}{' '}
              <a href="/dashboard/connectors" className="font-semibold underline">
                Open Connectors
              </a>
            </p>
          ) : null}

          {/* Auto-PR off: the manual button stays, so a one-off PR does not need the toggle. */}
          {!state.autoPrEnabled && state.fixes.length > 0 ? (
            <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
              <form action={prAction} className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={prPending}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-on-background px-5 font-sans text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${prPending ? 'animate-spin' : ''}`}
                    aria-hidden
                  >
                    {prPending ? 'progress_activity' : 'merge'}
                  </span>
                  {prPending ? 'Opening a PR…' : 'Open a PR on my repo'}
                </button>
                <span className="font-sans text-xs text-on-surface-variant">
                  Opens a pull request — never merges or deploys.
                </span>
              </form>

              {prState.status === 'error' ? (
                <p className="mt-3 font-sans text-sm text-error" role="alert">
                  {prState.message}{' '}
                  <a href="/dashboard/connectors" className="font-semibold underline">
                    Open Connectors
                  </a>
                </p>
              ) : null}
              {prState.status === 'ok' ? (
                <p className="mt-3 font-sans text-sm text-on-background">
                  ✅ Opened{' '}
                  <a
                    href={prState.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline"
                  >
                    PR #{prState.number}
                  </a>{' '}
                  — {prState.filesWritten.length} file
                  {prState.filesWritten.length === 1 ? '' : 's'} committed.
                </p>
              ) : null}
            </div>
          ) : null}

          <ol className="space-y-4">
            {state.fixes.map((fix, i) => (
              <li
                key={`${fix.title}-${i}`}
                className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5"
              >
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
