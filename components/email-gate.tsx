'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setDone(true);
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="rounded-xl bg-surface-container-low p-6 text-on-background">
        <p className="font-headline font-semibold">Saved.</p>
        <p className="mt-2 font-body text-sm text-on-surface-variant">
          We&apos;ll send you a summary and notify you when we add new checks for your site.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-6 md:p-8"
    >
      <h2 className="font-headline text-lg font-semibold text-on-background">Save your results</h2>
      <p className="font-body text-sm text-on-surface-variant">
        Enter your email to bookmark this report and get improvement tips as we add new checks.
      </p>
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-surface outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
      />
      <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} />
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save my results'}
      </button>
    </form>
  );
}
