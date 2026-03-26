'use client';

import { useSearchParams } from 'next/navigation';

export function CheckoutStatusBanner() {
  const sp = useSearchParams();
  const checkout = sp.get('checkout');
  if (checkout === 'success') {
    return (
      <div className="rounded-xl border border-primary/20 bg-surface-container-low px-4 py-4 text-sm text-on-background md:px-6">
        <p className="font-headline font-medium">Payment received.</p>
        <p className="mt-1 font-body text-on-surface-variant">
          Report generation typically completes within about 60 seconds.
        </p>
      </div>
    );
  }
  if (checkout === 'cancel') {
    return (
      <div className="rounded-xl bg-surface-container-high/60 px-4 py-4 text-sm text-on-background md:px-6">
        Checkout cancelled. No charge was made.
      </div>
    );
  }
  return null;
}
