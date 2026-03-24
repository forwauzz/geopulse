-- Guest checkout: store buyer email on payments for post-auth linking (Phase 3).
-- Written by service role on Stripe webhook / reconcile; not exposed to anon.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

COMMENT ON COLUMN public.payments.guest_email IS 'Checkout email when user_id is null; used to attach purchases after magic link signup';

CREATE INDEX IF NOT EXISTS payments_guest_email_lower_idx ON public.payments (lower(guest_email))
  WHERE guest_email IS NOT NULL;
