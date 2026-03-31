-- CM-001
-- Canonical content inventory for the site-first content machine.
-- Stores briefs/drafts on GEO-Pulse first, then tracks downstream newsletter syndication.

CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  content_type TEXT NOT NULL,
  target_persona TEXT,
  primary_problem TEXT,
  topic_cluster TEXT,
  keyword_cluster TEXT,
  cta_goal TEXT NOT NULL DEFAULT 'free_scan',
  source_type TEXT NOT NULL DEFAULT 'internal_plus_research',
  source_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  market_language_snippets JSONB NOT NULL DEFAULT '[]'::jsonb,
  brief_markdown TEXT,
  draft_markdown TEXT,
  canonical_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_items_status_check CHECK (
    status IN ('idea', 'brief', 'draft', 'review', 'approved', 'published', 'archived')
  ),
  CONSTRAINT content_items_type_check CHECK (
    content_type IN ('article', 'newsletter', 'brief', 'social_post', 'research_note')
  ),
  CONSTRAINT content_items_cta_goal_check CHECK (
    cta_goal IN ('free_scan', 'newsletter_signup', 'paid_deep_audit')
  ),
  CONSTRAINT content_items_source_type_check CHECK (
    source_type IN ('internal_product', 'external_research', 'internal_plus_research', 'founder_input')
  )
);

CREATE TABLE public.content_distribution_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  destination_type TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  destination_post_id TEXT,
  destination_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_distribution_deliveries_type_check CHECK (
    destination_type IN ('newsletter', 'social', 'syndication', 'website')
  ),
  CONSTRAINT content_distribution_deliveries_status_check CHECK (
    status IN ('pending', 'drafted', 'queued', 'published', 'failed', 'archived')
  )
);

CREATE INDEX content_items_status_updated_at_idx
  ON public.content_items (status, updated_at DESC);

CREATE INDEX content_items_type_updated_at_idx
  ON public.content_items (content_type, updated_at DESC);

CREATE INDEX content_items_persona_updated_at_idx
  ON public.content_items (target_persona, updated_at DESC);

CREATE INDEX content_distribution_deliveries_item_created_at_idx
  ON public.content_distribution_deliveries (content_item_id, created_at DESC);

CREATE INDEX content_distribution_deliveries_type_status_created_at_idx
  ON public.content_distribution_deliveries (destination_type, status, created_at DESC);

CREATE TRIGGER content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER content_distribution_deliveries_updated_at
  BEFORE UPDATE ON public.content_distribution_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_distribution_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.content_items IS 'Canonical site-first content records for the GEO-Pulse content machine; service-role only.';
COMMENT ON TABLE public.content_distribution_deliveries IS 'Downstream distribution records for newsletter/social/syndication pushes tied to canonical content items; service-role only.';
COMMENT ON COLUMN public.content_items.content_id IS 'Stable attribution identifier shared with analytics.marketing_events.content_id.';
COMMENT ON COLUMN public.content_items.source_links IS 'Structured source URLs or references backing the brief/draft.';
COMMENT ON COLUMN public.content_items.market_language_snippets IS 'Short saved market-language snippets from research packets; not for blind republishing.';
COMMENT ON COLUMN public.content_distribution_deliveries.destination_name IS 'Concrete downstream outlet such as kit, ghost, reddit, or homepage.';
