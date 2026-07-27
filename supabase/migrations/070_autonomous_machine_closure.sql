-- Epic #269: close the operational, intelligence, measurement, and proof loops.
-- Existing product tables remain authoritative. These additions are indexes,
-- append-only audit records, and evidence gates above those tables.

CREATE TABLE IF NOT EXISTS public.agent_work_loop_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id UUID NOT NULL REFERENCES public.agent_work_loops(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  state TEXT NOT NULL,
  owner TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'started',
  detail TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loop_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS agent_work_loop_attempts_loop_idx
  ON public.agent_work_loop_attempts (loop_id, attempted_at DESC);

ALTER TABLE public.agent_work_loop_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_work_loop_attempts FROM anon, authenticated;
GRANT ALL ON public.agent_work_loop_attempts TO service_role;

UPDATE public.agent_work_loops
SET
  next_action = COALESCE(NULLIF(next_action, ''), 'Inspect the source record and advance or explicitly dismiss this work.'),
  due_at = COALESCE(due_at, created_at + interval '72 hours')
WHERE state IN ('discovered', 'assigned', 'executing', 'verifying', 'blocked');

ALTER TABLE public.agent_work_loops
  ADD CONSTRAINT agent_work_loops_open_work_shape_check
  CHECK (
    state IN ('completed', 'dismissed')
    OR (
      owner <> ''
      AND next_action IS NOT NULL
      AND btrim(next_action) <> ''
      AND due_at IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.agent_work_loops
  VALIDATE CONSTRAINT agent_work_loops_open_work_shape_check;

CREATE OR REPLACE FUNCTION public.record_agent_work_loop_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.attempt_count > COALESCE(OLD.attempt_count, 0) THEN
    INSERT INTO public.agent_work_loop_attempts (
      loop_id, attempt_number, state, owner, outcome, detail, evidence, attempted_at
    ) VALUES (
      NEW.id,
      NEW.attempt_count,
      NEW.state,
      NEW.owner,
      CASE WHEN NEW.state = 'blocked' THEN 'blocked' ELSE 'started' END,
      NEW.blocker,
      NEW.evidence,
      COALESCE(NEW.last_attempted_at, now())
    )
    ON CONFLICT (loop_id, attempt_number) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_work_loop_attempt_audit ON public.agent_work_loops;
CREATE TRIGGER agent_work_loop_attempt_audit
  AFTER UPDATE OF attempt_count ON public.agent_work_loops
  FOR EACH ROW EXECUTE FUNCTION public.record_agent_work_loop_attempt();

CREATE OR REPLACE FUNCTION public.require_agent_work_loop_completion_proof()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = 'completed' AND (
    NEW.evidence = '{}'::jsonb
    OR NEW.verified_at IS NULL
    OR NEW.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'completed work requires evidence, verified_at, and resolved_at';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_work_loop_completion_proof ON public.agent_work_loops;
CREATE TRIGGER agent_work_loop_completion_proof
  BEFORE INSERT OR UPDATE OF state, evidence, verified_at, resolved_at
  ON public.agent_work_loops
  FOR EACH ROW EXECUTE FUNCTION public.require_agent_work_loop_completion_proof();

CREATE TABLE IF NOT EXISTS public.content_followup_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  seo_opportunity_id UUID REFERENCES public.seo_opportunities(id) ON DELETE SET NULL,
  measurement_kind TEXT NOT NULL CHECK (
    measurement_kind IN (
      'search_console', 'rank', 'ai_visibility', 'social_provider', 'traffic', 'conversion'
    )
  ),
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_url TEXT,
  quality_state TEXT NOT NULL DEFAULT 'valid' CHECK (
    quality_state IN ('valid', 'valid_partial', 'insufficient', 'quarantined')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, measurement_kind, source_table, source_id)
);

CREATE INDEX IF NOT EXISTS content_followup_measurements_opportunity_idx
  ON public.content_followup_measurements (seo_opportunity_id, measured_at DESC);

ALTER TABLE public.content_followup_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_followup_measurements FROM anon, authenticated;
GRANT ALL ON public.content_followup_measurements TO service_role;

CREATE TABLE IF NOT EXISTS public.commercial_handoff_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'reply_received', 'meeting_booked', 'workspace_activated',
      'checkout_started', 'payment_completed', 'monitoring_started',
      'retained', 'cancelled', 'suppressed'
    )
  ),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  prospect_id UUID REFERENCES public.outreach_prospects(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  startup_workspace_id UUID REFERENCES public.startup_workspaces(id) ON DELETE SET NULL,
  agency_account_id UUID REFERENCES public.agency_accounts(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT,
  provider_event_id TEXT,
  evidence_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_handoff_events_funnel_idx
  ON public.commercial_handoff_events (event_type, occurred_at DESC);

ALTER TABLE public.commercial_handoff_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_handoff_events FROM anon, authenticated;
GRANT ALL ON public.commercial_handoff_events TO service_role;

CREATE TABLE IF NOT EXISTS public.provider_spend_caps (
  provider TEXT PRIMARY KEY,
  monthly_cap_usd NUMERIC(12, 4) NOT NULL CHECK (monthly_cap_usd >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  founder_override_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.provider_spend_caps (provider, monthly_cap_usd, metadata)
VALUES
  ('gemini', 5, '{"policy":"hard_application_cap"}'::jsonb),
  ('perplexity', 5, '{"policy":"hard_application_cap"}'::jsonb),
  ('openai', 5, '{"policy":"hard_application_cap"}'::jsonb),
  ('dataforseo', 10, '{"policy":"hard_application_cap"}'::jsonb),
  ('cloudflare', 5, '{"policy":"fixed_plan_budget"}'::jsonb),
  ('email', 5, '{"policy":"hard_application_cap"}'::jsonb)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.provider_spend_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL REFERENCES public.provider_spend_caps(provider),
  idempotency_key TEXT NOT NULL UNIQUE,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL CHECK (estimated_cost_usd >= 0),
  actual_cost_usd NUMERIC(12, 6),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (
    status IN ('reserved', 'settled', 'released')
  ),
  operation TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS provider_spend_reservations_month_idx
  ON public.provider_spend_reservations (provider, created_at DESC)
  WHERE status <> 'released';

ALTER TABLE public.provider_spend_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_spend_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_spend_caps FROM anon, authenticated;
REVOKE ALL ON public.provider_spend_reservations FROM anon, authenticated;
GRANT ALL ON public.provider_spend_caps TO service_role;
GRANT ALL ON public.provider_spend_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_provider_spend(
  requested_provider TEXT,
  requested_idempotency_key TEXT,
  requested_operation TEXT,
  requested_estimated_cost_usd NUMERIC,
  requested_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap_row public.provider_spend_caps%ROWTYPE;
  month_spend NUMERIC;
BEGIN
  SELECT * INTO cap_row
  FROM public.provider_spend_caps
  WHERE provider = requested_provider
  FOR UPDATE;
  IF NOT FOUND OR NOT cap_row.enabled THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.provider_spend_reservations
    WHERE idempotency_key = requested_idempotency_key
  ) THEN
    RETURN true;
  END IF;
  SELECT COALESCE(sum(COALESCE(actual_cost_usd, estimated_cost_usd)), 0)
  INTO month_spend
  FROM public.provider_spend_reservations
  WHERE provider = requested_provider
    AND status <> 'released'
    AND created_at >= date_trunc('month', now());
  IF cap_row.founder_override_until IS NULL
    OR cap_row.founder_override_until < now()
  THEN
    IF month_spend + requested_estimated_cost_usd > cap_row.monthly_cap_usd THEN
      RETURN false;
    END IF;
  END IF;
  INSERT INTO public.provider_spend_reservations (
    provider, idempotency_key, operation, estimated_cost_usd, metadata
  ) VALUES (
    requested_provider,
    requested_idempotency_key,
    requested_operation,
    requested_estimated_cost_usd,
    requested_metadata
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_provider_spend(TEXT, TEXT, TEXT, NUMERIC, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_provider_spend(TEXT, TEXT, TEXT, NUMERIC, JSONB)
  TO service_role;

-- Idempotent, best-effort continuous indexing. The trigger never blocks the
-- operational producer: a capture failure opens a Marcus incident and the
-- authoritative source write still commits.
CREATE OR REPLACE FUNCTION public.capture_intelligence_operational_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
<<capture>>
DECLARE
  row_data JSONB := to_jsonb(NEW);
  source_kind TEXT := TG_ARGV[0];
  source_table_name TEXT := TG_TABLE_NAME;
  source_id TEXT := row_data->>'id';
  host_value TEXT;
  page_value TEXT;
  domain_id UUID;
  page_id UUID;
  lane_value UUID;
  window_value UUID;
  run_id UUID;
  owner_type_value TEXT;
  owner_id_value UUID;
  visibility_value TEXT := 'internal';
  privacy_value TEXT := 'internal';
  status_value TEXT;
  observed_value TIMESTAMPTZ;
  complete_value TIMESTAMPTZ;
  quality_value TEXT;
BEGIN
  IF source_id IS NULL OR source_id = '' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'scans' THEN
    source_kind := CASE row_data->>'run_source'
      WHEN 'public_self_serve' THEN 'free_scan'
      WHEN 'agency_dashboard' THEN 'agency_scan'
      WHEN 'startup_dashboard' THEN 'startup_scan'
      WHEN 'internal_benchmark' THEN 'competitor_scan'
      WHEN 'admin_manual' THEN 'admin_scan'
      WHEN 'recurring' THEN 'recurring_scan'
      WHEN 'monitor' THEN 'monitor_scan'
      ELSE 'scan_unknown'
    END;
  END IF;

  host_value := lower(regexp_replace(
    COALESCE(
      NULLIF(row_data->>'domain', ''),
      NULLIF(row_data->>'canonical_domain', ''),
      NULLIF(row_data->>'page_url', ''),
      NULLIF(row_data->>'url', '')
    ),
    '^https?://(www\.)?|/.*$',
    '',
    'g'
  ));
  page_value := COALESCE(
    NULLIF(row_data->>'page_url', ''),
    NULLIF(row_data->>'canonical_url', ''),
    NULLIF(row_data->>'url', '')
  );

  IF host_value IS NULL OR host_value = '' THEN
    SELECT canonical_domain_id, canonical_page_id
    INTO domain_id, page_id
    FROM public.intelligence_source_identity_maps maps
    WHERE maps.source_id = capture.source_id
      AND maps.source_kind IN (
        capture.source_kind,
        CASE WHEN capture.source_kind = 'startup_recommendation'
          THEN 'recommendation' ELSE capture.source_kind END
      )
    ORDER BY CASE WHEN maps.source_kind = capture.source_kind THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  IF host_value IS NOT NULL AND host_value <> '' THEN
    INSERT INTO public.intelligence_domains (
      normalized_host, display_name, normalization_version, metadata
    ) VALUES (
      host_value, host_value, 'domain-normalization-v1',
      jsonb_build_object('continuous_capture', true)
    )
    ON CONFLICT (normalized_host) DO UPDATE
      SET updated_at = now()
    RETURNING id INTO domain_id;
  END IF;

  IF domain_id IS NOT NULL AND page_value ~ '^https?://' THEN
    INSERT INTO public.intelligence_pages (
      domain_id, normalized_url, original_url, normalization_version, metadata
    ) VALUES (
      domain_id,
      regexp_replace(page_value, '#.*$', ''),
      page_value,
      'url-normalization-v1',
      jsonb_build_object('continuous_capture', true)
    )
    ON CONFLICT (normalized_url) DO UPDATE
      SET updated_at = now()
    RETURNING id INTO page_id;
  END IF;

  IF NULLIF(row_data->>'agency_client_id', '') IS NOT NULL THEN
    owner_type_value := 'agency_client';
    owner_id_value := (row_data->>'agency_client_id')::UUID;
  ELSIF NULLIF(row_data->>'startup_workspace_id', '') IS NOT NULL THEN
    owner_type_value := 'startup_workspace';
    owner_id_value := (row_data->>'startup_workspace_id')::UUID;
  ELSIF NULLIF(row_data->>'agency_account_id', '') IS NOT NULL THEN
    owner_type_value := 'agency_account';
    owner_id_value := (row_data->>'agency_account_id')::UUID;
  ELSIF NULLIF(row_data->>'user_id', '') IS NOT NULL THEN
    owner_type_value := 'user';
    owner_id_value := (row_data->>'user_id')::UUID;
  END IF;

  IF owner_type_value IS NOT NULL THEN
    visibility_value := 'tenant';
    privacy_value := 'private_tenant';
    IF domain_id IS NOT NULL THEN
      INSERT INTO public.intelligence_domain_owners (
        domain_id, owner_type, owner_id, visibility, metadata
      ) VALUES (
        domain_id, owner_type_value, owner_id_value, 'tenant',
        jsonb_build_object('continuous_capture', true)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF domain_id IS NOT NULL THEN
    INSERT INTO public.intelligence_source_identity_maps (
      source_kind, source_id, source_table, canonical_domain_id,
      canonical_page_id, mapping_status, normalization_version, observed_host,
      observed_url, metadata
    ) VALUES (
      source_kind, source_id, source_table_name, domain_id, page_id, 'mapped',
      'identity-v1', host_value, page_value,
      jsonb_build_object('continuous_capture', true)
    )
    ON CONFLICT (source_kind, source_id) DO UPDATE SET
      canonical_domain_id = EXCLUDED.canonical_domain_id,
      canonical_page_id = EXCLUDED.canonical_page_id,
      mapping_status = 'mapped',
      unmapped_reason = NULL,
      observed_host = EXCLUDED.observed_host,
      observed_url = EXCLUDED.observed_url,
      updated_at = now();
    IF source_kind = 'startup_recommendation' THEN
      INSERT INTO public.intelligence_source_identity_maps (
        source_kind, source_id, source_table, canonical_domain_id,
        canonical_page_id, mapping_status, normalization_version, observed_host,
        observed_url, metadata
      ) VALUES (
        'recommendation', source_id, source_table_name, domain_id, page_id, 'mapped',
        'identity-v1', host_value, page_value,
        jsonb_build_object('continuous_capture', true, 'compatibility_alias', true)
      )
      ON CONFLICT (source_kind, source_id) DO UPDATE SET
        canonical_domain_id = EXCLUDED.canonical_domain_id,
        canonical_page_id = EXCLUDED.canonical_page_id,
        mapping_status = 'mapped',
        unmapped_reason = NULL,
        updated_at = now();
    END IF;
  END IF;

  SELECT lane_id, window_id
  INTO lane_value, window_value
  FROM public.intelligence_measurement_run_mappings run_maps
  WHERE run_maps.source_kind = capture.source_kind
    AND run_maps.source_id = capture.source_id
  LIMIT 1;

  status_value := COALESCE(
    row_data->>'status',
    row_data->>'run_status',
    CASE WHEN row_data->>'email_delivered_at' IS NOT NULL THEN 'delivered' END,
    'observed'
  );
  observed_value := COALESCE(
    NULLIF(row_data->>'measured_at', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'measured_on', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'completed_at', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'published_at', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'sent_at', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'created_at', '')::TIMESTAMPTZ,
    now()
  );
  complete_value := COALESCE(
    NULLIF(row_data->>'completed_at', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'published_at', '')::TIMESTAMPTZ,
    NULLIF(row_data->>'email_delivered_at', '')::TIMESTAMPTZ
  );
  quality_value := CASE
    WHEN status_value IN ('complete', 'completed', 'published', 'delivered', 'paid', 'active')
      OR complete_value IS NOT NULL
      THEN 'valid'
    ELSE 'valid_partial'
  END;

  INSERT INTO public.intelligence_runs (
    contract_version, source_kind, source_table, source_id, source_snapshot,
    canonical_domain_id, canonical_page_id, lane_id, window_id, source_status, quality_state,
    started_at, completed_at, observed_at, provider, model_id, run_mode,
    versions, artifact_ref, tenant_type, tenant_id, visibility, metadata
  ) VALUES (
    'run-index-v1', source_kind, source_table_name, source_id, md5(row_data::TEXT),
    domain_id, page_id, lane_value, window_value, status_value, quality_value,
    NULLIF(row_data->>'started_at', '')::TIMESTAMPTZ,
    complete_value, observed_value,
    COALESCE(row_data->>'provider', row_data->>'provider_name'),
    row_data->>'model_id',
    COALESCE(row_data->>'run_source', row_data->>'run_mode'),
    '{}'::jsonb,
    source_table_name || ':' || source_id,
    owner_type_value, owner_id_value, visibility_value,
    jsonb_build_object('continuous_capture', true)
  )
  ON CONFLICT (source_kind, source_id) DO UPDATE SET
    source_snapshot = EXCLUDED.source_snapshot,
    canonical_domain_id = COALESCE(EXCLUDED.canonical_domain_id, intelligence_runs.canonical_domain_id),
    canonical_page_id = COALESCE(EXCLUDED.canonical_page_id, intelligence_runs.canonical_page_id),
    lane_id = COALESCE(EXCLUDED.lane_id, intelligence_runs.lane_id),
    window_id = COALESCE(EXCLUDED.window_id, intelligence_runs.window_id),
    source_status = EXCLUDED.source_status,
    quality_state = EXCLUDED.quality_state,
    completed_at = EXCLUDED.completed_at,
    observed_at = EXCLUDED.observed_at,
    tenant_type = EXCLUDED.tenant_type,
    tenant_id = EXCLUDED.tenant_id,
    visibility = EXCLUDED.visibility,
    updated_at = now()
  RETURNING id INTO run_id;

  INSERT INTO public.intelligence_evidence_objects (
    contract_version, stable_evidence_id, evidence_kind, object_class,
    source_kind, source_table, source_id, content_hash, storage_kind,
    artifact_status, inline_excerpt, artifact_ref, run_id,
    canonical_domain_id, canonical_page_id, collected_at, source_created_at,
    parser_version, extractor_version, privacy, tenant_type, tenant_id,
    retention_class, metadata
  ) VALUES (
    'evidence-catalog-v1',
    source_kind || ':' || source_id || ':operational-row',
    'operational_row',
    'original',
    source_kind,
    source_table_name,
    source_id,
    md5(row_data::TEXT),
    'postgres_source',
    'present',
    left(row_data::TEXT, 2000),
    source_table_name || ':' || source_id,
    run_id,
    domain_id,
    page_id,
    observed_value,
    NULLIF(row_data->>'created_at', '')::TIMESTAMPTZ,
    NULL,
    'continuous-capture-v1',
    privacy_value,
    owner_type_value,
    owner_id_value,
    'measurement_history',
    jsonb_strip_nulls(jsonb_build_object(
      'continuous_capture', true,
      'source_table', source_table_name,
      'source_url', CASE WHEN page_value ~ '^https?://' THEN page_value ELSE NULL END
    ))
  )
  ON CONFLICT (source_kind, source_id, evidence_kind) DO UPDATE SET
    content_hash = EXCLUDED.content_hash,
    inline_excerpt = EXCLUDED.inline_excerpt,
    run_id = EXCLUDED.run_id,
    canonical_domain_id = COALESCE(EXCLUDED.canonical_domain_id, intelligence_evidence_objects.canonical_domain_id),
    canonical_page_id = COALESCE(EXCLUDED.canonical_page_id, intelligence_evidence_objects.canonical_page_id),
    collected_at = EXCLUDED.collected_at,
    privacy = EXCLUDED.privacy,
    tenant_type = EXCLUDED.tenant_type,
    tenant_id = EXCLUDED.tenant_id,
    updated_at = now();

  INSERT INTO public.intelligence_backfill_checkpoints (
    backfill_key, contract_version, last_source_key, source_count,
    indexed_count, status, source_snapshot, completed_at, metadata
  ) VALUES (
    'continuous:' || source_kind,
    'continuous-capture-v1',
    source_id,
    1,
    1,
    'complete',
    md5(row_data::TEXT),
    now(),
    jsonb_build_object('source_table', source_table_name)
  )
  ON CONFLICT (backfill_key) DO UPDATE SET
    last_source_key = EXCLUDED.last_source_key,
    source_count = intelligence_backfill_checkpoints.source_count + 1,
    indexed_count = intelligence_backfill_checkpoints.indexed_count + 1,
    status = 'complete',
    source_snapshot = EXCLUDED.source_snapshot,
    completed_at = now(),
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.agent_work_loops (
      source_type, source_key, lane, owner, state, severity, title, detail,
      next_action, due_at, founder_required, blocker, evidence, metadata
    ) VALUES (
      'intelligence_ingestion',
      source_table_name || ':' || COALESCE(source_id, 'unknown'),
      'intelligence',
      'Marcus',
      'blocked',
      'today',
      'Repair continuous intelligence ingestion',
      SQLERRM,
      'Retry the source row after repairing the capture contract.',
      now() + interval '24 hours',
      false,
      SQLERRM,
      jsonb_build_object('source_table', source_table_name, 'source_id', source_id),
      jsonb_build_object('retryable', true)
    )
    ON CONFLICT (source_type, source_key) DO UPDATE SET
      state = 'blocked',
      detail = EXCLUDED.detail,
      blocker = EXCLUDED.blocker,
      due_at = EXCLUDED.due_at,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  item RECORD;
  trigger_name TEXT;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('scans', 'scan'),
      ('scan_runs', 'deep_audit_run'),
      ('scan_pages', 'page_scan'),
      ('reports', 'report_delivery'),
      ('report_eval_runs', 'report_eval'),
      ('retrieval_eval_runs', 'retrieval_eval'),
      ('benchmark_run_groups', 'benchmark_run_group'),
      ('query_runs', 'benchmark_query_run'),
      ('query_citations', 'citation_parse'),
      ('benchmark_domain_metrics', 'benchmark_metric'),
      ('seo_measurements', 'seo_measurement'),
      ('seo_opportunities', 'seo_opportunity'),
      ('content_items', 'content_item'),
      ('distribution_jobs', 'distribution_delivery'),
      ('outreach_sends', 'outreach_delivery'),
      ('payments', 'payment'),
      ('user_subscriptions', 'subscription'),
      ('gpm_reports', 'gpm_report'),
      ('startup_recommendations', 'startup_recommendation'),
      ('startup_recommendation_status_events', 'recommendation_status'),
      ('startup_implementation_plan_tasks', 'implementation_task'),
      ('startup_agent_pr_runs', 'implementation_run'),
      ('content_followup_measurements', 'content_measurement'),
      ('commercial_handoff_events', 'commercial_handoff')
    ) AS configured(table_name, source_kind)
  LOOP
    IF to_regclass('public.' || item.table_name) IS NULL THEN
      CONTINUE;
    END IF;
    trigger_name := 'intelligence_capture_' || item.table_name;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, item.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_intelligence_operational_row(%L)',
      trigger_name,
      item.table_name,
      item.source_kind
    );
  END LOOP;
END;
$$;

COMMENT ON TABLE public.agent_work_loop_attempts IS
  'Append-only attempt history so retries and recoveries remain inspectable.';
COMMENT ON TABLE public.content_followup_measurements IS
  'Evidence that published SEO/social work was measured after publication; required before parent opportunity closure.';
COMMENT ON FUNCTION public.capture_intelligence_operational_row() IS
  'Best-effort continuous intelligence index over authoritative operational rows.';
