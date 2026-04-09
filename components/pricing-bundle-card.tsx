'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLongWaitEffect } from '@/components/long-wait-provider';

const E2E_BYPASS_TURNSTILE =
  process.env['NEXT_PUBLIC_E2E_BYPASS_TURNSTILE'] === '1' &&
  process.env.NODE_ENV !== 'production';

function isTurnstileBypassEnabled(): boolean {
  if (!E2E_BYPASS_TURNSTILE) return false;
  if (typeof window === 'undefined') return true;

  const maybeWindow = window as typeof window & {
    __GEO_PULSE_DISABLE_E2E_TURNSTILE_BYPASS__?: boolean;
  };
  return maybeWindow.__GEO_PULSE_DISABLE_E2E_TURNSTILE_BYPASS__ !== true;
}

function turnstileWidgetErrorMessage(errorCode: string | number | undefined): string {
  const code = String(errorCode ?? '').trim();
  if (code === '110200') {
    return 'Verification is blocked for this domain. The Turnstile widget must allow this hostname.';
  }
  if (code === '110100' || code === '110110' || code === '400020') {
    return 'Verification is misconfigured (invalid site key). Contact support.';
  }
  if (code === '400070') {
    return 'Verification is misconfigured (site key disabled). Contact support.';
  }
  return code ? `Verification failed (${code}). Refresh and try again.` : 'Verification failed. Refresh and try again.';
}

function formatSubscribeErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object' || !('error' in data)) {
    return 'Checkout could not be started. Please try again.';
  }
  const err = (data as { error?: { code?: string; message?: unknown } }).error;
  if (!err) return 'Checkout could not be started. Please try again.';
  const raw = err.message;
  if (typeof raw === 'string') return raw;
  if (raw !== undefined) {
    try {
      return JSON.stringify(raw);
    } catch {
      return err.code ?? 'Checkout could not be started. Please try again.';
    }
  }
  return err.code ?? 'Checkout could not be started. Please try again.';
}

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
  /** Cloudflare Turnstile site key (empty if not configured). Required for paid checkout except E2E bypass. */
  readonly turnstileSiteKey: string;
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
  turnstileSiteKey,
}: PricingBundleCardProps) {
  const [isPending, startTransition] = useTransition();
  const sp = useSearchParams();
  const bypassTurnstile = isTurnstileBypassEnabled();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    bypassTurnstile ? 'e2e-bypass-token' : null
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isAwaitingTurnstile, setIsAwaitingTurnstile] = useState(false);
  const [isTurnstileWidgetReady, setIsTurnstileWidgetReady] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const autoSubscribeFiredRef = useRef(false);

  const needsPaidCheckout = !isFree && !isCurrentPlan;
  const turnstileConfigured = bypassTurnstile || Boolean(turnstileSiteKey.trim());

  useEffect(() => {
    setTurnstileToken((current) => {
      if (bypassTurnstile) return current ?? 'e2e-bypass-token';
      return current === 'e2e-bypass-token' ? null : current;
    });
  }, [bypassTurnstile]);

  // Auto-subscribe if redirected back here after login with ?autosubscribe=1&bundle=X
  const autoSubscribe =
    needsPaidCheckout &&
    sp.get('autosubscribe') === '1' &&
    sp.get('bundle') === bundleKey;

  function resetTurnstile(): void {
    setTurnstileToken(bypassTurnstile ? 'e2e-bypass-token' : null);
    setIsAwaitingTurnstile(false);
    turnstileRef.current?.reset();
  }

  function requestTurnstileToken(): boolean {
    if (bypassTurnstile) return true; // already has a token
    if (!turnstileRef.current) return false;
    turnstileRef.current?.execute();
    setIsAwaitingTurnstile(true);
    return true;
  }

  function effectiveToken(): string | null {
    if (bypassTurnstile) return turnstileToken ?? 'e2e-bypass-token';
    return turnstileToken?.trim() ? turnstileToken : null;
  }

  async function postSubscribe(tokenStr: string): Promise<void> {
    const res = await fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleKey, turnstileToken: tokenStr }),
    });

    const data: unknown = await res.json().catch(() => null);
    const url =
      data && typeof data === 'object' && 'url' in data && typeof (data as { url?: unknown }).url === 'string'
        ? (data as { url: string }).url
        : null;

    if (!res.ok || !url) {
      autoSubscribeFiredRef.current = false;
      setCheckoutError(formatSubscribeErrorMessage(data));
      resetTurnstile();
      return;
    }

    window.location.href = url;
  }

  useEffect(() => {
    if (!autoSubscribe || !isAuthenticated || autoSubscribeFiredRef.current) return;
    const t = effectiveToken();
    if (!t) {
      return;
    }
    setIsAwaitingTurnstile(false);
    autoSubscribeFiredRef.current = true;
    startTransition(async () => {
      try {
        await postSubscribe(t);
      } catch {
        setCheckoutError('Something went wrong. Please try again.');
        autoSubscribeFiredRef.current = false;
        resetTurnstile();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveToken derived from turnstileToken / bypass
  }, [autoSubscribe, isAuthenticated, turnstileToken, bypassTurnstile, bundleKey]);

  useEffect(() => {
    if (!autoSubscribe || !isAuthenticated || autoSubscribeFiredRef.current) return;
    if (!isTurnstileWidgetReady) return;
    if (effectiveToken()) return;
    requestTurnstileToken();
  }, [autoSubscribe, isAuthenticated, isTurnstileWidgetReady, turnstileToken, bypassTurnstile, bundleKey]);

  useLongWaitEffect(isPending, {
    title: trialDays > 0 ? 'Starting your free trial…' : 'Setting up checkout…',
    description: 'Preparing your Stripe checkout session.',
    steps: ['Verifying your account', 'Creating checkout session', 'Redirecting to Stripe…'],
    delayMs: 800,
  });

  function handleSubscribe() {
    setCheckoutError(null);
    if (!isAuthenticated) {
      window.location.href = `/login?mode=signup&next=/pricing&bundle=${bundleKey}`;
      return;
    }

    if (needsPaidCheckout && !turnstileConfigured) {
      setCheckoutError('Subscription checkout is not available (verification not configured). Contact support.');
      return;
    }

    const t = effectiveToken();
    if (needsPaidCheckout && !t) {
      // Token not ready yet — trigger Turnstile and proceed automatically on success
      if (!requestTurnstileToken()) {
        setCheckoutError('Verification is still loading. Please try again in a moment.');
      }
      return;
    }

    startTransition(async () => {
      try {
        await postSubscribe(t!);
      } catch {
        setCheckoutError('Something went wrong. Please try again.');
        resetTurnstile();
      }
    });
  }

  const ctaLabel = isCurrentPlan
    ? 'Current plan'
    : trialDays > 0
      ? `Start free ${trialDays}-day trial`
      : 'Subscribe';

  return (
    <article className={`flex flex-col rounded-2xl bg-surface-container-low p-8 shadow-float${!isFree ? ' border-t-2 border-gold/40' : ''}`}>
      {/* Header */}
      <div>
        <p className="font-label text-xs font-semibold uppercase tracking-widest text-primary">
          {name}
        </p>
        <h2 className="mt-3 font-sans text-3xl font-bold text-on-background">{priceLabel}</h2>
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
          <div className="flex flex-col gap-3">
            {needsPaidCheckout && turnstileSiteKey.trim() && !bypassTurnstile ? (
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                options={{ execution: 'execute' }}
                onWidgetLoad={() => {
                  setIsTurnstileWidgetReady(true);
                  if (autoSubscribe && isAuthenticated && !autoSubscribeFiredRef.current) {
                    requestTurnstileToken();
                  }
                }}
                onSuccess={(next) => {
                  setTurnstileToken(next);
                  setCheckoutError(null);
                  if (isAwaitingTurnstile) {
                    setIsAwaitingTurnstile(false);
                    startTransition(async () => {
                      try {
                        await postSubscribe(next);
                      } catch {
                        setCheckoutError('Something went wrong. Please try again.');
                        resetTurnstile();
                      }
                    });
                  }
                }}
                onExpire={() => {
                  setTurnstileToken(null);
                  setIsAwaitingTurnstile(false);
                }}
                onError={(code) => {
                  setTurnstileToken(null);
                  setIsAwaitingTurnstile(false);
                  setCheckoutError(turnstileWidgetErrorMessage(code));
                }}
              />
            ) : null}
            {checkoutError ? (
              <p className="font-body text-xs text-red-600 dark:text-red-400" role="alert">
                {checkoutError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={isPending || isAwaitingTurnstile}
              className="inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Preparing…' : isAwaitingTurnstile ? 'Verifying…' : ctaLabel}
            </button>
          </div>
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
