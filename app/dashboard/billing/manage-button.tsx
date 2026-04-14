'use client';

import { useState, useTransition } from 'react';

export function ManageSubscriptionButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/billing/portal', { method: 'POST' });
        const data: unknown = await res.json().catch(() => null);
        const url =
          data &&
          typeof data === 'object' &&
          'url' in data &&
          typeof (data as { url?: unknown }).url === 'string'
            ? (data as { url: string }).url
            : null;

        if (!res.ok || !url) {
          const msg =
            data &&
            typeof data === 'object' &&
            'error' in data &&
            typeof (data as { error?: { message?: unknown } }).error?.message === 'string'
              ? (data as { error: { message: string } }).error.message
              : 'Could not open billing portal. Please try again.';
          setError(msg);
          return;
        }

        window.location.href = url;
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          open_in_new
        </span>
        {isPending ? 'Opening portal…' : 'Manage subscription'}
      </button>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
