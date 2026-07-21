-- CASL unsubscribe (issue #97): a durable marker so an unsubscribed prospect can
-- never be silently re-enabled by a later import or admin toggle mishap.
-- Code fails soft before this is applied (enabled=false still stops sends).

ALTER TABLE public.outreach_prospects
  ADD COLUMN unsubscribed_at TIMESTAMP WITH TIME ZONE;
