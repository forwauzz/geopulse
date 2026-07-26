-- Migration 068: editable AI workforce profiles.
--
-- Runtime capabilities remain code-owned so an accidental UI edit cannot rewire
-- production jobs. Founder-facing identity, role, remit, and portrait are durable
-- settings managed from the Agents console.

CREATE TABLE IF NOT EXISTS public.workforce_profiles (
  id                  TEXT        PRIMARY KEY
                                  CHECK (id IN ('maya', 'noah', 'priya', 'elena', 'sofia', 'jordan', 'marcus')),
  name                TEXT        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  role                TEXT        NOT NULL CHECK (char_length(role) BETWEEN 2 AND 100),
  job                 TEXT        NOT NULL CHECK (char_length(job) BETWEEN 10 AND 500),
  avatar_url          TEXT        NOT NULL CHECK (char_length(avatar_url) BETWEEN 1 AND 1000),
  updated_by_user_id  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.workforce_profiles (id, name, role, job, avatar_url)
VALUES
  ('maya', 'Maya Brooks', 'AI Chief of Staff', 'Runs the company loop, names the commercial bottleneck, and escalates only decisions that need you.', '/team/maya-brooks.webp'),
  ('noah', 'Noah Carter', 'Activation Manager', 'Owns signup, onboarding, workspace provisioning, first value, and recovery.', '/team/noah-carter.webp'),
  ('priya', 'Priya Shah', 'SEO & Customer Outcomes Strategist', 'Owns organic-search growth, turns search evidence into work, verifies progress, and delivers monitoring and competitor intelligence.', '/team/priya-shah.webp'),
  ('elena', 'Elena Park', 'Customer Intelligence Lead', 'Learns from real funnel activity and reports the weakest activation-to-revenue handoff every week.', '/team/elena-park.webp'),
  ('sofia', 'Sofia Chen', 'Trend & Audience Researcher', 'Finds source-linked AI-search, agency, and small-business trends and hands Jordan a scored, original daily slate.', '/team/sofia-chen.webp'),
  ('jordan', 'Jordan Reyes', 'Social Producer & Publisher', 'Turns Sofia''s slate and verified GEO-Pulse proof into original, crop-safe posts and schedules the daily mix.', '/team/jordan-reyes.webp'),
  ('marcus', 'Marcus Reed', 'Reliability Engineer', 'Watches queues, report delivery, social publishing, Stripe, schedules, and self-improvement.', '/team/marcus-reed.webp')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS workforce_profiles_updated_at ON public.workforce_profiles;
CREATE TRIGGER workforce_profiles_updated_at
  BEFORE UPDATE ON public.workforce_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.workforce_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workforce_profiles FROM anon, authenticated;
GRANT ALL ON public.workforce_profiles TO service_role;
