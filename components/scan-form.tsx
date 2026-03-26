'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { scanLoadingJourney } from '@/lib/client/loading-journeys';
import { getAttributionContext } from '@/lib/client/attribution';

type ScanFormProps = {
  siteKey: string;
  defaultUrl?: string;
};

function messageFromScanError(data: unknown): string {
  if (!data || typeof data !== 'object' || !('error' in data)) return 'Scan failed';
  const err = (data as { error?: unknown }).error;
  if (!err || typeof err !== 'object') return 'Scan failed';
  const code = 'code' in err && typeof (err as { code?: string }).code === 'string' ? (err as { code: string }).code : '';
  const raw = (err as { message?: unknown }).message;
  let detail = '';
  if (typeof raw === 'string') detail = raw;
  else if (raw !== undefined) detail = JSON.stringify(raw);
  const prefix = code ? `${code}: ` : '';
  return `${prefix}${detail || 'Scan failed'}`;
}

export function ScanForm({ siteKey, defaultUrl }: ScanFormProps) {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl ?? '');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useLongWaitEffect(loading, scanLoadingJourney);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Please complete the verification.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, turnstileToken: token, ...getAttributionContext() }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(messageFromScanError(data));
        setLoading(false);
        return;
      }
      const id =
        data && typeof data === 'object' && 'scanId' in data
          ? String((data as { scanId: string }).scanId)
          : '';
      if (!id) {
        setError('Invalid response');
        setLoading(false);
        return;
      }
      router.push(`/results/${id}`);
    } catch {
      setError('We couldn\u2019t reach that site. Check the URL and try again.');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-2 shadow-float md:flex-row md:items-stretch">
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="Enter your website URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Website URL"
          className="min-h-[52px] flex-grow rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-6 py-4 font-body text-base text-on-surface outline-none ring-0 transition focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-xl bg-primary px-8 py-4 text-sm font-medium text-on-primary transition-all duration-200 hover:bg-primary-dim disabled:opacity-50 md:min-w-[160px]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Running diagnostic…
            </span>
          ) : 'Run diagnostic'}
        </button>
      </div>
      <div className="min-h-[65px] flex justify-center">
        <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} />
      </div>
      {error ? <p className="text-center text-sm text-error">{error}</p> : null}
    </form>
  );
}
