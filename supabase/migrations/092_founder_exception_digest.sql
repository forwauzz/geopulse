-- OPS-10: exception-only founder notification through the existing lifecycle outbox.
INSERT INTO public.lifecycle_email_templates (
  template_key,
  category,
  subject_template,
  body_template
) VALUES (
  'founder_exception_digest',
  'transactional',
  'GEO-Pulse needs your attention — {{date}}',
  '{{summary}}\n\n{{cta_url}}'
)
ON CONFLICT (template_key) DO NOTHING;
