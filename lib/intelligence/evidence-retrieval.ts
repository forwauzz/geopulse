type Db = { from(table: string): any };

export type IntelligenceTenantScope =
  | { readonly platformInternal: true; readonly tenantType?: never; readonly tenantId?: never }
  | {
      readonly platformInternal?: false;
      readonly tenantType: 'startup_workspace' | 'agency_account' | 'agency_client' | 'user';
      readonly tenantId: string;
    };

export type IntelligenceEvidenceQuery = IntelligenceTenantScope & {
  readonly domainHost?: string | null;
  readonly sourceKinds?: readonly string[];
  readonly sourceIds?: readonly string[];
  readonly laneId?: string | null;
  readonly observedAfter?: string | null;
  readonly limit?: number;
};

export type RetrievedIntelligenceEvidence = {
  readonly evidenceId: string;
  readonly sourceKind: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly observedAt: string | null;
  readonly excerpt: string | null;
  readonly sourceUrl: string | null;
  readonly qualityState: 'valid' | 'valid_partial';
  readonly tenantType: string | null;
  readonly tenantId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type IntelligenceEvidenceResult =
  | {
      readonly status: 'ready';
      readonly evidence: readonly RetrievedIntelligenceEvidence[];
      readonly limitations: readonly string[];
    }
  | {
      readonly status: 'insufficient_evidence';
      readonly evidence: readonly [];
      readonly limitations: readonly string[];
    };

function cleanHost(value: string | null | undefined): string | null {
  const cleaned = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  return cleaned || null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRun(row: Record<string, unknown>): Record<string, unknown> {
  const relation = row['intelligence_runs'];
  if (Array.isArray(relation)) return object(relation[0]);
  return object(relation);
}

function safeSourceUrl(row: Record<string, unknown>): string | null {
  const metadata = object(row['metadata']);
  const candidates = [metadata['source_url'], row['artifact_ref']];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') return url.toString();
    } catch {
      // Database pointers such as reports:uuid are inspectable internally but
      // are not customer-facing links.
    }
  }
  return null;
}

async function resolveDomainId(db: Db, host: string | null): Promise<string | null> {
  if (!host) return null;
  const { data } = await db
    .from('intelligence_domains')
    .select('id')
    .eq('normalized_host', host)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

function boundedLimit(value: number | undefined): number {
  return Math.min(Math.max(Math.floor(value ?? 20), 1), 50);
}

async function readEvidenceRows(args: {
  readonly db: Db;
  readonly query: IntelligenceEvidenceQuery;
  readonly domainId: string | null;
  readonly privacy: readonly string[];
  readonly privateTenant?: { readonly type: string; readonly id: string };
}): Promise<Record<string, unknown>[]> {
  let request = args.db
    .from('intelligence_evidence_objects')
    .select(
      'stable_evidence_id,source_kind,source_table,source_id,collected_at,inline_excerpt,artifact_ref,privacy,tenant_type,tenant_id,metadata,intelligence_runs!inner(quality_state,lane_id,observed_at)',
    )
    .eq('artifact_status', 'present')
    .in('intelligence_runs.quality_state', ['valid', 'valid_partial'])
    .in('privacy', args.privacy);
  if (args.domainId) request = request.eq('canonical_domain_id', args.domainId);
  if (args.query.sourceKinds?.length) request = request.in('source_kind', [...args.query.sourceKinds]);
  if (args.query.sourceIds?.length) request = request.in('source_id', [...args.query.sourceIds]);
  if (args.query.laneId) request = request.eq('intelligence_runs.lane_id', args.query.laneId);
  if (args.query.observedAfter) request = request.gte('collected_at', args.query.observedAfter);
  if (args.privateTenant) {
    request = request
      .eq('tenant_type', args.privateTenant.type)
      .eq('tenant_id', args.privateTenant.id);
  }
  request = request
    .order('collected_at', { ascending: false })
    .limit(boundedLimit(args.query.limit));
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * One small, structured retrieval contract for all product consumers.
 * Operational rows stay authoritative and vector infrastructure is not used.
 */
export async function retrieveIntelligenceEvidence(
  db: Db,
  query: IntelligenceEvidenceQuery,
): Promise<IntelligenceEvidenceResult> {
  const domainId = await resolveDomainId(db, cleanHost(query.domainHost));
  if (query.domainHost && !domainId) {
    return {
      status: 'insufficient_evidence',
      evidence: [],
      limitations: ['The domain has not been indexed by the intelligence layer yet.'],
    };
  }

  const rows = query.platformInternal
    ? await readEvidenceRows({
        db,
        query,
        domainId,
        privacy: ['internal', 'shared', 'public', 'private_tenant'],
      })
    : [
        ...await readEvidenceRows({
          db,
          query,
          domainId,
          privacy: ['shared', 'public'],
        }),
        ...await readEvidenceRows({
          db,
          query,
          domainId,
          privacy: ['private_tenant'],
          privateTenant: { type: query.tenantType, id: query.tenantId },
        }),
      ];

  const unique = new Map<string, RetrievedIntelligenceEvidence>();
  for (const row of rows) {
    const evidenceId = String(row['stable_evidence_id'] ?? '');
    if (!evidenceId || unique.has(evidenceId)) continue;
    const run = readRun(row);
    const qualityState = run['quality_state'] === 'valid_partial' ? 'valid_partial' : 'valid';
    unique.set(evidenceId, {
      evidenceId,
      sourceKind: String(row['source_kind'] ?? ''),
      sourceTable: String(row['source_table'] ?? ''),
      sourceId: String(row['source_id'] ?? ''),
      observedAt: typeof row['collected_at'] === 'string'
        ? row['collected_at']
        : typeof run['observed_at'] === 'string'
          ? run['observed_at']
          : null,
      excerpt: typeof row['inline_excerpt'] === 'string' ? row['inline_excerpt'] : null,
      sourceUrl: safeSourceUrl(row),
      qualityState,
      tenantType: typeof row['tenant_type'] === 'string' ? row['tenant_type'] : null,
      tenantId: typeof row['tenant_id'] === 'string' ? row['tenant_id'] : null,
      metadata: object(row['metadata']),
    });
  }

  const evidence = [...unique.values()].slice(0, boundedLimit(query.limit));
  if (evidence.length === 0) {
    return {
      status: 'insufficient_evidence',
      evidence: [],
      limitations: ['No eligible, source-backed evidence matched this scope.'],
    };
  }
  return {
    status: 'ready',
    evidence,
    limitations: evidence.some((item) => item.qualityState === 'valid_partial')
      ? ['Some evidence is partial and must not be presented as a complete measurement.']
      : [],
  };
}
