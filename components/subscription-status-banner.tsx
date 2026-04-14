'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export function SubscriptionStatusBanner() {
  const sp = useSearchParams();
  const status = sp.get('subscription');
  const bundle = sp.get('bundle') ?? '';

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-primary/20 bg-surface-container-low px-4 py-4 text-sm text-on-background md:px-6">
        <p className="font-headline font-medium">
          {bundle ? `You're on the ${bundleLabel(bundle)} plan.` : "You're subscribed."}
        </p>
        <p className="mt-1 font-body text-on-surface-variant">
          Your workspace is being set up — this usually takes a few seconds.{' '}
          <Link
            href="/dashboard"
            className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
          >
            Go to dashboard →
          </Link>
        </p>
      </div>
    );
  }

  if (status === 'cancel') {
    return (
      <div className="rounded-xl bg-surface-container-high/60 px-4 py-4 text-sm text-on-background md:px-6">
        Checkout cancelled. No charge was made.
      </div>
    );
  }

  return null;
}

function bundleLabel(bundleKey: string): string {
  switch (bundleKey) {
    case 'startup_dev':
      return 'Startup Dev';
    case 'agency_core':
      return 'Agency Core';
    case 'agency_pro':
      return 'Agency Pro';
    default:
      return bundleKey;
  }
}
