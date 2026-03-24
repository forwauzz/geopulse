'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef, useState } from 'react';

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
        body: JSON.stringify({ scanId, turnstileToken: tokenToSend }),
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
    <div className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50/80 p-6">
      <h2 className="text-lg font-semibold text-geo-ink">Deep audit PDF ($29)</h2>
      <p className="text-sm text-geo-mist">
        Get the full checklist as a downloadable PDF, delivered to the email you use in Stripe Checkout.
      </p>
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onSuccess={setToken}
        onExpire={() => setToken(null)}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        onClick={() => void startCheckout()}
        disabled={loading}
        className="rounded-lg bg-geo-accent px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {loading ? 'Redirecting…' : 'Pay securely with Stripe'}
      </button>
    </div>
  );
}
