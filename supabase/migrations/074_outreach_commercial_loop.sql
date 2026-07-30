-- Migration 074: close the cold-outreach commercial loop.
--
-- Existing recurring audit prospects remain recurring (max_sequence_steps IS NULL).
-- Contacts promoted from the contact bank become a bounded three-message sequence.
-- Terminal lifecycle states always disable future sends; active subscriptions are
-- reconciled by the outreach sweep before another message is attempted.

ALTER TABLE public.outreach_prospects
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN (
      'active', 'paused', 'replied', 'positive_reply', 'converted',
      'unsubscribed', 'disqualified', 'completed'
    )),
  ADD COLUMN IF NOT EXISTS sequence_step SMALLINT NOT NULL DEFAULT 1
    CHECK (sequence_step BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS max_sequence_steps SMALLINT
    CHECK (max_sequence_steps IS NULL OR max_sequence_steps BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS sequence_delays_days INTEGER[] NOT NULL DEFAULT ARRAY[0, 4, 10],
  ADD COLUMN IF NOT EXISTS consecutive_failures SMALLINT NOT NULL DEFAULT 0
    CHECK (consecutive_failures BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS max_attempts SMALLINT NOT NULL DEFAULT 3
    CHECK (max_attempts BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'elena',
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS closure_condition TEXT NOT NULL
    DEFAULT 'reply, unsubscribe, disqualification, conversion, or sequence completion',
  ADD COLUMN IF NOT EXISTS reply_classification TEXT
    CHECK (reply_classification IS NULL OR reply_classification IN (
      'positive', 'neutral', 'not_interested', 'out_of_office', 'wrong_person'
    )),
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_reason TEXT;

ALTER TABLE public.outreach_sends
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS sequence_step SMALLINT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Historical rows were inserted before the provider call. If the prospect's latest
-- attempt recorded a delivery error, relabel that latest row before calculating
-- campaign progress so a failed request does not consume a sequence step.
WITH latest_failed_send AS (
  SELECT DISTINCT ON (s.prospect_id) s.id
  FROM public.outreach_sends s
  JOIN public.outreach_prospects p ON p.id = s.prospect_id
  WHERE p.last_error LIKE 'email_send_failed:%'
  ORDER BY s.prospect_id, s.sent_at DESC
)
UPDATE public.outreach_sends s
SET delivery_status = 'failed',
    delivery_error = p.last_error,
    updated_at = now()
FROM public.outreach_prospects p, latest_failed_send latest
WHERE s.id = latest.id
  AND s.prospect_id = p.id;

-- Promote only contact-bank-linked cold prospects into the bounded sequence.
-- Customer/monitoring rows that were intentionally recurring keep max_sequence_steps NULL.
WITH contact_progress AS (
  SELECT p.id, count(s.id) FILTER (WHERE s.delivery_status = 'sent')::INTEGER AS sent_count
  FROM public.outreach_prospects p
  JOIN public.outreach_contacts c ON c.prospect_id = p.id
  LEFT JOIN public.outreach_sends s ON s.prospect_id = p.id
  WHERE p.unsubscribed_at IS NULL
  GROUP BY p.id
)
UPDATE public.outreach_prospects p
SET max_sequence_steps = 3,
    sequence_delays_days = ARRAY[0, 4, 10],
    sequence_step = LEAST(3, progress.sent_count + 1),
    lifecycle_status = CASE WHEN progress.sent_count >= 3 THEN 'completed' ELSE 'active' END,
    enabled = progress.sent_count < 3,
    next_action = CASE
      WHEN progress.sent_count >= 3 THEN NULL
      ELSE 'send sequence step ' || (progress.sent_count + 1)::TEXT || ' of 3'
    END,
    exited_at = CASE WHEN progress.sent_count >= 3 THEN COALESCE(p.exited_at, now()) ELSE NULL END,
    exit_reason = CASE WHEN progress.sent_count >= 3 THEN 'sequence_completed' ELSE NULL END,
    updated_at = now()
FROM contact_progress progress
WHERE p.id = progress.id;
-- Preserve consent withdrawal as a terminal state during the migration.
UPDATE public.outreach_prospects
SET lifecycle_status = 'unsubscribed',
    enabled = false,
    exited_at = COALESCE(exited_at, unsubscribed_at),
    exit_reason = COALESCE(exit_reason, 'unsubscribe')
WHERE unsubscribed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_prospects_commercial_due_idx
  ON public.outreach_prospects (next_run_at)
  WHERE enabled = true AND lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS outreach_sends_delivery_idx
  ON public.outreach_sends (delivery_status, sent_at DESC);

COMMENT ON COLUMN public.outreach_prospects.max_sequence_steps IS
  'NULL preserves legacy recurring audits; a positive value creates a bounded campaign sequence.';
COMMENT ON COLUMN public.outreach_prospects.sequence_delays_days IS
  'Day offsets from enrollment for each message; the default sequence runs on days 0, 4, and 10.';
COMMENT ON COLUMN public.outreach_prospects.lifecycle_status IS
  'Commercial stop-state. Only active prospects may be selected by the outreach sweep.';
COMMENT ON COLUMN public.outreach_sends.delivery_status IS
  'Provider delivery attempt state. A failed send never counts as a successful commercial step.';