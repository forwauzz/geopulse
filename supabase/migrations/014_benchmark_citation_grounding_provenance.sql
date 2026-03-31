-- Benchmark citation grounding provenance (BM-032)
-- Preserve exact grounded-page attribution when a parsed citation URL matches run-time grounding evidence.

ALTER TABLE public.query_citations
  ADD COLUMN grounding_evidence_id TEXT,
  ADD COLUMN grounding_page_url TEXT,
  ADD COLUMN grounding_page_type TEXT;

CREATE INDEX query_citations_grounding_evidence_id_idx
  ON public.query_citations (grounding_evidence_id);

COMMENT ON COLUMN public.query_citations.grounding_evidence_id IS 'Deterministic grounding evidence identifier when a citation matches a specific grounded evidence item.';
COMMENT ON COLUMN public.query_citations.grounding_page_url IS 'Exact grounded page URL matched to the citation when provenance is resolved.';
COMMENT ON COLUMN public.query_citations.grounding_page_type IS 'Grounded page classification such as homepage, about, or services when provenance is resolved.';
