'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { getAttributionContext } from '@/lib/client/attribution';
import { MONTHLY_MONITORING_OFFER } from '@/lib/shared/monitoring-offer';

type Props = {
  siteKey: string;
  scanId: string;
  domain: string;
  accountEmail: string | null;
};

const ENGINE_MARKS = [
  ['/media/logos/openai-icon.svg', 'ChatGPT'],
  ['/ai-engines/gemini.jpg', 'Gemini'],
  ['/media/logos/perplexity.svg', 'Perplexity'],
  ['/media/logos/copilot.svg', 'Copilot'],
] as const;

export function MonitorSubscribeCTA({ siteKey, scanId, domain, accountEmail }: Props) {
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
          plan: MONTHLY_MONITORING_OFFER.plan,
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

  return (
    <section
      id="monitoring"
      className="overflow-hidden rounded-3xl border border-primary/25 bg-surface-container-lowest shadow-float"
    >
      <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 font-label text-[0.65rem] font-bold uppercase tracking-[0.17em] text-primary">
              Best next step
            </span>
            <span className="text-xs text-on-surface-variant">for {domain}</span>
          </div>
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-on-background">
            Know when your AI visibility changes
          </h2>
          <p className="mt-3 max-w-xl font-body text-sm leading-6 text-on-surface-variant">
            Today&rsquo;s score is your baseline. GEO-Pulse checks again every month, shows what moved,
            and emails the actions most likely to improve how AI systems understand your business.
          </p>

          <ul className="mt-5 grid gap-2">
            {MONTHLY_MONITORING_OFFER.valueProps.map((value) => (
              <li key={value.text} className="flex items-center gap-2.5 font-body text-sm text-on-surface">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden>
                  {value.icon}
                </span>
                {value.text}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-end gap-2">
            <span className="font-headline text-4xl font-bold tracking-tight text-on-background">
              ${MONTHLY_MONITORING_OFFER.priceDollars}
            </span>
            <span className="pb-1 font-body text-sm text-on-surface-variant">/month · cancel anytime</span>
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
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-sans text-base font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden>monitoring</span>
                  {loading ? 'Opening secure checkout…' : 'Start monthly monitoring'}
                </button>
                <p className="font-body text-xs text-on-surface-variant">
                  Reports go to {accountEmail}. Secure checkout by Stripe.
                </p>
              </>
            ) : (
              <>
                <Link
                  href={`/login?mode=signup&next=${encodeURIComponent(`/results/${scanId}#monitoring`)}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-sans text-base font-semibold text-on-primary transition hover:bg-primary-dim"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden>arrow_forward</span>
                  Create account and start monitoring
                </Link>
                <p className="font-body text-xs text-on-surface-variant">
                  Free account first. You only enter payment details in Stripe.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="relative min-h-[360px] overflow-hidden bg-[#080d16] p-6 text-white md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(214,174,95,0.18),transparent_38%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Monthly report preview</p>
                <p className="mt-1 text-sm font-semibold">{domain}</p>
              </div>
              <span className="material-symbols-outlined text-[#d6ae5f]" aria-hidden>insights</span>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-white/55">AI readiness</p>
                  <p className="mt-1 text-4xl font-black tabular-nums">
                    68<span className="text-base text-white/45">/100</span>
                  </p>
                </div>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1 text-xs font-semibold text-emerald-300">
                  +7 this month
                </span>
              </div>
              <div className="mt-5 flex h-20 items-end gap-2" aria-label="Example monthly score trend">
                {[35, 43, 48, 55, 61, 68].map((height, index) => (
                  <span
                    key={height}
                    className={`flex-1 rounded-t ${index === 5 ? 'bg-[#d6ae5f]' : 'bg-white/20'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-white/55">
                Example visualization · your report uses your measured data
              </p>
            </div>

            <div className="mt-5">
              <p className="text-xs text-white/55">Built for the AI surfaces customers use</p>
              <div className="mt-3 flex items-center gap-3">
                {ENGINE_MARKS.map(([src, name]) => (
                  // eslint-disable-next-line @next/next/no-img-element -- static engine marks
                  <img
                    key={name}
                    src={src}
                    alt={`${name} logo`}
                    title={name}
                    className="h-9 w-9 rounded-lg bg-white object-contain p-1.5"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
