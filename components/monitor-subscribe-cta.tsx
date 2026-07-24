'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { getAttributionContext } from '@/lib/client/attribution';

type Props = {
  siteKey: string;
  scanId: string;
  domain: string;
  accountEmail: string | null;
};

type Plan = 'monthly' | 'annual';

const VALUE_PROPS: readonly { icon: string; text: string }[] = [
  { icon: 'autorenew', text: 'Automatic re-audit every month' },
  { icon: 'trending_up', text: 'Your score tracked over time' },
  { icon: 'leaderboard', text: 'How you rank vs local competitors' },
  { icon: 'description', text: 'Full report delivered by email' },
];

export function MonitorSubscribeCTA({ siteKey, scanId, domain, accountEmail }: Props) {
  const [plan, setPlan] = useState<Plan>('monthly');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const submittingRef = useRef(false);

  function resetTurnstile(): void {
    setToken(null);
    turnstileRef.current?.reset();
  }

  async function subscribe(): Promise<void> {
    if (submittingRef.current) return;
    setError(null);
    if (!token) {
      setError('Please complete the verification.');
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/monitor/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId,
          plan,
          turnstileToken: token,
          ...getAttributionContext(),
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const raw =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error?: { message?: string } }).error?.message ?? 'Could not start checkout')
            : 'Could not start checkout';
        setError(raw);
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
      window.location.assign(url);
    } catch {
      setError('Network error');
      resetTurnstile();
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const priceLabel = plan === 'annual' ? '$390/year' : '$39/month';
  const priceSub = plan === 'annual' ? 'Two months free vs monthly' : 'Cancel anytime';

  return (
    <section className="rounded-2xl border border-primary/25 bg-surface-container-lowest p-6 md:p-8">
      <p className="font-label text-xs uppercase tracking-[0.22em] text-primary">Recurring AI visibility</p>
      <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">
        Keep {domain} monitored
      </h2>
      <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-on-surface-variant">
        Today&rsquo;s audit is a snapshot. Get a fresh scan and report every month so you can see what
        changed, what improved, and what to fix next.
      </p>

      <ul className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {VALUE_PROPS.map((v) => (
          <li key={v.text} className="flex items-center gap-2 font-body text-sm text-on-surface">
            <span className="material-symbols-outlined text-base text-primary" aria-hidden>{v.icon}</span>
            {v.text}
          </li>
        ))}
      </ul>

      {/* Billing toggle */}
      <div className="mt-6 inline-flex rounded-xl border border-outline-variant/30 bg-surface-container-low p-1">
        <button
          type="button"
          onClick={() => setPlan('monthly')}
          className={`rounded-lg px-4 py-2 font-sans text-sm font-semibold transition ${plan === 'monthly' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-background'}`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setPlan('annual')}
          className={`rounded-lg px-4 py-2 font-sans text-sm font-semibold transition ${plan === 'annual' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-background'}`}
        >
          Annual <span className="opacity-80">· save 17%</span>
        </button>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-headline text-3xl font-bold text-on-background">{priceLabel}</span>
        <span className="font-body text-sm text-on-surface-variant">{priceSub} · plus tax</span>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {accountEmail ? (
          <>
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={setToken}
              onExpire={() => setToken(null)}
            />
            {error ? <p className="font-body text-sm text-error">{error}</p> : null}
            <button
              type="button"
              onClick={() => void subscribe()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-sans text-sm font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base" aria-hidden>bolt</span>
              {loading ? 'Redirecting…' : `Subscribe — ${priceLabel}`}
            </button>
            <p className="text-center font-body text-xs text-on-surface-variant">
              Reports go to {accountEmail}. Manage or cancel anytime from Billing. Secure checkout by Stripe.
            </p>
          </>
        ) : (
          <>
            <Link
              href={`/login?mode=signup&next=${encodeURIComponent(`/results/${scanId}`)}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-sans text-sm font-semibold text-on-primary transition hover:bg-primary-dim"
            >
              <span className="material-symbols-outlined text-base" aria-hidden>person_add</span>
              Create free account to continue
            </Link>
            <p className="text-center font-body text-xs text-on-surface-variant">
              Your account keeps every report together and gives you one place to manage billing. No card until Stripe checkout.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
