-- Admin Research Agent (spec §8): watch a small authoritative source list, diff
-- snapshots weekly, and queue PROPOSED claim changes for human review.
-- Hard rules baked into the schema: proposals have a status that never advances on
-- its own; there is no table linking proposals to any production config.

CREATE TABLE public.research_watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  -- 1 = vendor/authoritative docs, 2 = independent study, 3 = vendor blog (lead only)
  tier SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  -- Which spec section a change here affects (e.g. '§2.2 / C3').
  spec_section TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.research_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watch_id UUID NOT NULL REFERENCES public.research_watchlist(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  normalized_excerpt TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX research_snapshots_watch_idx ON public.research_snapshots (watch_id, fetched_at DESC);

CREATE TABLE public.research_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watch_id UUID REFERENCES public.research_watchlist(id) ON DELETE SET NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source_url TEXT NOT NULL,
  source_tier SMALLINT NOT NULL CHECK (source_tier IN (1, 2, 3)),
  spec_section TEXT NOT NULL,
  claim_before TEXT NOT NULL,
  claim_after TEXT NOT NULL,
  evidence TEXT NOT NULL,
  corroboration JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  -- Never auto-advances. Approve = a human then makes the change by hand.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX research_proposals_status_idx ON public.research_proposals (status, detected_at DESC);

-- Service-role only (RLS on, no policies) — same posture as outreach tables.
ALTER TABLE public.research_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_proposals ENABLE ROW LEVEL SECURITY;

-- Seed the Tier-1 watchlist (spec §8.2) — the human-reviewed authoritative set.
-- URLs verified live 2026-07-21.
INSERT INTO public.research_watchlist (url, label, tier, spec_section) VALUES
  ('https://developers.openai.com/api/docs/bots', 'OpenAI crawler docs', 1, '§2.1-2.2 / C2-C3'),
  ('https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler', 'Anthropic crawler docs', 1, '§2.1-2.2 / C2-C3'),
  ('https://docs.perplexity.ai/guides/bots', 'Perplexity crawler docs', 1, '§2.1-2.2 / C2-C3'),
  ('https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers', 'Google common crawlers', 1, '§2.1-2.2 / C2-C3'),
  ('https://developers.google.com/search/docs/appearance/ai-features', 'Google Search AI features', 1, '§2.2 / C3'),
  ('https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0', 'Bing crawler docs', 1, '§2.1-2.2 / C2-C3'),
  ('https://llmstxt.org/', 'llms.txt spec/status', 1, '§2.5 / C7');
