'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { checkoutLoadingJourney } from '@/lib/client/loading-journeys';
import { getAttributionContext } from '@/lib/client/attribution';
import { type DeepAuditCheckoutMode } from '@/lib/shared/deep-audit-checkout-mode';
import { resolveDeepAuditCheckoutRedirect } from '@/lib/shared/deep-audit-checkout-redirect';

type Props = {
  siteKey: string;
  scanId: string;
  mode?: DeepAuditCheckoutMode;
};

function turnstileUserMessage(serverMessage: string): string {
  if (serverMessage.includes('timeout-or-duplicate')) {
    return 'Verification expired or was already used. Complete the checkbox again, then try once more.';
  }
  return serverMessage;
}

function getCheckoutModeCopy(mode: DeepAuditCheckoutMode): string {
  if (mode === 'startup_bypass') {
    return 'Run the expanded multi-page audit for this startup workspace without checkout. GEO-Pulse will queue the full report directly under the current workspace entitlement.';
  }
  if (mode === 'agency_bypass') {
    return 'Run the expanded multi-page audit for this agency client without checkout. GEO-Pulse will queue the full report directly under the current agency entitlement.';
  }
  return 'Get the expanded multi-page audit with full check breakdowns, coverage details, and a prioritized action plan. One-time purchase, no subscription. After payment, we send the finished report to the email collected in Stripe checkout.';
}

export function DeepAuditCheckout({ siteKey, scanId, mode = 'stripe' }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const submittingRef = useRef(false);
  const router = useRouter();
  useLongWaitEffect(loading, checkoutLoadingJourney);

  function resetTurnstile(): void {
    setToken(null);
    turnstileRef.current?.reset();
  }

  async function startCheckout() {
    if (submittingRef.current) return;
    setError(null);
    if (!token) {
      setError('Please complete the verification.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId,
          turnstileToken: token,
          anonymous_id: getAttributionContext().anonymous_id,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const raw =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error?: { message?: string } }).error?.message ?? 'Checkout failed')
            : 'Checkout failed';
        setError(turnstileUserMessage(raw));
        resetTurnstile();
        return;
      }

      const url =
        data && typeof data === 'object' && 'url' in data && typeof (data as { url?: unknown }).url === 'string'
          ? (data as { url: string }).url
          : null;
      if (!url) {
        setError('No checkout URL returned.');
        resetTurnstile();
        return;
      }

      const redirect = resolveDeepAuditCheckoutRedirect(url, window.location.origin);
      if (redirect.kind === 'replace') router.replace(redirect.href);
      else window.location.assign(redirect.href);
    } catch {
      setError('Network error');
      resetTurnstile();
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl bg-on-background p-6 text-surface md:p-8">
      <h2 className="font-headline text-xl font-bold text-surface-container-lowest">
        Unlock the full picture
      </h2>
      <p className="font-body text-sm text-surface-container-low/80">
        {getCheckoutModeCopy(mode)}
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-surface-container-low/70">
        <li className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">language</span> Multi-page crawl
        </li>
        <li className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">checklist</span> Priority action plan
        </li>
        <li className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">mail</span> PDF + email delivery
        </li>
        <li className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">code</span> Developer-ready fixes
        </li>
      </ul>
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onSuccess={setToken}
        onExpire={() => setToken(null)}
      />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={() => void startCheckout()}
        disabled={loading}
        className="rounded-xl bg-surface-container-lowest px-6 py-3.5 text-sm font-semibold text-on-background transition hover:bg-surface disabled:opacity-50"
      >
        {loading
          ? mode === 'agency_bypass' || mode === 'startup_bypass'
            ? 'Starting audit...'
            : 'Redirecting...'
          : mode === 'agency_bypass' || mode === 'startup_bypass'
            ? 'Run full audit now'
            : 'Continue to full audit - $29'}
      </button>
    </div>
  );
}
