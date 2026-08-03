-- Replace the stopped MSP step-two reply mechanic before any remaining prospect
-- reaches step two. Audience, cadence, subject, evidence, two-notes offer, pricing,
-- consent controls, and volume stay fixed; only the requested reply changes from a
-- keyword/role-routing response to an explicit yes/no choice.

INSERT INTO public.growth_campaign_interventions (
  id,
  campaign_id,
  intervention_key,
  name,
  channel,
  status,
  hypothesis,
  meaningful_variable,
  success_condition,
  stop_condition,
  started_at,
  metadata
)
VALUES (
  '9f1f2b98-1ea1-4c44-b466-2f7ced16f813',
  '00000000-0000-4000-8000-000000000801',
  'msp-qc-binary-reply-v3',
  'MSP binary reply follow-up',
  'email',
  'running',
  'A plain yes/no reply mechanic will reduce response friction while preserving the same evidence and two-notes offer.',
  'Step-two reply mechanic only',
  'At least one qualified human reply in the next 25 provider-accepted V3 MSP step-two sends.',
  'Stop after 25 provider-accepted V3 MSP step-two sends with zero qualified replies, or immediately on any safety or cap violation.',
  now(),
  jsonb_build_object(
    'owner', 'Elena',
    'variant', 'reply_first_binary_choice_v3',
    'github_issue', 361,
    'one_variable_only', true,
    'fixed_variables', jsonb_build_array(
      'subject', 'evidence', 'audience', 'cadence', 'caps', 'consent',
      'sender', 'pricing', 'two_notes_offer'
    ),
    'base_checkpoint_step2', 53,
    'v3_target_total_step2', 78
  )
)
ON CONFLICT (intervention_key) DO UPDATE SET
  status = EXCLUDED.status,
  hypothesis = EXCLUDED.hypothesis,
  meaningful_variable = EXCLUDED.meaningful_variable,
  success_condition = EXCLUDED.success_condition,
  stop_condition = EXCLUDED.stop_condition,
  metadata = public.growth_campaign_interventions.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Reassign only the unsent first-step MSP remainder. The 53 prospects already past
-- step two remain attached to their historical V1/V2 interventions and are never
-- re-enabled or resent by this migration.
UPDATE public.outreach_prospects
SET growth_intervention_id = '9f1f2b98-1ea1-4c44-b466-2f7ced16f813'::uuid,
    next_action = CASE
      WHEN next_action IS NULL OR next_action = '' THEN 'send sequence step 1 of 3'
      ELSE next_action
    END,
    updated_at = now()
WHERE segment = 'msp-qc'
  AND enabled = true
  AND lifecycle_status = 'active'
  AND max_sequence_steps = 3
  AND sequence_step = 1;
