-- Close production QA gaps found by the first autonomous hourly cycle.
--
-- The continuous-capture trigger used a PL/pgSQL variable named source_kind,
-- which collides with ON CONFLICT column targets. Compile this one function
-- with column precedence, replay the affected source rows, and close incidents
-- only when the intelligence run index proves capture succeeded.

DO $migration$
DECLARE
  existing_definition TEXT;
  patched_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.capture_intelligence_operational_row()'::regprocedure
  ) INTO existing_definition;

  IF position('#variable_conflict use_column' IN existing_definition) = 0 THEN
    patched_definition := replace(
      existing_definition,
      'AS $function$',
      E'AS $function$\n#variable_conflict use_column'
    );
    IF patched_definition = existing_definition THEN
      RAISE EXCEPTION 'Could not patch capture_intelligence_operational_row variable precedence';
    END IF;
    EXECUTE patched_definition;
  END IF;
END;
$migration$;

UPDATE public.seo_opportunities AS opportunity
SET last_seen_at = opportunity.last_seen_at
WHERE EXISTS (
  SELECT 1
  FROM public.agent_work_loops AS loop
  WHERE loop.source_type = 'intelligence_ingestion'
    AND loop.source_key = 'seo_opportunities:' || opportunity.id::TEXT
    AND loop.state IN ('discovered', 'assigned', 'executing', 'verifying', 'blocked')
);

UPDATE public.outreach_sends AS send
SET sent_at = send.sent_at
WHERE EXISTS (
  SELECT 1
  FROM public.agent_work_loops AS loop
  WHERE loop.source_type = 'intelligence_ingestion'
    AND loop.source_key = 'outreach_sends:' || send.id::TEXT
    AND loop.state IN ('discovered', 'assigned', 'executing', 'verifying', 'blocked')
);

UPDATE public.agent_work_loops AS loop
SET
  state = 'completed',
  evidence = jsonb_build_object(
    'verification', 'continuous_intelligence_capture_replayed',
    'source_key', loop.source_key
  ),
  verified_at = now(),
  resolved_at = now(),
  founder_required = false,
  blocker = NULL
WHERE loop.source_type = 'intelligence_ingestion'
  AND (
    loop.source_key LIKE 'seo_opportunities:%'
    OR loop.source_key LIKE 'outreach_sends:%'
  )
  AND loop.state IN ('discovered', 'assigned', 'executing', 'verifying', 'blocked')
  AND EXISTS (
    SELECT 1
    FROM public.intelligence_runs AS run
    WHERE run.source_kind = CASE
      WHEN loop.source_key LIKE 'seo_opportunities:%' THEN 'seo_opportunity'
      WHEN loop.source_key LIKE 'outreach_sends:%' THEN 'outreach_delivery'
    END
      AND run.source_id = split_part(loop.source_key, ':', 2)
  );
