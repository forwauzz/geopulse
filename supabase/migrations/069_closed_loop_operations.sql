-- One small control ledger above the existing SEO, content, distribution, and
-- campaign tables. The source tables remain authoritative; this table records
-- ownership, SLA, verification, and escalation state.

CREATE TABLE IF NOT EXISTS public.agent_work_loops (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type        TEXT        NOT NULL,
  source_key         TEXT        NOT NULL,
  parent_loop_id     UUID        REFERENCES public.agent_work_loops(id) ON DELETE CASCADE,
  lane               TEXT        NOT NULL,
  owner              TEXT        NOT NULL,
  state              TEXT        NOT NULL DEFAULT 'assigned'
                                    CHECK (state IN (
                                      'discovered',
                                      'assigned',
                                      'executing',
                                      'verifying',
                                      'blocked',
                                      'completed',
                                      'dismissed'
                                    )),
  severity           TEXT        NOT NULL DEFAULT 'normal'
                                    CHECK (severity IN ('urgent', 'today', 'normal', 'watch')),
  title              TEXT        NOT NULL,
  detail             TEXT,
  next_action        TEXT,
  due_at              TIMESTAMPTZ,
  attempt_count      INTEGER     NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts       INTEGER     NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  founder_required   BOOLEAN     NOT NULL DEFAULT false,
  blocker            TEXT,
  evidence           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_attempted_at  TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_key)
);

CREATE INDEX IF NOT EXISTS agent_work_loops_queue_idx
  ON public.agent_work_loops (state, founder_required, due_at ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS agent_work_loops_parent_idx
  ON public.agent_work_loops (parent_loop_id, state);

CREATE INDEX IF NOT EXISTS agent_work_loops_lane_idx
  ON public.agent_work_loops (lane, updated_at DESC);

DROP TRIGGER IF EXISTS agent_work_loops_updated_at ON public.agent_work_loops;
CREATE TRIGGER agent_work_loops_updated_at
  BEFORE UPDATE ON public.agent_work_loops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.agent_work_loops ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.agent_work_loops IS
  'Minimal evidence-gated lifecycle above existing agent source tables. Service-role only.';
