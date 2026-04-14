'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Props = {
  /** ID of the first startup workspace the user owns, if any. Used for the direct link. */
  readonly startupWorkspaceId?: string | null;
  /** ID of the first agency account the user owns, if any. Used for the direct link. */
  readonly agencyAccountId?: string | null;
};

export function NewSubscriberWelcomeBanner({ startupWorkspaceId, agencyAccountId }: Props) {
  const sp = useSearchParams();
  const onboarding = sp.get('onboarding');
  const onboarded = sp.get('onboarded');

  // onboarded=true  — user just completed Stripe checkout
  // onboarding=1    — new user redirected here before selecting a plan
  const isPostCheckout = onboarded === 'true';
  const isNewUser = onboarding === '1';

  if (!isPostCheckout && !isNewUser) return null;

  const workspaceLink = startupWorkspaceId
    ? `/dashboard?startupWorkspace=${startupWorkspaceId}`
    : agencyAccountId
      ? `/dashboard?agencyAccount=${agencyAccountId}`
      : null;

  const headline = isPostCheckout ? 'Subscription confirmed.' : 'Welcome to GEO-Pulse.';

  const body = isPostCheckout ? (
    workspaceLink ? (
      <>
        Your workspace is ready.{' '}
        <Link
          href={workspaceLink}
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          Open workspace →
        </Link>
      </>
    ) : (
      <>
        Your workspace is being set up — this usually takes a few seconds. Refresh if it
        doesn&apos;t show up.
      </>
    )
  ) : workspaceLink ? (
    <>
      Your workspace is ready.{' '}
      <Link
        href={workspaceLink}
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        Open workspace →
      </Link>
    </>
  ) : (
    <>
      Your workspace is being set up — it will appear here in a few seconds. Refresh if it
      doesn&apos;t show up.{' '}
      <Link
        href="/pricing"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        View plans →
      </Link>
    </>
  );

  return (
    <div className="rounded-xl border border-primary/20 bg-surface-container-low px-4 py-4 text-sm text-on-background md:px-6">
      <p className="font-headline font-medium">{headline}</p>
      <p className="mt-1 font-body text-on-surface-variant">{body}</p>
    </div>
  );
}
