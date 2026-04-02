-- DE-001
-- Generalized schema foundation for the future distribution engine.
-- This is intentionally schema-first: account auth, typed assets, media, jobs, and attempts
-- exist before any generalized social/video adapter implementation.

CREATE TABLE public.distribution_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL,
  account_label TEXT NOT NULL,
  external_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  default_audience_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distribution_accounts_provider_check CHECK (
    provider_name IN (
      'buttondown',
      'kit',
      'ghost',
      'beehiiv',
      'mailchimp',
      'x',
      'linkedin',
      'threads',
      'reddit',
      'instagram',
      'facebook',
      'youtube',
      'tiktok',
      'custom'
    )
  ),
  CONSTRAINT distribution_accounts_status_check CHECK (
    status IN ('draft', 'connected', 'token_expired', 'revoked', 'disconnected', 'error')
  )
);

CREATE TABLE public.distribution_account_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distribution_account_id UUID NOT NULL REFERENCES public.distribution_accounts(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distribution_account_tokens_type_check CHECK (
    token_type IN ('oauth', 'api_key', 'bearer_token', 'session_token')
  ),
  CONSTRAINT distribution_account_tokens_secret_present_check CHECK (
    access_token_encrypted IS NOT NULL OR refresh_token_encrypted IS NOT NULL
  ),
  CONSTRAINT distribution_account_tokens_scope_array_check CHECK (
    jsonb_typeof(scopes) = 'array'
  ),
  CONSTRAINT distribution_account_tokens_account_type_unique UNIQUE (
    distribution_account_id,
    token_type
  )
);

CREATE TABLE public.distribution_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id TEXT NOT NULL UNIQUE,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'content_item',
  source_key TEXT,
  asset_type TEXT NOT NULL,
  provider_family TEXT NOT NULL,
  title TEXT,
  body_markdown TEXT,
  body_plaintext TEXT,
  caption_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  cta_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distribution_assets_source_type_check CHECK (
    source_type IN ('content_item', 'benchmark_insight', 'manual')
  ),
  CONSTRAINT distribution_assets_source_presence_check CHECK (
    (source_type = 'content_item' AND content_item_id IS NOT NULL)
    OR source_type <> 'content_item'
  ),
  CONSTRAINT distribution_assets_type_check CHECK (
    asset_type IN (
      'newsletter_email',
      'link_post',
      'thread_post',
      'single_image_post',
      'carousel_post',
      'short_video_post',
      'long_video_post'
    )
  ),
  CONSTRAINT distribution_assets_provider_family_check CHECK (
    provider_family IN (
      'newsletter',
      'x',
      'linkedin',
      'threads',
      'reddit',
      'instagram',
      'facebook',
      'youtube',
      'tiktok',
      'generic'
    )
  ),
  CONSTRAINT distribution_assets_status_check CHECK (
    status IN ('draft', 'review', 'approved', 'scheduled', 'published', 'failed', 'archived')
  )
);

CREATE TABLE public.distribution_asset_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distribution_asset_id UUID NOT NULL REFERENCES public.distribution_assets(id) ON DELETE CASCADE,
  media_kind TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  mime_type TEXT,
  alt_text TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  provider_ready_status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distribution_asset_media_kind_check CHECK (
    media_kind IN ('image', 'carousel_slide', 'video', 'thumbnail', 'document', 'audio')
  ),
  CONSTRAINT distribution_asset_media_sort_order_check CHECK (
    sort_order >= 0
  ),
  CONSTRAINT distribution_asset_media_ready_status_check CHECK (
    provider_ready_status IN ('pending', 'ready', 'uploaded', 'invalid', 'failed')
  )
);

CREATE TABLE public.distribution_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id TEXT NOT NULL UNIQUE,
  distribution_asset_id UUID NOT NULL REFERENCES public.distribution_assets(id) ON DELETE CASCADE,
  distribution_account_id UUID NOT NULL REFERENCES public.distribution_accounts(id),
  publish_mode TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  destination_url TEXT,
  provider_post_id TEXT,
  last_error TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distribution_jobs_publish_mode_check CHECK (
    publish_mode IN ('draft', 'scheduled', 'publish_now')
  ),
  CONSTRAINT distribution_jobs_status_check CHECK (
    status IN ('draft', 'queued', 'scheduled', 'processing', 'published', 'failed', 'cancelled')
  ),
  CONSTRAINT distribution_jobs_schedule_required_check CHECK (
    (publish_mode = 'scheduled' AND scheduled_for IS NOT NULL)
    OR publish_mode <> 'scheduled'
  )
);

