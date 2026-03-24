'use client';

import { useSearchParams } from 'next/navigation';

export function CheckoutStatusBanner() {
  const sp = useSearchParams();
  const checkout = sp.get('checkout');
  if (checkout === 'success') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Payment received. Your full PDF report will be emailed shortly.
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
