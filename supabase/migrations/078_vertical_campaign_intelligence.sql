-- Migration 078: one vertical-scoped campaign identity above the existing
-- intelligence, SEO, content, distribution, outreach, and attribution ledgers.
--
-- Raw evidence remains market-neutral. Only active campaigns may turn qualified
-- evidence into execution work. All new tables remain service-role only.

CREATE TABLE IF NOT EXISTS public.growth_campaigns (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key        TEXT        NOT NULL UNIQUE,
  name                TEXT        NOT NULL,
  role                TEXT        NOT NULL
                                  CHECK (role IN ('primary', 'challenger')),
  status              TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'active', 'paused', 'completed', 'stopped')),
  vertical            TEXT        NOT NULL
                                  CHECK (vertical IN ('msp_it_services', 'marketing_agencies')),
  subvertical         TEXT,
  geo_region          TEXT,
  buyer_role          TEXT        NOT NULL,
  primary_problem     TEXT        NOT NULL,
  offer_key           TEXT        NOT NULL,
  cta_goal            TEXT        NOT NULL,
  allocation_percent  SMALLINT    NOT NULL
                                  CHECK (allocation_percent BETWEEN 1 AND 100),
  success_condition   TEXT        NOT NULL,
  stop_condition      TEXT        NOT NULL,
  starts_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at             TIMESTAMPTZ,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_campaigns_one_active_role_idx
  ON public.growth_campaigns (role)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS growth_campaigns_one_active_vertical_idx
  ON public.growth_campaigns (vertical)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS growth_campaigns_status_allocation_idx
  ON public.growth_campaigns (status, role, allocation_percent DESC);

CREATE TABLE IF NOT EXISTS public.growth_campaign_interventions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          UUID        NOT NULL REFERENCES public.growth_campaigns(id) ON DELETE CASCADE,
  intervention_key     TEXT        NOT NULL UNIQUE,
  name                 TEXT        NOT NULL,
  channel              TEXT        NOT NULL
                                   CHECK (channel IN (
                                     'seo', 'website', 'email', 'linkedin', 'instagram', 'sales'
                                   )),
  status               TEXT        NOT NULL DEFAULT 'planned'
                                   CHECK (status IN (
                                     'planned', 'running', 'evaluating', 'scaled',
                                     'revised', 'stopped', 'completed'
                                   )),
  hypothesis           TEXT        NOT NULL,
  meaningful_variable  TEXT        NOT NULL,
  success_condition    TEXT        NOT NULL,
  stop_condition       TEXT        NOT NULL,
  evidence_ids         TEXT[]      NOT NULL DEFAULT '{}',
  source_run_ids       UUID[]      NOT NULL DEFAULT '{}',
  started_at           TIMESTAMPTZ,
  ended_at             TIMESTAMPTZ,
  metadata             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growth_campaign_interventions_campaign_status_idx
  ON public.growth_campaign_interventions (campaign_id, status, channel);

ALTER TABLE public.seo_opportunities
  ADD COLUMN IF NOT EXISTS growth_campaign_id UUID
    REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS growth_intervention_id UUID
    REFERENCES public.growth_campaign_interventions(id) ON DELETE SET NULL;

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS growth_campaign_id UUID
    REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS growth_intervention_id UUID
    REFERENCES public.growth_campaign_interventions(id) ON DELETE SET NULL;

ALTER TABLE public.outreach_prospects
  ADD COLUMN IF NOT EXISTS growth_campaign_id UUID
    REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS growth_intervention_id UUID
    REFERENCES public.growth_campaign_interventions(id) ON DELETE SET NULL;

ALTER TABLE public.distribution_assets
  ADD COLUMN IF NOT EXISTS growth_campaign_id UUID
    REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS growth_intervention_id UUID
    REFERENCES public.growth_campaign_interventions(id) ON DELETE SET NULL;