CREATE TABLE public.distribution_job_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distribution_job_id UUID NOT NULL REFERENCES public.distribution_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  request_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_status_code INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT distribution_job_attempts_attempt_number_check CHECK (
    attempt_number > 0
  ),
  CONSTRAINT distribution_job_attempts_unique_attempt UNIQUE (
    distribution_job_id,
    attempt_number
  )
);

CREATE UNIQUE INDEX distribution_accounts_provider_external_unique_idx
  ON public.distribution_accounts (provider_name, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE INDEX distribution_accounts_provider_status_updated_at_idx
  ON public.distribution_accounts (provider_name, status, updated_at DESC);

CREATE INDEX distribution_account_tokens_account_expires_at_idx
  ON public.distribution_account_tokens (distribution_account_id, expires_at ASC NULLS LAST);

CREATE INDEX distribution_assets_content_item_created_at_idx
  ON public.distribution_assets (content_item_id, created_at DESC);

CREATE INDEX distribution_assets_provider_status_created_at_idx
  ON public.distribution_assets (provider_family, status, created_at DESC);

CREATE INDEX distribution_assets_source_created_at_idx
  ON public.distribution_assets (source_type, created_at DESC);

CREATE INDEX distribution_asset_media_asset_sort_order_idx
  ON public.distribution_asset_media (distribution_asset_id, sort_order ASC, created_at ASC);

CREATE INDEX distribution_jobs_account_status_created_at_idx
  ON public.distribution_jobs (distribution_account_id, status, created_at DESC);

CREATE INDEX distribution_jobs_schedule_status_idx
  ON public.distribution_jobs (status, scheduled_for ASC NULLS LAST, created_at DESC);

CREATE INDEX distribution_jobs_asset_created_at_idx
  ON public.distribution_jobs (distribution_asset_id, created_at DESC);

CREATE INDEX distribution_job_attempts_job_created_at_idx
  ON public.distribution_job_attempts (distribution_job_id, created_at DESC);

CREATE TRIGGER distribution_accounts_updated_at
  BEFORE UPDATE ON public.distribution_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER distribution_account_tokens_updated_at
  BEFORE UPDATE ON public.distribution_account_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER distribution_assets_updated_at
  BEFORE UPDATE ON public.distribution_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER distribution_asset_media_updated_at
  BEFORE UPDATE ON public.distribution_asset_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER distribution_jobs_updated_at
  BEFORE UPDATE ON public.distribution_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.distribution_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_account_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_asset_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_job_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.distribution_accounts IS 'Connected external publishing identities for the future generalized distribution engine; service-role only.';
COMMENT ON TABLE public.distribution_account_tokens IS 'Stored token lifecycle state for connected distribution accounts; service-role only.';
COMMENT ON TABLE public.distribution_assets IS 'Typed downstream assets derived from canonical GEO-Pulse content or future benchmark insights; service-role only.';
COMMENT ON TABLE public.distribution_asset_media IS 'Media attachments and provider-readiness state for one typed distribution asset; service-role only.';
COMMENT ON TABLE public.distribution_jobs IS 'Queued or immediate publish operations for one distribution asset against one connected account; service-role only.';
COMMENT ON TABLE public.distribution_job_attempts IS 'Per-attempt delivery history for one distribution job; service-role only.';

COMMENT ON COLUMN public.distribution_accounts.account_id IS 'Stable internal distribution-account identifier used across admin and queue workflows.';
COMMENT ON COLUMN public.distribution_accounts.external_account_id IS 'Provider-native account/channel/publication identifier when available.';
COMMENT ON COLUMN public.distribution_account_tokens.access_token_encrypted IS 'Encrypted-at-rest token material placeholder; application layer owns real encryption discipline.';
COMMENT ON COLUMN public.distribution_assets.asset_id IS 'Stable internal distribution-asset identifier separate from the row UUID.';
COMMENT ON COLUMN public.distribution_assets.source_key IS 'Stable upstream record key when the source is not a canonical content_item row.';
COMMENT ON COLUMN public.distribution_assets.provider_family IS 'Target destination family for capability and rendering rules, not a concrete connected account.';
COMMENT ON COLUMN public.distribution_asset_media.storage_url IS 'R2 or other durable media reference for downstream publishing workflows.';
COMMENT ON COLUMN public.distribution_jobs.job_id IS 'Stable internal distribution-job identifier separate from the row UUID.';
COMMENT ON COLUMN public.distribution_jobs.publish_mode IS 'Operator intent: save draft, schedule for later, or publish immediately.';
