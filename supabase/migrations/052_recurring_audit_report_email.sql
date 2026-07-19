-- Migration 052: let users choose which email their recurring audit report goes to.
-- Null = fall back to the account email (existing behavior).

ALTER TABLE public.recurring_audit_schedules
  ADD COLUMN IF NOT EXISTS report_email TEXT;

COMMENT ON COLUMN public.recurring_audit_schedules.report_email IS
  'Optional recipient for the recurring audit report; null falls back to the account email.';
