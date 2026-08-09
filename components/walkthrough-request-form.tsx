'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { getAttributionContext } from '@/lib/client/attribution';

type Props = {
  readonly siteKey: string;
  readonly source: 'msp_solution' | 'outreach' | 'agency_solution' | 'walkthrough_page';
  readonly defaultWebsite?: string;
  readonly defaultCompany?: string;
  readonly compact?: boolean;
};

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function errorMessage(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: { message?: unknown } }).error?.message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'We could not save the request. Please try again.';
}

export function WalkthroughRequestForm({
  siteKey,
  source,
  defaultWebsite = '',
  defaultCompany = '',
  compact = false,
}: Props) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState(defaultCompany);
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(defaultWebsite);
  const [note, setNote] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmationDelivered, setConfirmationDelivered] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('Please complete the verification.');
      return;
    }

    setLoading(true);
    try {
      const attribution = getAttributionContext();
      const response = await fetch('/api/sales/walkthrough', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          company,
          email,
          website: normalizeWebsite(website),
          note: note || null,
          source,
          turnstileToken: token,
          ...attribution,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessage(data));
        turnstileRef.current?.reset();
        setToken(null);
        return;
      }
      setConfirmationDelivered(
        (data as { confirmationDelivered?: boolean }).confirmationDelivered !== false
      );
      setDone(true);
    } catch {
      setError('Network error. Please try again.');
      turnstileRef.current?.reset();
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6">
        <p className="font-sans text-lg font-semibold text-on-background">Request received.</p>
        <p className="mt-2 font-body text-sm leading-6 text-on-surface-variant">
          Elena will review the public site and reply with the most useful next step.
          {confirmationDelivered
            ? ' A confirmation is on its way to your inbox.'
            : ' Email confirmation is temporarily unavailable, but your request is safely recorded.'}
        </p>
        <Link
          href={`/?url=${encodeURIComponent(normalizeWebsite(website))}#audit`}
          className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 font-body text-sm font-semibold text-on-primary"
        >
          Run the free scan now
        </Link>
      </div>
    );
  }

  if (!siteKey) {
    return (
      <div className="rounded-2xl border border-error/20 bg-error/5 p-5 font-body text-sm text-error">
        Walkthrough requests are temporarily unavailable. You can still run the free audit.
      </div>
    );
  }

  const inputClass =
    'min-h-[46px] w-full rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-4 font-body text-sm text-on-background outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20';

  return (
    <form onSubmit={submit} className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="font-label text-xs font-semibold text-on-surface-variant">Your name</span>
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className="font-label text-xs font-semibold text-on-surface-variant">Company</span>
          <input
            name="company"
            autoComplete="organization"
            required
            minLength={2}
            maxLength={120}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="font-label text-xs font-semibold text-on-surface-variant">Work email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className="font-label text-xs font-semibold text-on-surface-variant">Website</span>
          <input
            name="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            required
            maxLength={2048}
            placeholder="yourmsp.com"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="font-label text-xs font-semibold text-on-surface-variant">
          What would make the walkthrough useful? <span className="font-normal">(optional)</span>
        </span>
        <textarea
          name="note"
          rows={compact ? 3 : 4}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${inputClass} py-3`}
          placeholder="For example: we want to understand why competitors appear in AI recommendations."
        />
      </label>
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onSuccess={setToken}
        onExpire={() => setToken(null)}
        onError={() => setToken(null)}
      />
      <p className="font-body text-xs leading-5 text-on-surface-variant">
        We use this information only to respond to your request. You are not enrolled in marketing
        email. See our <Link href="/privacy" className="underline hover:text-primary">privacy policy</Link>.
      </p>
      {error ? <p className="font-body text-sm text-error">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !token}
        className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-primary px-6 font-body text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Saving request…' : 'Request a focused walkthrough'}
      </button>
    </form>
  );
}
