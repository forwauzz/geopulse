-- MBI-9: reuse the lifecycle outbox for hands-off monthly intelligence delivery.
INSERT INTO public.lifecycle_email_templates (
  template_key,
  category,
  subject_template,
  body_template
) VALUES (
  'monthly_intelligence_ready',
  'transactional',
  '{{company_name}} monthly buyer-intelligence report is ready',
  'Your latest buyer-intelligence report for {{company_name}} is ready. It shows what changed, which recommended fixes were verified, and what to do next.\n\n{{cta_url}}'
)
ON CONFLICT (template_key) DO NOTHING;
