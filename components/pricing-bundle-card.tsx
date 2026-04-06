'use client';

import { useEffect, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLongWaitEffect } from '@/components/long-wait-provider';

export type PricingBundleCardProps = {
  readonly bundleKey: string;
  readonly name: string;
  readonly tagline: string;
  readonly priceLabel: string;      // e.g. "Free", "$29/mo", "Price TBD"
  readonly trialDays: number;       // 0 = no trial
  readonly features: readonly string[];
  readonly isAuthenticated: boolean;
  readonly isCurrentPlan: boolean;  // user already has this subscription active/trialing
  readonly isFree: boolean;         // startup_lite — no Stripe, just link to scan
};

export function PricingBundleCard({
  bundleKey,
  name,
  tagline,
  priceLabel,
  trialDays,
  features,
  isAuthenticated,
  isCurrentPlan,
  isFree,
}: PricingBundleCardProps) {
  const [isPending, startTransition] = useTransition();
  const sp = useSearchParams();

  // Auto-subscribe if redirected back here after login with ?autosubscribe=1&bundle=X
  const autoSubscribe =
    !isFree &&
    !isCurrentPlan &&
    sp.get('autosubscribe') === '1' &&
    sp.get('bundle') === bundleKey;

  useEffect(() => {
    if (autoSubscribe) {
      handleSubscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubscribe]);

  useLongWaitEffect(isPending, {
    title: trialDays > 0 ? 'Starting your free trial…' : 'Setting up checkout…',
    description: 'Preparing your Stripe checkout session.',
    steps: ['Verifying your account', 'Creating checkout session', 'Redirecting to Stripe…'],
    delayMs: 800,
  });

  function handleSubscribe() {
    if (!isAuthenticated) {
      // Redirect to login, passing back to pricing with autosubscribe intent
      window.location.href = `/login?next=/pricing&bundle=${bundleKey}`;
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/billing/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bundleKey,
            // Turnstile is bypassed server-side when TURNSTILE_SECRET_KEY is not set in dev.
            // In production the page-level Turnstile widget supplies the token.
            // For now we pass an empty string — the server's verifyTurnstileToken handles
            // the dev-bypass path. Production usage wires in Turnstile via a form widget.
            turnstileToken: '',
          }),
        });

        const data = (await res.json()) as { url?: string; error?: { code: string; message: string } };

        if (!res.ok || !data.url) {
          const msg = data.error?.message ?? 'Checkout could not be started. Please try again.';
          alert(msg);
          return;
        }

        window.location.href = data.url;
      } catch {
        alert('Something went wrong. Please try again.');
      }
    });
  }

  const ctaLabel = isCurrentPlan
    ? 'Current plan'
    : trialDays > 0
      ? `Start free ${trialDays}-day trial`
      : 'Subscribe';

  return (
    <article className="flex flex-col rounded-2xl bg-surface-container-low p-8 shadow-float">
      {/* Header */}
      <div>
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">
          {name}
        </p>
        <h2 className="mt-3 font-headline text-3xl font-bold text-on-background">{priceLabel}</h2>
        {trialDays > 0 && !isCurrentPlan && (
          <p className="mt-1 font-body text-xs text-on-surface-variant">
            Free for {trialDays} days, then {priceLabel} after trial
          </p>
        )}
        <p className="mt-4 font-body text-on-surface-variant">{tagline}</p>
      </div>

      {/* Feature list */}
      <ul className="mt-6 grow space-y-3 font-body text-sm text-on-surface-variant">
        {features.map((feat) => (
          <li key={feat} className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary">check_circle</span>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-8">
        {isFree ? (
          <Link
            href="/"
            className="inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
          >
            Run free scan
          </Link>
        ) : isCurrentPlan ? (
          <span className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-medium text-primary">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Current plan
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={isPending}
            className="inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Preparing…' : ctaLabel}
          </button>
        )}

        {/* Fine print for paid plans */}
        {!isFree && !isCurrentPlan && (
          <p className="mt-3 font-body text-xs text-on-surface-variant/70">
            {trialDays > 0
              ? 'Credit card required. Cancel anytime before trial ends.'
              : 'Cancel anytime. Billed monthly.'}
          </p>
        )}
      </div>
    </article>
  );
}
