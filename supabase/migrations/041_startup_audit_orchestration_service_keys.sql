-- SAO-007
-- Add orchestration role service keys so planner/reviewer/executor models can be
-- controlled independently from the admin service center.

INSERT INTO public.service_catalog (service_key, name, description, category, default_access_mode, metadata)
VALUES
  (
    'startup_audit_orchestrator',
    'Startup Audit Orchestrator',
    'Primary planner that turns startup audit inputs into repo-aware execution plans.',
    'automation',
    'off',
    '{"seed":"sao007","orchestration_role":"planner"}'::jsonb
  ),
  (
    'startup_audit_repo_review',
    'Startup Audit Repo Review',
    'Codebase review role for startup audit orchestration.',
    'automation',
    'off',
    '{"seed":"sao007","orchestration_role":"repo_review"}'::jsonb
  ),
  (
    'startup_audit_db_review',
    'Startup Audit DB Review',
    'Database and migration review role for startup audit orchestration.',
    'automation',
    'off',
    '{"seed":"sao007","orchestration_role":"db_review"}'::jsonb
  ),
  (
    'startup_audit_risk_review',
    'Startup Audit Risk Review',
    'Risk and rollout review role for startup audit orchestration.',
    'automation',
    'off',
    '{"seed":"sao007","orchestration_role":"risk_review"}'::jsonb
  ),
  (
    'startup_audit_execution',
    'Startup Audit Execution Worker',
    'Execution worker role for startup audit implementation tasks and PR creation.',
    'automation',
    'off',
    '{"seed":"sao007","orchestration_role":"execution"}'::jsonb
  ),
  (
    'startup_audit_pr_summary',
    'Startup Audit PR Summary',
    'PR summarizer role for startup audit orchestration output.',
    'automation',
    'off',
    '{"seed":"sao007","orchestration_role":"pr_summary"}'::jsonb
  )
ON CONFLICT (service_key) DO NOTHING;

INSERT INTO public.service_bundle_services (bundle_id, service_id, enabled, access_mode, metadata)
SELECT
  b.id,
  s.id,
  CASE
    WHEN b.bundle_key IN ('startup_dev', 'agency_core', 'agency_pro') THEN true
    ELSE false
  END,
  CASE
    WHEN b.bundle_key IN ('startup_dev', 'agency_core', 'agency_pro')
      THEN 'paid'::public.service_access_mode
    ELSE 'off'::public.service_access_mode
  END,
  jsonb_build_object('seed', 'sao007')
FROM public.service_bundles b
CROSS JOIN public.service_catalog s
WHERE s.service_key IN (
  'startup_audit_orchestrator',
  'startup_audit_repo_review',
  'startup_audit_db_review',
  'startup_audit_risk_review',
  'startup_audit_execution',
  'startup_audit_pr_summary'
)
ON CONFLICT (bundle_id, service_id) DO NOTHING;
