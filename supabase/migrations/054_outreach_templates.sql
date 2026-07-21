-- Outreach message templates (spec §9): admin-authored subject/body templates with
-- variables, assignable per prospect. Free-text or HTML body; branding applied by the
-- renderer for text bodies. Service-role only, like the rest of outreach.

CREATE TABLE public.outreach_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'text' CHECK (body_format IN ('text', 'html')),
  body_template TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- At most one default template.
CREATE UNIQUE INDEX outreach_templates_one_default
  ON public.outreach_templates (is_default)
  WHERE is_default;

-- Service-role only: RLS on, no policies (same posture as outreach_prospects).
ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;

-- A prospect may pin a template; otherwise the default (or built-in) applies.
ALTER TABLE public.outreach_prospects
  ADD COLUMN template_id UUID REFERENCES public.outreach_templates(id) ON DELETE SET NULL;
