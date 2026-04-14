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

export type GroundingProvenanceSnapshot = {
  readonly status: 'matched' | 'unresolved';
  readonly matchMethod: 'exact_url' | 'normalized_page' | null;
  readonly confidence: number | null;
  readonly groundingEvidenceId: string | null;
};

export type GroundingClaimMatchSnapshot = {
  readonly status: 'supported_overlap' | 'weak_overlap' | 'no_overlap' | 'unavailable';
  readonly claimText: string | null;
  readonly overlapTokenCount: number;
  readonly claimTokenCount: number;
  readonly evidenceTokenCount: number;
  readonly overlapRatio: number;
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

export function readBenchmarkGroundingProvenance(
  metadata: Record<string, unknown>
): GroundingProvenanceSnapshot {
  const value = metadata['grounding_provenance'];
  if (!value || typeof value !== 'object') {
    return {
      status: 'unresolved',
      matchMethod: null,
      confidence: null,
      groundingEvidenceId: null,
    };
  }

  const record = value as Record<string, unknown>;
  const status = record['status'] === 'matched' ? 'matched' : 'unresolved';

  return {
    status,
    matchMethod:
      record['match_method'] === 'exact_url' || record['match_method'] === 'normalized_page'
        ? record['match_method']
        : null,
    confidence:
      typeof record['confidence'] === 'number' && Number.isFinite(record['confidence'])
        ? record['confidence']
        : null,
    groundingEvidenceId:
      typeof record['grounding_evidence_id'] === 'string' &&
      record['grounding_evidence_id'].trim().length > 0
        ? record['grounding_evidence_id']
        : null,
  };
}

export function readBenchmarkGroundingClaimMatch(
  metadata: Record<string, unknown>
): GroundingClaimMatchSnapshot {
  const value = metadata['grounding_claim_match'];
  if (!value || typeof value !== 'object') {
    return {
      status: 'unavailable',
      claimText: null,
      overlapTokenCount: 0,
      claimTokenCount: 0,
      evidenceTokenCount: 0,
      overlapRatio: 0,
    };
  }

  const record = value as Record<string, unknown>;
  const status =
    record['status'] === 'supported_overlap' ||
    record['status'] === 'weak_overlap' ||
    record['status'] === 'no_overlap' ||
    record['status'] === 'unavailable'
      ? record['status']
      : 'unavailable';

  return {
    status,
    claimText:
      typeof record['claim_text'] === 'string' && record['claim_text'].trim().length > 0
        ? record['claim_text']
        : null,
    overlapTokenCount:
      typeof record['overlap_token_count'] === 'number' &&
      Number.isFinite(record['overlap_token_count'])
        ? record['overlap_token_count']
        : 0,
    claimTokenCount:
      typeof record['claim_token_count'] === 'number' &&
      Number.isFinite(record['claim_token_count'])
        ? record['claim_token_count']
        : 0,
    evidenceTokenCount:
      typeof record['evidence_token_count'] === 'number' &&
      Number.isFinite(record['evidence_token_count'])
        ? record['evidence_token_count']
        : 0,
    overlapRatio:
      typeof record['overlap_ratio'] === 'number' && Number.isFinite(record['overlap_ratio'])
        ? record['overlap_ratio']
        : 0,
  };
}
