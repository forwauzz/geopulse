'use client';

import { useActionState } from 'react';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { loginLoadingJourney } from '@/lib/client/loading-journeys';
import { sendMagicLink, signInWithPassword } from './actions';

type Props = {
  readonly nextPath: string;
};

export function LoginForm({ nextPath }: Props) {
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    null
  );
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(
    sendMagicLink,
    null
  );

  useLongWaitEffect(passwordPending || magicLinkPending, loginLoadingJourney);

  return (
    <div className="mt-8 grid max-w-3xl gap-6 md:grid-cols-2">
      <form action={passwordAction} className="flex flex-col gap-4 rounded-2xl bg-surface-container-low p-5">
        <input type="hidden" name="next" value={nextPath} />
        <div>
          <h2 className="font-headline text-lg font-semibold text-on-background">Password sign-in</h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Use this for agency or pilot accounts that have a Supabase password.
          </p>
        </div>
        <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
            placeholder="you@company.com"
          />
        </label>
        <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
          />
        </label>
        <button
          type="submit"
          disabled={passwordPending}
          className="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
        >
          {passwordPending ? 'Signing in...' : 'Sign in with password'}
        </button>
        {passwordState?.ok === false ? (
          <p className="font-body text-sm text-error">{passwordState.message}</p>
        ) : null}
      </form>

      <form action={magicLinkAction} className="flex flex-col gap-4 rounded-2xl bg-surface-container-low p-5">
        <input type="hidden" name="next" value={nextPath} />
        <div>
          <h2 className="font-headline text-lg font-semibold text-on-background">Magic link</h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Use this for normal customer recovery and existing report access.
          </p>
        </div>
        <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
            placeholder="you@company.com"
          />
        </label>
        <button
          type="submit"
          disabled={magicLinkPending}
          className="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
        >
          {magicLinkPending ? 'Sending...' : 'Email me a sign-in link'}
        </button>
        {magicLinkState?.ok === true ? (
          <p className="font-body text-sm text-tertiary-dim">{magicLinkState.message}</p>
        ) : null}
        {magicLinkState?.ok === false ? (
          <p className="font-body text-sm text-error">{magicLinkState.message}</p>
        ) : null}
      </form>
    </div>
  );
}
