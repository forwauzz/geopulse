'use client';

import { useActionState } from 'react';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { adminLoginLoadingJourney } from '@/lib/client/loading-journeys';
import Link from 'next/link';
import { signInAdminWithPassword, type AdminLoginState } from './actions';

type Props = {
  readonly nextPath: string;
};

export function AdminLoginForm({ nextPath }: Props) {
  const [state, formAction, pending] = useActionState(signInAdminWithPassword, null);
  useLongWaitEffect(pending, adminLoginLoadingJourney);

  return (
    <form action={formAction} className="mt-8 flex max-w-md flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
          placeholder="admin@company.com"
        />
      </label>
      <label className="flex flex-col gap-2 font-body text-sm font-medium text-on-background">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          minLength={8}
          className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 font-body text-base text-on-background outline-none ring-0 focus:border-tertiary/40 focus:ring-2 focus:ring-tertiary/40"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {state?.ok === false ? <p className="font-body text-sm text-error">{state.message}</p> : null}
      <p className="font-body text-sm text-on-surface-variant">
        Customer accounts use a magic link on{' '}
        <Link href="/login" className="font-medium text-tertiary hover:underline">
          /login
        </Link>
        .
      </p>
    </form>
  );
}
