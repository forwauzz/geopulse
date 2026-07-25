-- Migration 067: autonomous SEO owner with explicit spend controls.
--
-- Search Console is the free observation backbone. DataForSEO is a metered
-- enrichment source whose every paid task is recorded before the agent can
-- schedule more work. All tables are service-role only.

CREATE TABLE IF NOT EXISTS public.seo_provider_connections (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                 TEXT        NOT NULL UNIQUE,
  status                   TEXT        NOT NULL DEFAULT 'connected'
                                          CHECK (status IN ('connected', 'expired', 'error', 'disabled')),
  site_url                 TEXT,
  access_token_encrypted   TEXT,
  refresh_token_encrypted  TEXT,
  expires_at               TIMESTAMPTZ,
  scopes                   TEXT[]      NOT NULL DEFAULT '{}',
  metadata                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at           TIMESTAMPTZ,
  last_error               TEXT,
  connected_by             UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword           TEXT        NOT NULL,
  normalized_keyword TEXT       GENERATED ALWAYS AS (lower(trim(keyword))) STORED,
  source            TEXT        NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('manual', 'search_console', 'dataforseo', 'seed')),
  priority          SMALLINT    NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  cadence           TEXT        NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily', 'weekly')),
  intent            TEXT        NOT NULL DEFAULT 'unknown'
                                  CHECK (intent IN ('commercial', 'transactional', 'informational', 'navigational', 'unknown')),
  active            BOOLEAN     NOT NULL DEFAULT true,
  last_checked_at   TIMESTAMPTZ,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_keyword)
);

CREATE INDEX IF NOT EXISTS seo_keywords_due_idx
  ON public.seo_keywords (active, priority, last_checked_at);

CREATE TABLE IF NOT EXISTS public.seo_rank_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_task_id  TEXT        NOT NULL UNIQUE,
  keyword_id        UUID        NOT NULL REFERENCES public.seo_keywords(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN ('queued', 'complete', 'failed')),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  cost_usd          NUMERIC(12,6) NOT NULL DEFAULT 0,
  error             TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS seo_rank_tasks_status_idx
  ON public.seo_rank_tasks (status, requested_at);

CREATE TABLE IF NOT EXISTS public.seo_measurements (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT        NOT NULL CHECK (source IN ('google_search_console', 'dataforseo_serp')),
  keyword_id        UUID        REFERENCES public.seo_keywords(id) ON DELETE CASCADE,
  measured_on       DATE        NOT NULL,
  position          NUMERIC(10,3),
  clicks            INTEGER,
  impressions       INTEGER,
  ctr               NUMERIC(10,6),
  page_url          TEXT,
  competitors       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  raw_summary       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, keyword_id, measured_on)
);

CREATE INDEX IF NOT EXISTS seo_measurements_recent_idx
  ON public.seo_measurements (measured_on DESC, source);

