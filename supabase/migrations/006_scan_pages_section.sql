-- DA-002: Section label for path-prefix coverage reporting.

ALTER TABLE public.scan_pages
  ADD COLUMN IF NOT EXISTS section TEXT;

COMMENT ON COLUMN public.scan_pages.section IS 'Top-level path segment (e.g. /blog) for section-aware crawl coverage';
