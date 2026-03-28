'use client';

import { useActionState } from 'react';
import { useLongWaitEffect } from '@/components/long-wait-provider';
import { loginLoadingJourney } from '@/lib/client/loading-journeys';
import { sendMagicLink, type LoginActionState } from './actions';

type Props = {
  readonly nextPath: string;
};

export function LoginForm({ nextPath }: Props) {
  const [state, formAction, pending] = useActionState(sendMagicLink, null);
  useLongWaitEffect(pending, loginLoadingJourney);

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
          placeholder="you@company.com"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition hover:bg-primary-dim disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {state?.ok === true ? (
        <p className="font-body text-sm text-tertiary-dim">{state.message}</p>
      ) : null}
      {state?.ok === false ? <p className="font-body text-sm text-error">{state.message}</p> : null}
    </form>
  );
}
