-- CM-003
-- Add Buttondown as a first-class newsletter destination option.

ALTER TABLE public.content_distribution_destinations
  DROP CONSTRAINT IF EXISTS content_distribution_destinations_provider_check;

ALTER TABLE public.content_distribution_destinations
  ADD CONSTRAINT content_distribution_destinations_provider_check CHECK (
    provider_name IN ('kit', 'ghost', 'beehiiv', 'buttondown', 'mailchimp', 'reddit', 'linkedin', 'x', 'custom')
  );

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
    'buttondown_newsletter',
    'newsletter',
    'buttondown',
    'Buttondown',
    false,
    false,
    false,
    true,
    true,
    true,
    'free_or_higher',
    'not_configured',
    'Free-tier API draft support is available, but BUTTONDOWN_API_KEY is not configured yet.',
    '{"recommended_rank":3,"notes":"Simple free-tier API-first newsletter option."}'::jsonb
  )
ON CONFLICT (destination_key) DO UPDATE SET
  destination_type = EXCLUDED.destination_type,
  provider_name = EXCLUDED.provider_name,
  display_name = EXCLUDED.display_name,
  requires_paid_plan = EXCLUDED.requires_paid_plan,
  supports_api_publish = EXCLUDED.supports_api_publish,
  supports_scheduling = EXCLUDED.supports_scheduling,
  supports_public_archive = EXCLUDED.supports_public_archive,
  plan_tier = EXCLUDED.plan_tier,
  availability_status = EXCLUDED.availability_status,
  availability_reason = EXCLUDED.availability_reason,
  metadata = EXCLUDED.metadata;
