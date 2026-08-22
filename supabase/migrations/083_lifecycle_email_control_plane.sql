-- Issue #413: durable, service-role-only lifecycle email outbox and audit ledger.

CREATE TABLE public.lifecycle_email_templates (
  template_key TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('transactional', 'marketing')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lifecycle_email_preferences (
  email TEXT PRIMARY KEY CHECK (email = lower(trim(email))),
  transactional_enabled BOOLEAN NOT NULL DEFAULT true,
  marketing_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lifecycle_email_suppressions (
  email TEXT NOT NULL CHECK (email = lower(trim(email))),
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'marketing')),
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint', 'unsubscribe', 'cancellation', 'conversion', 'operator')),
  source TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, scope)
);

CREATE TABLE public.lifecycle_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  template_key TEXT NOT NULL REFERENCES public.lifecycle_email_templates(template_key),
  category TEXT NOT NULL CHECK (category IN ('transactional', 'marketing')),
  recipient_email TEXT NOT NULL CHECK (recipient_email = lower(trim(recipient_email))),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject_id TEXT,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','retrying','sent','delivered','failed','bounced','complained','suppressed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT UNIQUE,
  last_error TEXT,
  escalated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lifecycle_email_due_idx ON public.lifecycle_email_deliveries (next_attempt_at, created_at)
  WHERE status IN ('queued', 'retrying');
CREATE INDEX lifecycle_email_status_idx ON public.lifecycle_email_deliveries (status, created_at DESC);
CREATE INDEX lifecycle_email_recipient_idx ON public.lifecycle_email_deliveries (recipient_email, created_at DESC);

CREATE TABLE public.lifecycle_email_delivery_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES public.lifecycle_email_deliveries(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_event_id TEXT UNIQUE,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.lifecycle_email_templates (template_key, category, subject_template, body_template) VALUES
 ('account_created','transactional','Welcome to GEO-Pulse, {{first_name}}','Your account is ready. Add your business and run the first baseline so GEO-Pulse can show what AI buyers can verify and what to fix next.\n\n{{cta_url}}'),
 ('checkout_received','transactional','We received your GEO-Pulse order for {{domain}}','Payment was received and your audit is being prepared. We will email the finished report automatically.\n\nTrack it here: {{cta_url}}'),
 ('monitoring_activated','transactional','Monthly monitoring is active for {{domain}}','Monitoring is active for {{domain}}. Your next report is scheduled for {{next_report_date}}.\n\n{{cta_url}}'),
 ('subscription_activated','transactional','Your {{plan_name}} workspace is ready','Your workspace is ready. Start with a baseline scan, review the prioritized fixes, and configure the buyer questions you want to measure.\n\n{{cta_url}}'),
 ('trial_ending','transactional','Your {{plan_name}} trial ends soon','Your trial ends in about three days and will continue automatically unless you cancel.\n\n{{cta_url}}'),
 ('payment_failed','transactional','Action needed: payment failed for GEO-Pulse','We could not process your latest payment. Update your payment method to keep monitoring and report access active.\n\n{{cta_url}}'),
 ('payment_recovered','transactional','Your GEO-Pulse payment is back on track','Payment succeeded and your account is active again.\n\n{{cta_url}}'),
 ('subscription_cancelled','transactional','Your GEO-Pulse subscription was cancelled','Your subscription has been cancelled. Existing reports remain available according to your account retention terms.\n\n{{cta_url}}'),
 ('report_delayed','transactional','Update on your GEO-Pulse report for {{domain}}','Your report needs more processing time. We are retrying it automatically; no action is required.\n\n{{cta_url}}'),
 ('onboarding_reminder','transactional','Finish your GEO-Pulse baseline','Your workspace is waiting for its first business and baseline scan. Complete setup to reach your first useful result.\n\n{{cta_url}}'),
 ('internal_exception_digest','transactional','GEO-Pulse lifecycle email exceptions — {{date}}','{{summary}}\n\n{{cta_url}}')
ON CONFLICT (template_key) DO NOTHING;

ALTER TABLE public.lifecycle_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_email_delivery_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifecycle_email_templates, public.lifecycle_email_preferences,
  public.lifecycle_email_suppressions, public.lifecycle_email_deliveries, public.lifecycle_email_delivery_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lifecycle_email_delivery_events_id_seq TO service_role;

COMMENT ON TABLE public.lifecycle_email_deliveries IS 'Durable lifecycle-email outbox and current delivery state. Payload excludes secrets and email body content.';
COMMENT ON TABLE public.lifecycle_email_delivery_events IS 'Append-only provider and retry evidence for lifecycle email delivery.';
