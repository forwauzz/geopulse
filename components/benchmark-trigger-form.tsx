'use client';

import { useActionState } from 'react';
import { triggerBenchmarkRun, type BenchmarkTriggerState } from '@/app/dashboard/benchmarks/actions';

type Option = {
  readonly id: string;
  readonly label: string;
};

type Props = {
  readonly domainOptions: readonly Option[];
  readonly querySetOptions: readonly Option[];
  readonly defaultModelId: string;
  readonly liveLaneLabel: string;
};

const initialState: BenchmarkTriggerState | null = null;

export function BenchmarkTriggerForm({
  domainOptions,
  querySetOptions,
  defaultModelId,
  liveLaneLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(triggerBenchmarkRun, initialState);

  return (
    <section className="mt-8 rounded-xl bg-surface-container-lowest p-5 shadow-float">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Run one benchmark
          </h2>
          <p className="mt-1 font-body text-sm text-on-surface-variant">
            Launch one internal benchmark run for one domain, one query set, and one model lane.
          </p>
          <p className="mt-2 font-body text-xs text-on-surface-variant">
            Current live execution lane: {liveLaneLabel}. Any non-matching model lane will be
            stored as skipped.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Domain</span>
          <select
            name="domainId"
            required
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
            defaultValue=""
          >
            <option value="" disabled>
              Select a benchmark domain
            </option>
            {domainOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Query set</span>
          <select
            name="querySetId"
            required
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
            defaultValue=""
          >
            <option value="" disabled>
              Select a query set
            </option>
            {querySetOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Model lane</span>
          <input
            name="modelId"
            required
            defaultValue={defaultModelId}
            placeholder="openai/gpt-4.1-mini"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Run label</span>
          <input
            name="runLabel"
            placeholder="baseline"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Benchmark mode</span>
          <select
            name="runMode"
            defaultValue="ungrounded_inference"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          >
            <option value="ungrounded_inference">Ungrounded inference</option>
            <option value="grounded_site">Grounded site</option>
          </select>
          <span className="text-xs text-on-surface-variant">
            Grounded site mode only runs when benchmark-domain metadata already includes grounding
            evidence.
          </span>
        </label>

        <label className="md:col-span-2 flex flex-col gap-2 text-sm text-on-background">
          <span className="font-medium">Notes</span>
          <textarea
            name="notes"
            rows={3}
            placeholder="Optional run note"
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm text-on-background"
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || domainOptions.length === 0 || querySetOptions.length === 0}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Launching benchmark…' : 'Run benchmark'}
          </button>
          {state && !state.ok ? (
            <p className="text-sm text-error">{state.message}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
