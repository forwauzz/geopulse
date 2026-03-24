'use client';

import { useActionState } from 'react';
import { sendMagicLink, type LoginActionState } from './actions';

type Props = {
  readonly nextPath: string;
};

export function LoginForm({ nextPath }: Props) {
  const [state, formAction, pending] = useActionState(sendMagicLink, null);

  return (
    <form action={formAction} className="mt-8 flex max-w-md flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="flex flex-col gap-2 text-sm font-medium text-geo-ink">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-geo-mist/40 bg-white px-4 py-3 text-base text-geo-ink outline-none ring-geo-accent focus:ring-2"
          placeholder="you@company.com"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-geo-accent px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
      {state?.ok === true ? (
        <p className="text-sm text-green-700">{state.message}</p>
      ) : null}
      {state?.ok === false ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
