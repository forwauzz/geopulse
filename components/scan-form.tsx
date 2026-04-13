'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { scanLoadingJourney } from '@/lib/client/loading-journeys';
import { getAttributionContext } from '@/lib/client/attribution';

type ScanFormProps = {
  siteKey: string;
  defaultUrl?: string;
  agencyAccountId?: string | null;
  agencyClientId?: string | null;
  /** When set and user is a workspace member, scan is stored with `startup_workspace_id` for the startup dashboard. */
  startupWorkspaceId?: string | null;
  /**
   * `hero` — single compact row (wide input + primary action), for dashboard / landing hero use.
   * `default` — existing stacked / padded layout on `new-scan` and marketing.
   */
  variant?: 'default' | 'hero';
  /** Overrides the URL field placeholder (per-variant defaults apply when omitted). */
  placeholder?: string;
};

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

function turnstileErrorMessage(errorCode: string | number | undefined): string {
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

export function ScanForm({
  siteKey,
  defaultUrl,
  agencyAccountId,
  agencyClientId,
  startupWorkspaceId,
  variant = 'default',
  placeholder,
}: ScanFormProps) {
  const isHero = variant === 'hero';
  const resolvedPlaceholder =
    placeholder ?? (isHero ? 'Enter a website' : 'Enter your website URL');
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl ?? '');
  const bypassTurnstile = isTurnstileBypassEnabled();
  const [token, setToken] = useState<string | null>(
    bypassTurnstile ? 'e2e-bypass-token' : null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useLongWaitEffect(loading, scanLoadingJourney);

  useEffect(() => {
    setToken((current) => {
      if (bypassTurnstile) {
        return current ?? 'e2e-bypass-token';
      }
      return current === 'e2e-bypass-token' ? null : current;
    });
  }, [bypassTurnstile]);

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
        body: JSON.stringify({
          url,
          turnstileToken: token,
          agencyAccountId: agencyAccountId ?? null,
          agencyClientId: agencyClientId ?? null,
          startupWorkspaceId: startupWorkspaceId ?? null,
          ...getAttributionContext(),
        }),
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
    <form
      onSubmit={onSubmit}
      className={`mx-auto flex w-full flex-col ${isHero ? 'max-w-4xl gap-3' : 'max-w-3xl gap-4'}`}
    >
      <div
        className={
          isHero
            ? 'flex flex-col gap-3 overflow-hidden rounded-[1.75rem] border border-outline-variant/15 bg-surface-container-lowest p-3 shadow-float sm:flex-row sm:items-stretch'
            : 'flex flex-col gap-2 rounded-xl bg-surface-container-low p-2 shadow-float md:flex-row md:items-stretch'
        }
      >
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder={resolvedPlaceholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Website URL"
          className={
            isHero
              ? 'min-h-[72px] flex-grow rounded-2xl border border-transparent bg-surface-container-low px-6 py-5 font-body text-lg text-on-surface outline-none ring-0 transition placeholder:text-on-surface-variant/70 focus:border-tertiary/30 focus:ring-2 focus:ring-tertiary/25 sm:min-h-0 sm:flex-1'
              : 'min-h-[52px] flex-grow rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-6 py-4 font-body text-base text-on-surface outline-none ring-0 transition focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40'
          }
        />
        <button
          type="submit"
          disabled={loading}
          className={
            isHero
              ? 'flex shrink-0 items-center justify-center rounded-2xl bg-primary px-8 py-5 text-base font-semibold text-on-primary transition-all duration-200 hover:bg-primary-dim disabled:opacity-50 sm:min-w-[196px] sm:self-stretch sm:py-0'
              : 'shrink-0 rounded-xl bg-primary px-8 py-4 text-sm font-medium text-on-primary transition-all duration-200 hover:bg-primary-dim disabled:opacity-50 md:min-w-[160px]'
          }
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {isHero ? 'Running…' : 'Running diagnostic…'}
            </span>
          ) : (
            isHero ? 'Audit website' : 'Run diagnostic'
          )}
        </button>
      </div>
      {isHero ? (
        <p className="text-center font-body text-sm text-on-surface-variant">
          Enter any public homepage, category page, or product page to see how clearly machines can crawl and reuse it.
        </p>
      ) : null}
      {bypassTurnstile ? null : (
        <div className={`flex justify-center ${isHero ? 'min-h-[60px]' : 'min-h-[65px]'}`}>
          <Turnstile
            siteKey={siteKey}
            onSuccess={(nextToken) => {
              setToken(nextToken);
              setError(null);
            }}
            onExpire={() => setToken(null)}
            onError={(code) => {
              setToken(null);
              setError(turnstileErrorMessage(code));
            }}
          />
        </div>
      )}
      {error ? (
        <p
          className={`text-sm text-error ${isHero ? 'text-left sm:text-center' : 'text-center'}`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {isHero ? (
        <p className="text-center font-body text-xs uppercase tracking-[0.2em] text-on-surface-variant/90">
          If verification fails here, the current Turnstile widget usually does not allow this hostname yet.
        </p>
      ) : null}
    </form>
  );
}
