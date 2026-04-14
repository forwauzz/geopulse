-- CM-002
-- Provider control-plane for downstream content distribution.
-- Keeps GEO-Pulse canonical while allowing multiple destinations to be enabled or disabled explicitly.

CREATE TABLE public.content_distribution_destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destination_key TEXT NOT NULL UNIQUE,
  destination_type TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  requires_paid_plan BOOLEAN NOT NULL DEFAULT false,
  supports_api_publish BOOLEAN NOT NULL DEFAULT false,
  supports_scheduling BOOLEAN NOT NULL DEFAULT false,
  supports_public_archive BOOLEAN NOT NULL DEFAULT false,
  plan_tier TEXT,
  availability_status TEXT NOT NULL DEFAULT 'not_configured',
  availability_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_distribution_destinations_type_check CHECK (
    destination_type IN ('newsletter', 'social', 'syndication', 'website')
  ),
  CONSTRAINT content_distribution_destinations_provider_check CHECK (
    provider_name IN ('kit', 'ghost', 'beehiiv', 'mailchimp', 'reddit', 'linkedin', 'x', 'custom')
  ),
  CONSTRAINT content_distribution_destinations_availability_check CHECK (
    availability_status IN ('available', 'not_configured', 'plan_blocked', 'api_unavailable', 'disabled')
  )
);

CREATE UNIQUE INDEX content_distribution_destinations_default_idx
  ON public.content_distribution_destinations (destination_type)
  WHERE is_default = true;

CREATE INDEX content_distribution_destinations_type_enabled_idx
  ON public.content_distribution_destinations (destination_type, enabled, updated_at DESC);

CREATE TRIGGER content_distribution_destinations_updated_at
  BEFORE UPDATE ON public.content_distribution_destinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.content_distribution_destinations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.content_distribution_destinations (
  destination_key,
  destination_type,
  provider_name,
  display_name,
  enabled,
  is_default,
  requires_paid_plan,
  supports_api_publish,
  supports_scheduling,
  supports_public_archive,
  plan_tier,
  availability_status,
  availability_reason,
  metadata
)
VALUES
  (
    'kit_newsletter',
    'newsletter',
    'kit',
    'Kit',
    false,
    false,
    true,
    true,
    true,
    true,
    'creator_or_higher',
    'not_configured',
    'Recommended first API target, but credentials and plan are not configured yet.',
    '{"recommended_rank":1,"notes":"Best fit for canonical-site-first workflow."}'::jsonb
  ),
  (
    'ghost_newsletter',
    'newsletter',
    'ghost',
    'Ghost',
    false,
    false,
    true,
    true,
    true,
    true,
    'pro_or_self_hosted',
    'not_configured',
    'Strong alternative if Ghost becomes the publishing system itself.',
    '{"recommended_rank":2,"notes":"Better if canonical publication moves into Ghost."}'::jsonb
  ),
  (
    'beehiiv_newsletter',
    'newsletter',
    'beehiiv',
    'beehiiv',
    false,
    false,
    true,
    false,
    true,
    true,
    'enterprise_for_post_api',
    'plan_blocked',
    'Create-post API is currently enterprise-only, so this is not lean V1 friendly.',
    '{"recommended_rank":4,"notes":"Do not treat as first integration target."}'::jsonb
  ),
  (
    'mailchimp_newsletter',
    'newsletter',
    'mailchimp',
    'Mailchimp',
    false,
    false,
    true,
    true,
    true,
    false,
    'standard_or_higher',
    'not_configured',
    'Usable for campaigns, but weaker fit for public newsletter publication.',
    '{"recommended_rank":3,"notes":"Treat as campaign-oriented fallback, not the first publication target."}'::jsonb
  );

COMMENT ON TABLE public.content_distribution_destinations IS 'Admin-controlled provider registry and feature-flag surface for downstream content distribution; service-role only.';
COMMENT ON COLUMN public.content_distribution_destinations.destination_key IS 'Stable internal key used by adapters and admin controls.';
COMMENT ON COLUMN public.content_distribution_destinations.requires_paid_plan IS 'True when the destination is not realistically usable on a free tier.';
COMMENT ON COLUMN public.content_distribution_destinations.availability_status IS 'Current operator-facing reason a destination is usable, blocked, or not configured.';
