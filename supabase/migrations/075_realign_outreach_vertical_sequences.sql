-- Repair the commercial-sequence rollout without changing consent or suppression state.
--
-- Migration 074 promoted historical contact-bank prospects into bounded sequences.
-- It also made two operational mistakes:
--   1. previously paused restaurant/hospitality prospects were re-enabled;
--   2. historical successful sends kept their monthly next_run_at instead of receiving
--      the bounded sequence's day-4 follow-up.
--
-- Preserve MSP as the primary vertical and marketing agencies as the only challenger.

UPDATE public.outreach_prospects AS prospect
SET enabled = false,
    lifecycle_status = 'paused',
    next_action = 'paused: restaurant/hospitality lane retired pending new evidence',
    updated_at = now()
FROM public.outreach_contacts AS contact
WHERE contact.prospect_id = prospect.id
  AND contact.segment = 'restaurants-hospitality-qc'
  AND prospect.lifecycle_status = 'active';

-- Close the currently known permanent cold-audit access failures. These contacts
-- cannot receive the promised scorecard, so retrying or emailing them is not useful.
UPDATE public.outreach_prospects AS prospect
SET enabled = false,
    lifecycle_status = 'disqualified',
    consecutive_failures = LEAST(20, prospect.consecutive_failures + 1),
    next_action = NULL,
    exited_at = COALESCE(prospect.exited_at, now()),
    exit_reason = COALESCE(prospect.exit_reason, 'scan_access_failure'),
    updated_at = now()
FROM public.outreach_contacts AS contact
WHERE contact.prospect_id = prospect.id
  AND prospect.max_sequence_steps IS NOT NULL
  AND prospect.lifecycle_status = 'active'
  AND prospect.last_error ~ '^Target returned HTTP (401|403|404|410|451)$';

-- Historical MSP/agency first sends were already provider-accepted. Re-stage their
-- overdue second step one per hour instead of releasing a burst. The existing
-- sequence state machine will schedule step three from each successful step-two send.
WITH candidates AS (
  SELECT
    prospect.id,
    row_number() OVER (
      ORDER BY
        CASE WHEN contact.segment = 'msp-qc' THEN 0 ELSE 1 END,
        prospect.last_run_at ASC,
        prospect.id
    ) AS position
  FROM public.outreach_prospects AS prospect
  JOIN public.outreach_contacts AS contact ON contact.prospect_id = prospect.id
  WHERE prospect.enabled = true
    AND prospect.lifecycle_status = 'active'
    AND prospect.max_sequence_steps = 3
    AND prospect.sequence_step = 2
    AND prospect.last_run_at IS NOT NULL
    AND prospect.next_run_at > prospect.last_run_at + INTERVAL '12 days'
    AND contact.segment IN ('msp-qc', 'marketing-agencies', 'marketing-agencies-qc-extra')
)
UPDATE public.outreach_prospects AS prospect
SET next_run_at = now() + (candidates.position * INTERVAL '1 hour'),
    next_action = 'send sequence step 2 of 3',
    updated_at = now()
FROM candidates
WHERE prospect.id = candidates.id;
