'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useState } from 'react';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { saveResultsLoadingJourney } from '@/lib/client/loading-journeys';
import { getAttributionContext } from '@/lib/client/attribution';

type EmailGateProps = {
  siteKey: string;
  scanId: string;
  url: string;
  score: number;
};

export function EmailGate({ siteKey, scanId, url, score }: EmailGateProps) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [emailDelivered, setEmailDelivered] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useLongWaitEffect(loading, saveResultsLoadingJourney);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Please complete the verification.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          url,
          score,
          scanId,
          turnstileToken: token,
          anonymous_id: getAttributionContext().anonymous_id,
          marketingConsent,
        }),
      });
      if (!res.ok) {
        const data: unknown = await res.json();
        const msg =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error?: { message?: string } }).error?.message ?? 'Could not save')
            : 'Could not save';
        setError(msg);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { emailDelivered?: boolean };
      setEmailDelivered(data.emailDelivered !== false);
      setDone(true);
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-6 text-on-background">
        <p className="font-headline font-semibold">Preview saved.</p>
        <p className="mt-2 font-body text-sm text-on-surface-variant">
          {emailDelivered
            ? 'We emailed this preview summary so you can come back to it later.'
            : 'Your preview is saved, but email delivery is temporarily unavailable. Bookmark this page so you can return to it.'}{' '}
          Paid full audits are still delivered to the email entered at checkout.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/60 p-6 md:p-8"
    >
      <h2 className="font-headline text-lg font-semibold text-on-background">Or save this preview for later</h2>
      <p className="font-body text-sm text-on-surface-variant">
        This is the lighter option. We&apos;ll save the preview you already unlocked so you can revisit it without starting over.
      </p>
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-surface outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
      />
      <label className="flex items-start gap-3 font-body text-sm text-on-surface-variant">
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(event) => setMarketingConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary"
        />
        <span>Send me occasional GEO visibility tips and product updates. Unsubscribe anytime.</span>
      </label>
      <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} />
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save this preview'}
      </button>
    </form>
  );
}
