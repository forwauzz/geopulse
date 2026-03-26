'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef, useState } from 'react';
import { getAttributionContext } from '@/lib/client/attribution';

type Props = {
  siteKey: string;
  scanId: string;
};

function turnstileUserMessage(serverMessage: string): string {
  if (serverMessage.includes('timeout-or-duplicate')) {
    return 'Verification expired or was already used. Complete the checkbox again, then pay once.';
  }
  return serverMessage;
}

export function DeepAuditCheckout({ siteKey, scanId }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const submittingRef = useRef(false);

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
    const tokenToSend = token;
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, turnstileToken: tokenToSend, anonymous_id: getAttributionContext().anonymous_id }),
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
        setError('No checkout URL returned');
        resetTurnstile();
        return;
      }
      window.location.href = url;
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
      <h2 className="font-headline text-xl font-bold text-surface-container-lowest">Unlock the full picture</h2>
      <p className="font-body text-sm text-surface-container-low/80">
        Get the expanded multi-page audit with full check breakdowns, coverage details, and a prioritized action plan.
        One-time purchase, no subscription.
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-surface-container-low/70">
        <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">language</span> Multi-page crawl</li>
        <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">checklist</span> Priority action plan</li>
        <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">mail</span> PDF + email delivery</li>
        <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">code</span> Developer-ready fixes</li>
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
        {loading ? 'Redirecting…' : 'Get my full report \u2014 $29'}
      </button>
    </div>
  );
}
