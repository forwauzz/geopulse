-- MBI-9B: honest notification when a monthly measurement is blocked before comparison.
INSERT INTO public.lifecycle_email_templates (
  template_key,
  category,
  subject_template,
  body_template
) VALUES (
  'monthly_intelligence_blocked',
  'transactional',
  'We could not recheck {{domain}} yet',
  'The monthly check was blocked before measurement, so GEO-Pulse preserved the last valid report and did not claim new movement or verified fixes. We will retry automatically. If you manage the site firewall, allow GEO-PulseBot.\n\n{{cta_url}}'
)
ON CONFLICT (template_key) DO NOTHING;
