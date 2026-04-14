'use client';

import { useActionState } from 'react';
import {
  createBenchmarkDomain,
  type BenchmarkDomainState,
} from '@/app/dashboard/benchmarks/actions';

const initialState: BenchmarkDomainState | null = null;

export function BenchmarkDomainForm() {
  const [state, formAction, pending] = useActionState(createBenchmarkDomain, initialState);

  return (
    <section className="mt-8 rounded-xl bg-surface-container-lowest p-5 shadow-float">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Add benchmark domain
          </h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Benchmark domains are managed separately from scans right now. Add a real site here
            before running an internal benchmark.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Site URL</span>
          <input
            name="siteUrl"
            type="url"
            required
            placeholder="https://example.com"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Display name</span>
          <input
            name="displayName"
            placeholder="Optional brand name"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Adding domain…' : 'Add domain'}
          </button>
          {state && !state.ok ? <p className="text-sm text-error">{state.message}</p> : null}
        </div>
      </form>
    </section>
  );
}
