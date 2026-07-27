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
      E'AS $function$\n<<capture>>',
      E'AS $function$\n#variable_conflict use_column\n<<capture>>'
    );
    IF patched_definition = existing_definition THEN
      RAISE EXCEPTION 'Could not patch capture_intelligence_operational_row variable precedence';
    END IF;
    EXECUTE patched_definition;
  END IF;
END;
$migration$;

UPDATE public.seo_opportunities AS opportunity
SET updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.agent_work_loops AS loop
  WHERE loop.source_type = 'intelligence_ingestion'
    AND loop.source_key = 'seo_opportunities:' || opportunity.id::TEXT
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
  AND loop.source_key LIKE 'seo_opportunities:%'
  AND loop.state IN ('discovered', 'assigned', 'executing', 'verifying', 'blocked')
  AND EXISTS (
    SELECT 1
    FROM public.intelligence_runs AS run
    WHERE run.source_kind = 'seo_opportunity'
      AND run.source_id = split_part(loop.source_key, ':', 2)
  );
