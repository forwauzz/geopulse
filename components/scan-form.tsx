'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ScanFormProps = {
  siteKey: string;
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

export function ScanForm({ siteKey }: ScanFormProps) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState<string | null>(null);
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
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, turnstileToken: token }),
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
      setError('Network error — check the dev server terminal for /api/scan errors.');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-xl flex-col gap-4">
      <label className="text-sm font-medium text-geo-ink" htmlFor="url">
        Website URL
      </label>
      <input
        id="url"
        name="url"
        type="url"
        required
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="rounded-lg border border-slate-200 px-4 py-3 text-base outline-none ring-geo-accent focus:ring-2"
      />
      <div className="min-h-[65px]">
        <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-geo-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? 'Scanning…' : 'Run free scan'}
      </button>
    </form>
  );
}
