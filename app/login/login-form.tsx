'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { loginLoadingJourney } from '@/lib/client/loading-journeys';
import { sendMagicLink, signInWithPassword, signUpWithPassword } from './actions';

type Props = {
  readonly nextPath: string;
  readonly isSignUp?: boolean;
  readonly bundleKey?: string;
};

export function LoginForm({ nextPath, isSignUp = false, bundleKey }: Props) {
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    null
  );
  const [signupState, signupAction, signupPending] = useActionState(
    signUpWithPassword,
    null
  );
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(
    sendMagicLink,
    null
  );

  useLongWaitEffect(passwordPending || signupPending || magicLinkPending, loginLoadingJourney);

  const signInHref = (() => {
    const params = new URLSearchParams();
    params.set('next', nextPath);
    if (bundleKey) {
      params.set('bundle', bundleKey);
    }
    return `/login?${params.toString()}`;
  })();

  if (isSignUp) {
    return (
      <div className="mt-8 max-w-xl">
        <form action={signupAction} className="flex flex-col gap-4 rounded-2xl bg-surface-container-low p-5">
          <input type="hidden" name="next" value={nextPath} />
          {bundleKey ? <input type="hidden" name="bundle" value={bundleKey} /> : null}
          <div>
            <h2 className="font-sans text-lg font-semibold text-on-background">Create your account</h2>
            <p className="mt-1 font-body text-sm text-on-surface-variant">
              Start here to continue to checkout for your selected plan.
            </p>
          </div>
          <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
            Name
            <input
              name="full_name"
              type="text"
              autoComplete="name"
              required
              className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
              placeholder="Your name"
            />
          </label>
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
              autoComplete="new-password"
              className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
            />
          </label>
          <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
            Confirm password
            <input
              name="confirm_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
            />
          </label>
          <button
            type="submit"
            disabled={signupPending}
            className="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
          >
            {signupPending ? 'Creating account...' : 'Sign up'}
          </button>
          {signupState?.ok === true ? (
            <p className="font-body text-sm text-tertiary-dim">{signupState.message}</p>
          ) : null}
          {signupState?.ok === false ? (
            <p className="font-body text-sm text-error">{signupState.message}</p>
          ) : null}
        </form>
        <p className="mt-4 font-body text-sm text-on-surface-variant">
          Already have an account?{' '}
          <Link href={signInHref} className="font-semibold text-tertiary hover:underline">
            Or sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 grid max-w-3xl gap-6 md:grid-cols-2">
      <form action={passwordAction} className="flex flex-col gap-4 rounded-2xl bg-surface-container-low p-5">
        <input type="hidden" name="next" value={nextPath} />
        {bundleKey ? <input type="hidden" name="bundle" value={bundleKey} /> : null}
        <div>
          <h2 className="font-sans text-lg font-semibold text-on-background">Password sign-in</h2>
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
          {bundleKey ? <input type="hidden" name="bundle" value={bundleKey} /> : null}
          {isSignUp ? <input type="hidden" name="mode" value="signup" /> : null}
          <div>
            <h2 className="font-sans text-lg font-semibold text-on-background">
              {isSignUp ? 'Get started with email' : 'Magic link'}
            </h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            {isSignUp
              ? 'No password needed — we\'ll email you a link to complete signup.'
              : 'Use this for normal customer recovery and existing report access.'}
          </p>
        </div>
        {isSignUp && (
          <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
            Name <span className="font-normal text-on-surface-variant">(optional)</span>
            <input
              name="full_name"
              type="text"
              autoComplete="name"
              className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
              placeholder="Your name"
            />
          </label>
        )}
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
          {magicLinkPending ? 'Sending...' : isSignUp ? 'Email me a sign-up link' : 'Email me a sign-in link'}
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