CREATE TABLE IF NOT EXISTS public.seo_api_usage (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT        NOT NULL,
  operation         TEXT        NOT NULL,
  request_count     INTEGER     NOT NULL DEFAULT 1 CHECK (request_count > 0),
  cost_usd          NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_api_usage_month_idx
  ON public.seo_api_usage (provider, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.seo_opportunities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_key   TEXT        NOT NULL UNIQUE,
  kind              TEXT        NOT NULL CHECK (kind IN (
                                      'striking_distance',
                                      'high_impression_low_ctr',
                                      'content_gap',
                                      'ranking_drop',
                                      'technical'
                                    )),
  status            TEXT        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN ('queued', 'in_progress', 'completed', 'dismissed')),
  priority          SMALLINT    NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  title             TEXT        NOT NULL,
  evidence          TEXT        NOT NULL,
  recommendation    TEXT        NOT NULL,
  keyword_id        UUID        REFERENCES public.seo_keywords(id) ON DELETE SET NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS seo_opportunities_queue_idx
  ON public.seo_opportunities (status, priority, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.seo_agent_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type          TEXT        NOT NULL CHECK (run_type IN ('hourly', 'manual')),
  status            TEXT        NOT NULL CHECK (status IN ('running', 'completed', 'skipped', 'failed')),
  reason            TEXT,
  search_console_rows INTEGER   NOT NULL DEFAULT 0,
  rank_tasks_queued INTEGER     NOT NULL DEFAULT 0,
  rank_tasks_completed INTEGER  NOT NULL DEFAULT 0,
  opportunities_created INTEGER NOT NULL DEFAULT 0,
  month_spend_usd   NUMERIC(12,6) NOT NULL DEFAULT 0,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS seo_agent_runs_recent_idx
  ON public.seo_agent_runs (started_at DESC);

INSERT INTO public.automation_settings (feature, enabled, kill_switch, config)
VALUES (
  'seo_agent',
  true,
  false,
  '{
    "monthly_budget_usd": 10,
    "target_monthly_spend_usd": 5,
    "daily_keyword_cap": 100,
    "weekly_keyword_cap": 250,
    "search_console_hour_utc": 10,
    "dataforseo_hour_utc": 11,
    "domain": "getgeopulse.com",
    "site_url": "sc-domain:getgeopulse.com"
  }'::jsonb
)
ON CONFLICT (feature) DO NOTHING;

INSERT INTO public.seo_keywords (keyword, source, priority, cadence, intent)
VALUES
  ('geo optimization', 'seed', 1, 'daily', 'commercial'),
  ('generative engine optimization', 'seed', 1, 'daily', 'commercial'),
  ('ai visibility platform', 'seed', 1, 'daily', 'commercial'),
  ('ai search visibility', 'seed', 1, 'daily', 'commercial'),
  ('ai visibility audit', 'seed', 1, 'daily', 'transactional'),
  ('geo audit', 'seed', 1, 'daily', 'transactional'),
  ('ai seo audit', 'seed', 1, 'daily', 'transactional'),
  ('ai citation tracking', 'seed', 1, 'daily', 'commercial'),
  ('chatgpt visibility tracking', 'seed', 1, 'daily', 'commercial'),
  ('ai search monitoring', 'seed', 1, 'daily', 'commercial'),
  ('seo for ai search', 'seed', 2, 'weekly', 'commercial'),
  ('how to rank in chatgpt', 'seed', 2, 'weekly', 'informational'),
  ('how to get cited by ai', 'seed', 2, 'weekly', 'informational'),
  ('answer engine optimization', 'seed', 2, 'weekly', 'commercial'),
  ('llm visibility tracking', 'seed', 2, 'weekly', 'commercial'),
  ('ai brand monitoring', 'seed', 2, 'weekly', 'commercial'),
  ('ai search analytics', 'seed', 2, 'weekly', 'commercial'),
  ('competitor ai visibility', 'seed', 2, 'weekly', 'commercial'),
  ('agency ai visibility reports', 'seed', 2, 'weekly', 'transactional'),
  ('white label ai visibility report', 'seed', 2, 'weekly', 'transactional'),
  ('geo marketing platform', 'seed', 2, 'weekly', 'commercial'),
  ('best geo tools', 'seed', 2, 'weekly', 'commercial'),
  ('best ai visibility tools', 'seed', 2, 'weekly', 'commercial'),
  ('ai website audit', 'seed', 2, 'weekly', 'transactional'),
  ('ai readiness audit', 'seed', 2, 'weekly', 'transactional')
ON CONFLICT (normalized_keyword) DO NOTHING;

ALTER TABLE public.seo_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_rank_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_agent_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.seo_api_usage IS
  'Authoritative paid-provider usage ledger. The SEO agent sums this table before every paid call.';
COMMENT ON TABLE public.seo_opportunities IS
  'Durable hand-off queue from the SEO owner to content, fix-it, and founder review workflows.';
