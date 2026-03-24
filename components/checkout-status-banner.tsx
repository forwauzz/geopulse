'use client';

import { useSearchParams } from 'next/navigation';

export function CheckoutStatusBanner() {
  const sp = useSearchParams();
  const checkout = sp.get('checkout');
  if (checkout === 'success') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="font-medium">Payment received.</p>
        <p className="mt-1 text-emerald-800">
          Stripe has confirmed checkout. Your PDF is generated and sent in the background — usually within a few minutes.
          If nothing arrives in 15 minutes, check spam or contact support with your receipt.
        </p>
      </div>
    );
  }
  if (checkout === 'cancel') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-geo-ink">
        Checkout canceled — no charge. You can upgrade whenever you are ready.
      </div>
    );
  }
  return null;
}
