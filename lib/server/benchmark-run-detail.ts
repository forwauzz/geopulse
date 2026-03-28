export type GroundingEvidenceSnapshot = {
  readonly evidence_id: string | null;
  readonly source_label: string;
  readonly page_type: string | null;
  readonly page_url: string | null;
  readonly evidence_label: string | null;
  readonly page_title: string | null;
  readonly fetch_status: string | null;
  readonly fetch_order: number | null;
  readonly selection_reason: string | null;
  readonly excerpt: string;
};

export function formatBenchmarkRunTimestamp(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatBenchmarkPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return `${Math.round(value * 100)}%`;
}

export function formatBenchmarkCount(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return String(value);
}

export function readBenchmarkResponseBody(metadata: Record<string, unknown>): string | null {
  const value = metadata['response_body'];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readBenchmarkGroundingEvidence(
  metadata: Record<string, unknown>
): GroundingEvidenceSnapshot[] {
  const value = metadata['grounding_evidence'];
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const sourceLabel =
        typeof record['source_label'] === 'string' ? record['source_label'] : '';
      const excerpt = typeof record['excerpt'] === 'string' ? record['excerpt'] : '';
      if (!sourceLabel.trim() || !excerpt.trim()) return null;

      return {
        evidence_id:
          typeof record['evidence_id'] === 'string' && record['evidence_id'].trim().length > 0
            ? record['evidence_id']
            : null,
        source_label: sourceLabel,
        page_type:
          typeof record['page_type'] === 'string' && record['page_type'].trim().length > 0
            ? record['page_type']
            : null,
        page_url:
          typeof record['page_url'] === 'string' && record['page_url'].trim().length > 0
            ? record['page_url']
            : null,
        evidence_label:
          typeof record['evidence_label'] === 'string' &&
          record['evidence_label'].trim().length > 0
            ? record['evidence_label']
            : null,
        page_title:
          typeof record['page_title'] === 'string' && record['page_title'].trim().length > 0
            ? record['page_title']
            : null,
        fetch_status:
          typeof record['fetch_status'] === 'string' && record['fetch_status'].trim().length > 0
            ? record['fetch_status']
            : null,
        fetch_order:
          typeof record['fetch_order'] === 'number' && Number.isFinite(record['fetch_order'])
            ? record['fetch_order']
            : null,
        selection_reason:
          typeof record['selection_reason'] === 'string' &&
          record['selection_reason'].trim().length > 0
            ? record['selection_reason']
            : null,
        excerpt,
      } satisfies GroundingEvidenceSnapshot;
    })
    .filter((item): item is GroundingEvidenceSnapshot => item !== null);
}
