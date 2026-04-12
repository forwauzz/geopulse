'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type State =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'redirecting'; href: string }
  | { status: 'error'; message: string };

/**
 * Automatically calls POST /api/startup/ensure-workspace on mount.
 *
 * - On success (workspace provisioned or already exists): refreshes the page
 * - On no_stripe_customer / no_stripe_subscription: redirects to /pricing
 * - On error: shows a retry button
 *
 * Used on startup pages that detect a missing workspace due to webhook failure.
 */
export function StartupWorkspaceEnsureTrigger() {
  const router = useRouter();
  const firedRef = useRef(false);
  const [state, setState] = useState<State>({ status: 'loading' });

  async function run() {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/startup/ensure-workspace', { method: 'POST' });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const kind =
          data && typeof data === 'object' && 'kind' in data
            ? String((data as { kind?: unknown }).kind)
            : null;
        if (kind === 'no_stripe_customer' || kind === 'no_stripe_subscription') {
          setState({ status: 'redirecting', href: '/pricing?onboarding=1' });
          router.push('/pricing?onboarding=1');
          return;
        }
        setState({ status: 'error', message: 'Could not set up workspace. Please try again.' });
        return;
      }

      const redirectTo =
        data && typeof data === 'object' && 'redirectTo' in data && typeof (data as { redirectTo?: unknown }).redirectTo === 'string'
          ? (data as { redirectTo: string }).redirectTo
          : null;

      if (redirectTo) {
        setState({ status: 'redirecting', href: redirectTo });
        router.push(redirectTo);
        return;
      }

      setState({ status: 'success' });
      router.refresh();
    } catch {
      setState({ status: 'error', message: 'Something went wrong. Please try again.' });
    }
  }

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === 'loading' || state.status === 'success' || state.status === 'redirecting') {
    return (
      <div className="flex items-center justify-center gap-3 py-4 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-[20px]" aria-hidden>
          progress_activity
        </span>
        Setting up your workspace…
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 text-sm">
      <p className="text-on-surface-variant">{state.message}</p>
      <button
        type="button"
        onClick={() => {
          firedRef.current = false;
          run();
        }}
        className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
