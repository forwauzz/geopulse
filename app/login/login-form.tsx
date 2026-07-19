'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { loginLoadingJourney } from '@/lib/client/loading-journeys';
import { signInWithPassword, signUpWithPassword } from './actions';

type Props = {
  readonly nextPath: string;
  readonly isSignUp?: boolean;
  readonly bundleKey?: string;
  readonly organizationName?: string;
  readonly websiteUrl?: string;
};

export function LoginForm({ nextPath, isSignUp = false, bundleKey, organizationName, websiteUrl }: Props) {
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    null
  );
  const [signupState, signupAction, signupPending] = useActionState(
    signUpWithPassword,
    null
  );

  useLongWaitEffect(passwordPending || signupPending, loginLoadingJourney);

  const signInHref = (() => {
    const params = new URLSearchParams();
    params.set('mode', 'signin'); // /login now defaults to sign-up; this reaches the password sign-in.
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
          {bundleKey ? (
            <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
              {bundleKey === 'agency_core' || bundleKey === 'agency_pro' ? 'Agency name' : 'Workspace name'}
              <input
                name="organization_name"
                type="text"
                required
                defaultValue={organizationName ?? ''}
                autoComplete="organization"
                className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
                placeholder={
                  bundleKey === 'agency_core' || bundleKey === 'agency_pro' ? 'Your agency' : 'Your workspace'
                }
              />
            </label>
          ) : null}
          {bundleKey && bundleKey !== 'agency_core' && bundleKey !== 'agency_pro' ? (
            <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
              Website URL
              <input
                name="website_url"
                type="text"
                required
                defaultValue={websiteUrl ?? ''}
                autoComplete="url"
                className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
                placeholder="https://yoursite.com"
              />
              <span className="text-xs text-on-surface-variant">The site you want to audit for AI search visibility</span>
            </label>
          ) : null}
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
            {signupPending ? 'Creating account...' : 'Sign up for free'}
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
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-md">
      <form action={passwordAction} className="flex flex-col gap-4 rounded-2xl bg-surface-container-low p-5">
        <input type="hidden" name="next" value={nextPath} />
        {bundleKey ? <input type="hidden" name="bundle" value={bundleKey} /> : null}
        <div>
          <h2 className="font-sans text-lg font-semibold text-on-background">Sign in</h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Enter your email and password.
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
      <p className="mt-4 font-body text-sm text-on-surface-variant">
        New here?{' '}
        <Link href="/login?mode=signup" className="font-semibold text-tertiary hover:underline">
          Sign up for free
        </Link>
      </p>
    </div>
  );
}
