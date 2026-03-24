'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useState } from 'react';

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
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <p className="font-medium">You are on the list.</p>
        <p className="mt-1 text-sm">We will follow up with deeper audit tips and product updates.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
      <h2 className="text-lg font-semibold text-geo-ink">Get the full breakdown</h2>
      <p className="text-sm text-geo-mist">
        Leave your email to receive the detailed checklist and product updates. We respect your inbox.
      </p>
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-slate-200 px-4 py-2 text-base outline-none ring-geo-accent focus:ring-2"
      />
      <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-geo-accent px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Send me the report'}
      </button>
    </form>
  );
}
