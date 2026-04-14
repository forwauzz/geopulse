import { provisionMyWorkspaceForSubscription } from '@/app/dashboard/actions';

type PendingRow = {
  readonly id: string;
  readonly bundle_key: string;
};

export function SubscriptionWorkspacePendingBanner({ pending }: { readonly pending: PendingRow[] }) {
  const [first] = pending;
  if (!first) return null;

  const extra = pending.length > 1 ? ` (${pending.length} subscriptions need setup)` : '';

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-4 text-sm text-on-background md:px-6">
      <p className="font-headline font-medium">Finish setting up your workspace</p>
      <p className="mt-1 font-body text-on-surface-variant">
        Your plan ({first.bundle_key}) is active, but your workspace hasn&apos;t been linked yet.{extra}
      </p>
      <form action={provisionMyWorkspaceForSubscription} className="mt-4">
        <input type="hidden" name="subRowId" value={first.id} />
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90"
        >
          Create workspace
        </button>
      </form>
    </div>
  );
}