ALTER TABLE analytics.marketing_events
  ADD COLUMN IF NOT EXISTS growth_campaign_id UUID
    REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS growth_intervention_id UUID
    REFERENCES public.growth_campaign_interventions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS seo_opportunities_growth_campaign_idx
  ON public.seo_opportunities (growth_campaign_id, status, priority, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS content_items_growth_campaign_idx
  ON public.content_items (growth_campaign_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS outreach_prospects_growth_campaign_idx
  ON public.outreach_prospects (growth_campaign_id, lifecycle_status, next_run_at);
CREATE INDEX IF NOT EXISTS distribution_assets_growth_campaign_idx
  ON public.distribution_assets (growth_campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_events_growth_campaign_idx
  ON analytics.marketing_events (growth_campaign_id, event_name, event_ts DESC);

INSERT INTO public.growth_campaigns (
  id,
  campaign_key,
  name,
  role,
  status,
  vertical,
  subvertical,
  geo_region,
  buyer_role,
  primary_problem,
  offer_key,
  cta_goal,
  allocation_percent,
  success_condition,
  stop_condition,
  metadata
)
VALUES
  (
    '00000000-0000-4000-8000-000000000801',
    'msp-qc-first-customer-2026q3',
    'Quebec MSP first recurring customer',
    'primary',
    'active',
    'msp_it_services',
    'managed_service_providers',
    'Quebec, Canada',
    'msp_owner_operator',
    'MSPs do not know whether AI answers understand and recommend their services for buyer questions.',
    'evidence_led_visibility_baseline',
    'free_scan_then_walkthrough',
    80,
    'At least one qualified reply within 25 step-two sends and one non-Jack active recurring subscription.',
    'Revise the message after 50 step-two sends with zero qualified replies; stop any intervention that breaches consent, quality, or spend controls.',
    '{"owner":"Codex","sales_owner":"Elena","evidence_owner":"Priya","production_owner":"Jordan","quality_owner":"Maya","runtime_owner":"Marcus"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000802',
    'agency-challenger-2026q3',
    'Marketing agency challenger',
    'challenger',
    'active',
    'marketing_agencies',
    'small_marketing_agencies',
    'Canada',
    'agency_owner',
    'Agencies need credible AI-visibility evidence and recurring client reporting without another manual reporting workflow.',
    'agency_client_visibility_baseline',
    'free_scan_then_walkthrough',
    20,
    'A qualified agency reply or walkthrough request from a bounded challenger sample.',
    'Pause after the bounded challenger sample if it produces no qualified intent or distracts from the MSP primary campaign.',
    '{"owner":"Codex","sales_owner":"Elena","evidence_owner":"Priya","production_owner":"Jordan","quality_owner":"Maya","runtime_owner":"Marcus"}'::jsonb
  )
ON CONFLICT (campaign_key) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  vertical = EXCLUDED.vertical,
  subvertical = EXCLUDED.subvertical,
  geo_region = EXCLUDED.geo_region,
  buyer_role = EXCLUDED.buyer_role,
  primary_problem = EXCLUDED.primary_problem,
  offer_key = EXCLUDED.offer_key,
  cta_goal = EXCLUDED.cta_goal,
  allocation_percent = EXCLUDED.allocation_percent,
  success_condition = EXCLUDED.success_condition,
  stop_condition = EXCLUDED.stop_condition,
  metadata = public.growth_campaigns.metadata || EXCLUDED.metadata,
  updated_at = now();

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
  '00000000-0000-4000-8000-000000000811',
  '00000000-0000-4000-8000-000000000801',
  'msp-qc-reply-first-followup-v1',
  'MSP reply-first follow-up',
  'email',
  'running',
  'A concise ownership question tied to one confirmed visibility gap will produce more human replies than repeating the full scorecard.',
  'Step-two message and reply CTA',
  'At least one qualified reply within 25 step-two sends.',
  'Revise after 50 step-two sends with zero replies.',
  now(),
  '{"owner":"Elena","comparison_label":"bounded_directional_signal","one_variable_only":true}'::jsonb
)
ON CONFLICT (intervention_key) DO UPDATE SET
  status = EXCLUDED.status,
  hypothesis = EXCLUDED.hypothesis,
  meaningful_variable = EXCLUDED.meaningful_variable,
  success_condition = EXCLUDED.success_condition,
  stop_condition = EXCLUDED.stop_condition,
  metadata = public.growth_campaign_interventions.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Preserve existing MSP and agency outreach while adding durable campaign lineage.
UPDATE public.outreach_prospects
SET growth_campaign_id = CASE
      WHEN segment = 'msp-qc' THEN '00000000-0000-4000-8000-000000000801'::uuid
      WHEN segment IN ('marketing-agencies', 'marketing-agencies-qc-extra')
        THEN '00000000-0000-4000-8000-000000000802'::uuid
      ELSE growth_campaign_id
    END,
    growth_intervention_id = CASE
      WHEN segment = 'msp-qc'
        THEN '00000000-0000-4000-8000-000000000811'::uuid
      ELSE growth_intervention_id
    END,
    updated_at = now()
WHERE segment IN ('msp-qc', 'marketing-agencies', 'marketing-agencies-qc-extra');

-- Only explicit vertical evidence is campaign-eligible during backfill. Broad
-- category evidence remains indexed and queued without creating new work.
UPDATE public.seo_opportunities
SET growth_campaign_id = '00000000-0000-4000-8000-000000000802'::uuid,
    metadata = metadata || '{"campaign_vertical":"marketing_agencies","campaign_gate":"explicit_vertical_match"}'::jsonb
WHERE growth_campaign_id IS NULL
  AND lower(concat_ws(' ', title, evidence, recommendation)) ~
      '(agency|agencies|white[ -]?label|client reporting)';

UPDATE public.seo_opportunities
SET growth_campaign_id = '00000000-0000-4000-8000-000000000801'::uuid,
    metadata = metadata || '{"campaign_vertical":"msp_it_services","campaign_gate":"explicit_vertical_match"}'::jsonb
WHERE growth_campaign_id IS NULL
  AND lower(concat_ws(' ', title, evidence, recommendation)) ~
      '(^|[^a-z])(msp|msps)([^a-z]|$)|managed service provider|it services';

UPDATE public.content_items AS content
SET growth_campaign_id = opportunity.growth_campaign_id,
    growth_intervention_id = opportunity.growth_intervention_id,
    metadata = content.metadata || jsonb_build_object(
      'growth_campaign_id', opportunity.growth_campaign_id,
      'growth_intervention_id', opportunity.growth_intervention_id
    ),
    updated_at = now()
FROM public.seo_opportunities AS opportunity
WHERE content.growth_campaign_id IS NULL
  AND opportunity.growth_campaign_id IS NOT NULL
  AND content.metadata->>'seo_opportunity_id' = opportunity.id::text;

UPDATE analytics.marketing_events AS event
SET growth_campaign_id = content.growth_campaign_id,
    growth_intervention_id = content.growth_intervention_id
FROM public.content_items AS content
WHERE event.growth_campaign_id IS NULL
  AND event.content_id = content.content_id
  AND content.growth_campaign_id IS NOT NULL;

-- Add focused query inventory. Broad/category keywords remain available as
-- background evidence, but these seeds can produce campaign-eligible findings.
INSERT INTO public.seo_keywords (
  keyword,
  source,
  priority,
  cadence,
  intent,
  metadata
)
VALUES
  ('ai visibility for managed service providers', 'seed', 1, 'daily', 'commercial',
    '{"campaign_vertical":"msp_it_services","campaign_key":"msp-qc-first-customer-2026q3"}'::jsonb),
  ('ai search visibility for MSPs', 'seed', 1, 'daily', 'commercial',
    '{"campaign_vertical":"msp_it_services","campaign_key":"msp-qc-first-customer-2026q3"}'::jsonb),
  ('ChatGPT recommendations for MSPs', 'seed', 1, 'daily', 'commercial',
    '{"campaign_vertical":"msp_it_services","campaign_key":"msp-qc-first-customer-2026q3"}'::jsonb),
  ('managed service provider AI audit', 'seed', 1, 'daily', 'transactional',
    '{"campaign_vertical":"msp_it_services","campaign_key":"msp-qc-first-customer-2026q3"}'::jsonb),
  ('MSP AI visibility report', 'seed', 1, 'daily', 'transactional',
    '{"campaign_vertical":"msp_it_services","campaign_key":"msp-qc-first-customer-2026q3"}'::jsonb),
  ('AI search monitoring for MSPs', 'seed', 2, 'weekly', 'commercial',
    '{"campaign_vertical":"msp_it_services","campaign_key":"msp-qc-first-customer-2026q3"}'::jsonb),
  ('AI visibility reporting for agencies', 'seed', 1, 'daily', 'transactional',
    '{"campaign_vertical":"marketing_agencies","campaign_key":"agency-challenger-2026q3"}'::jsonb),
  ('white label AI visibility report', 'seed', 1, 'daily', 'transactional',
    '{"campaign_vertical":"marketing_agencies","campaign_key":"agency-challenger-2026q3"}'::jsonb)
ON CONFLICT (normalized_keyword) DO UPDATE SET
  priority = LEAST(public.seo_keywords.priority, EXCLUDED.priority),
  cadence = EXCLUDED.cadence,
  intent = EXCLUDED.intent,
  active = true,
  metadata = public.seo_keywords.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Future outreach imports, distribution assets, and marketing events inherit
-- campaign lineage from the canonical segment or content item instead of
-- requiring every writer to duplicate campaign-classification logic.
CREATE OR REPLACE FUNCTION public.inherit_growth_campaign_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'outreach_prospects' THEN
    IF NEW.growth_campaign_id IS NULL AND NEW.segment = 'msp-qc' THEN
      NEW.growth_campaign_id := '00000000-0000-4000-8000-000000000801'::uuid;
      NEW.growth_intervention_id := COALESCE(
        NEW.growth_intervention_id,
        '00000000-0000-4000-8000-000000000811'::uuid
      );
    ELSIF NEW.growth_campaign_id IS NULL
      AND NEW.segment IN ('marketing-agencies', 'marketing-agencies-qc-extra') THEN
      NEW.growth_campaign_id := '00000000-0000-4000-8000-000000000802'::uuid;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'distribution_assets' THEN
    IF NEW.content_item_id IS NOT NULL AND NEW.growth_campaign_id IS NULL THEN
      SELECT content.growth_campaign_id, content.growth_intervention_id
      INTO NEW.growth_campaign_id, NEW.growth_intervention_id
      FROM public.content_items AS content
      WHERE content.id = NEW.content_item_id;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'analytics' AND TG_TABLE_NAME = 'marketing_events' THEN
    IF NEW.content_id IS NOT NULL AND NEW.growth_campaign_id IS NULL THEN
      SELECT content.growth_campaign_id, content.growth_intervention_id
      INTO NEW.growth_campaign_id, NEW.growth_intervention_id
      FROM public.content_items AS content
      WHERE content.content_id = NEW.content_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS growth_campaign_lineage_outreach
  ON public.outreach_prospects;
CREATE TRIGGER growth_campaign_lineage_outreach
  BEFORE INSERT OR UPDATE OF segment, growth_campaign_id, growth_intervention_id
  ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.inherit_growth_campaign_lineage();

DROP TRIGGER IF EXISTS growth_campaign_lineage_distribution
  ON public.distribution_assets;
CREATE TRIGGER growth_campaign_lineage_distribution
  BEFORE INSERT OR UPDATE OF content_item_id, growth_campaign_id, growth_intervention_id
  ON public.distribution_assets
  FOR EACH ROW EXECUTE FUNCTION public.inherit_growth_campaign_lineage();

DROP TRIGGER IF EXISTS growth_campaign_lineage_marketing_event
  ON analytics.marketing_events;
CREATE TRIGGER growth_campaign_lineage_marketing_event
  BEFORE INSERT OR UPDATE OF content_id, growth_campaign_id, growth_intervention_id
  ON analytics.marketing_events
  FOR EACH ROW EXECUTE FUNCTION public.inherit_growth_campaign_lineage();

DROP TRIGGER IF EXISTS growth_campaigns_updated_at ON public.growth_campaigns;
CREATE TRIGGER growth_campaigns_updated_at
  BEFORE UPDATE ON public.growth_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS growth_campaign_interventions_updated_at
  ON public.growth_campaign_interventions;
CREATE TRIGGER growth_campaign_interventions_updated_at
  BEFORE UPDATE ON public.growth_campaign_interventions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.growth_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_campaign_interventions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.growth_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.growth_campaign_interventions TO service_role;

DROP TRIGGER IF EXISTS intelligence_capture_growth_campaigns
  ON public.growth_campaigns;
CREATE TRIGGER intelligence_capture_growth_campaigns
  AFTER INSERT OR UPDATE ON public.growth_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.capture_intelligence_operational_row('growth_campaign');

DROP TRIGGER IF EXISTS intelligence_capture_growth_campaign_interventions
  ON public.growth_campaign_interventions;
CREATE TRIGGER intelligence_capture_growth_campaign_interventions
  AFTER INSERT OR UPDATE ON public.growth_campaign_interventions
  FOR EACH ROW EXECUTE FUNCTION public.capture_intelligence_operational_row('growth_campaign_intervention');

-- The continuous capture triggers are installed after seed insertion so one
-- no-op update indexes the canonical seed rows immediately.
UPDATE public.growth_campaigns
SET updated_at = now()
WHERE campaign_key IN (
  'msp-qc-first-customer-2026q3',
  'agency-challenger-2026q3'
);

UPDATE public.growth_campaign_interventions
SET updated_at = now()
WHERE intervention_key = 'msp-qc-reply-first-followup-v1';

COMMENT ON TABLE public.growth_campaigns IS
  'One active primary vertical campaign and at most one challenger. Raw intelligence remains broader.';
COMMENT ON TABLE public.growth_campaign_interventions IS
  'Bounded one-variable commercial experiments with declared success and stop conditions.';
COMMENT ON COLUMN public.seo_opportunities.growth_campaign_id IS
  'Null means indexed background evidence that is not authorized to create campaign work.';
COMMENT ON COLUMN analytics.marketing_events.growth_campaign_id IS
  'Durable campaign lineage in addition to human-readable UTM campaign values.';
