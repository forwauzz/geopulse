'use client';

import { useActionState } from 'react';
import {
  createBenchmarkQuerySet,
  type BenchmarkQuerySetState,
} from '@/app/dashboard/benchmarks/actions';

const initialState: BenchmarkQuerySetState | null = null;

export function BenchmarkQuerySetForm() {
  const [state, formAction, pending] = useActionState(createBenchmarkQuerySet, initialState);

  return (
    <section className="mt-8 rounded-xl bg-surface-container-lowest p-5 shadow-float">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Add benchmark query set
          </h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Create a lightweight internal query set directly from admin. Add one benchmark query
            per line.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="brand-baseline"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Version</span>
          <input
            name="version"
            required
            placeholder="v1"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Vertical</span>
          <input
            name="vertical"
            placeholder="Optional vertical"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Description</span>
          <input
            name="description"
            placeholder="Optional description"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="md:col-span-2 flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Queries</span>
          <textarea
            name="queriesText"
            required
            rows={6}
            placeholder={'What is GeoPulse?\nHow does GeoPulse compare with alternatives?\nWhich tools help improve AI visibility?'}
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Adding query set…' : 'Add query set'}
          </button>
          {state && !state.ok ? <p className="text-sm text-error">{state.message}</p> : null}
        </div>
      </form>
    </section>
  );
}
