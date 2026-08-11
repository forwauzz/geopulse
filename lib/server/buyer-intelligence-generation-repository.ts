import { z } from 'zod';

export const buyerIntelligenceGenerationViewSchema = z.enum([
  'prospect_preview',
  'full_baseline',
  'monthly_brief',
]);
export type BuyerIntelligenceGenerationView = z.infer<typeof buyerIntelligenceGenerationViewSchema>;

export const buyerIntelligenceGenerationStatusSchema = z.enum([
  'queued',
  'rendering',
  'succeeded',
  'failed',
]);
export type BuyerIntelligenceGenerationStatus = z.infer<typeof buyerIntelligenceGenerationStatusSchema>;

const requestSchema = z.object({
  agencyAccountId: z.string().uuid(),
  agencyClientId: z.string().uuid(),
  snapshotId: z.string().min(8).max(160),
  viewKind: buyerIntelligenceGenerationViewSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{8,160}$/),
  requestedByUserId: z.string().uuid(),
  branding: z.record(z.string(), z.unknown()),
  heroR2Key: z.string().min(1).max(512).nullable(),
}).strict();
export type BuyerIntelligenceGenerationRequest = z.infer<typeof requestSchema>;

export type BuyerIntelligenceGeneration = BuyerIntelligenceGenerationRequest & {
  readonly id: string;
  readonly status: BuyerIntelligenceGenerationStatus;
  readonly artifactR2Key: string | null;
  readonly attempts: number;
  readonly errorCode: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BuyerIntelligenceGenerationPersistence = {
  findById(id: string, agencyAccountId: string, agencyClientId: string): Promise<BuyerIntelligenceGeneration | null>;
  findByIdempotencyKey(agencyAccountId: string, idempotencyKey: string): Promise<BuyerIntelligenceGeneration | null>;
  list(agencyAccountId: string, agencyClientId: string, limit: number): Promise<BuyerIntelligenceGeneration[]>;
  insert(request: BuyerIntelligenceGenerationRequest): Promise<BuyerIntelligenceGeneration>;
  transition(args: {
    readonly id: string;
    readonly agencyAccountId: string;
    readonly from: readonly BuyerIntelligenceGenerationStatus[];
    readonly to: BuyerIntelligenceGenerationStatus;
    readonly artifactR2Key?: string | null;
    readonly errorCode?: string | null;
    readonly incrementAttempts?: boolean;
  }): Promise<BuyerIntelligenceGeneration | null>;
};

function sameRequest(row: BuyerIntelligenceGeneration, request: BuyerIntelligenceGenerationRequest): boolean {
  return row.agencyAccountId === request.agencyAccountId
    && row.agencyClientId === request.agencyClientId
    && row.snapshotId === request.snapshotId
    && row.viewKind === request.viewKind
    && row.requestedByUserId === request.requestedByUserId
    && row.heroR2Key === request.heroR2Key
    && stableJson(row.branding) === stableJson(request.branding);
}

function stableJson(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]));
    }
    return input;
  };
  return JSON.stringify(canonical(value));
}

type GenerationRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly agency_client_id: string;
  readonly snapshot_id: string;
  readonly view_kind: BuyerIntelligenceGenerationView;
  readonly status: BuyerIntelligenceGenerationStatus;
  readonly idempotency_key: string;
  readonly requested_by_user_id: string;
  readonly branding: Record<string, unknown>;
  readonly hero_r2_key: string | null;
  readonly artifact_r2_key: string | null;
  readonly attempts: number;
  readonly error_code: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

function fromRow(row: GenerationRow): BuyerIntelligenceGeneration {
  return {
    id: row.id,
    agencyAccountId: row.agency_account_id,
    agencyClientId: row.agency_client_id,
    snapshotId: row.snapshot_id,
    viewKind: buyerIntelligenceGenerationViewSchema.parse(row.view_kind),
    status: buyerIntelligenceGenerationStatusSchema.parse(row.status),
    idempotencyKey: row.idempotency_key,
    requestedByUserId: row.requested_by_user_id,
    branding: row.branding,
    heroR2Key: row.hero_r2_key,
    artifactR2Key: row.artifact_r2_key,
    attempts: row.attempts,
    errorCode: row.error_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BuyerIntelligenceGenerationConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`buyer_intelligence_generation_conflict:${idempotencyKey}`);
    this.name = 'BuyerIntelligenceGenerationConflictError';
  }
}

export function createBuyerIntelligenceGenerationRepository(
  persistence: BuyerIntelligenceGenerationPersistence,
) {
  return {
    async load(id: string, agencyAccountId: string, agencyClientId: string): Promise<BuyerIntelligenceGeneration | null> {
      z.string().uuid().parse(id);
      z.string().uuid().parse(agencyAccountId);
      z.string().uuid().parse(agencyClientId);
      return persistence.findById(id, agencyAccountId, agencyClientId);
    },

    async list(agencyAccountId: string, agencyClientId: string, limit = 20): Promise<BuyerIntelligenceGeneration[]> {
      z.string().uuid().parse(agencyAccountId);
      z.string().uuid().parse(agencyClientId);
      return persistence.list(agencyAccountId, agencyClientId, Math.max(1, Math.min(limit, 100)));
    },

    async claim(input: BuyerIntelligenceGenerationRequest): Promise<{ generation: BuyerIntelligenceGeneration; execute: boolean }> {
      const request = requestSchema.parse(input);
      const existing = await persistence.findByIdempotencyKey(request.agencyAccountId, request.idempotencyKey);
      if (existing) {
        if (!sameRequest(existing, request)) throw new BuyerIntelligenceGenerationConflictError(request.idempotencyKey);
        if (existing.status !== 'failed') return { generation: existing, execute: false };
        const retried = await persistence.transition({
          id: existing.id, agencyAccountId: request.agencyAccountId,
          from: ['failed'], to: 'queued', errorCode: null, incrementAttempts: true,
        });
        if (!retried) throw new Error(`buyer_intelligence_generation_retry_race:${existing.id}`);
        return { generation: retried, execute: true };
      }
      try {
        return { generation: await persistence.insert(request), execute: true };
      } catch (error) {
        const raced = await persistence.findByIdempotencyKey(request.agencyAccountId, request.idempotencyKey);
        if (!raced) throw error;
        if (!sameRequest(raced, request)) throw new BuyerIntelligenceGenerationConflictError(request.idempotencyKey);
        return { generation: raced, execute: false };
      }
    },

    async start(generation: BuyerIntelligenceGeneration): Promise<BuyerIntelligenceGeneration> {
      const next = await persistence.transition({
        id: generation.id, agencyAccountId: generation.agencyAccountId,
        from: ['queued'], to: 'rendering', errorCode: null,
      });
      if (!next) throw new Error(`buyer_intelligence_generation_start_race:${generation.id}`);
      return next;
    },

    async succeed(generation: BuyerIntelligenceGeneration, artifactR2Key: string): Promise<BuyerIntelligenceGeneration> {
      const key = z.string().min(1).max(512).parse(artifactR2Key);
      const next = await persistence.transition({
        id: generation.id, agencyAccountId: generation.agencyAccountId,
        from: ['rendering'], to: 'succeeded', artifactR2Key: key, errorCode: null,
      });
      if (!next) throw new Error(`buyer_intelligence_generation_success_race:${generation.id}`);
      return next;
    },

    async fail(generation: BuyerIntelligenceGeneration, errorCode: string): Promise<BuyerIntelligenceGeneration> {
      const code = z.string().regex(/^[a-z0-9_:-]{3,120}$/).parse(errorCode);
      const next = await persistence.transition({
        id: generation.id, agencyAccountId: generation.agencyAccountId,
        from: ['queued', 'rendering'], to: 'failed', artifactR2Key: null, errorCode: code,
      });
      if (!next) throw new Error(`buyer_intelligence_generation_failure_race:${generation.id}`);
      return next;
    },
  };
}

export function createSupabaseBuyerIntelligenceGenerationRepository(
  supabase: { from(table: string): any },
) {
  const persistence: BuyerIntelligenceGenerationPersistence = {
    async findById(id, agencyAccountId, agencyClientId) {
      const { data, error } = await supabase.from('buyer_intelligence_generations')
        .select('*').eq('id', id).eq('agency_account_id', agencyAccountId)
        .eq('agency_client_id', agencyClientId).maybeSingle();
      if (error) throw error;
      return data ? fromRow(data as GenerationRow) : null;
    },
    async list(agencyAccountId, agencyClientId, limit) {
      const { data, error } = await supabase.from('buyer_intelligence_generations')
        .select('*').eq('agency_account_id', agencyAccountId)
        .eq('agency_client_id', agencyClientId)
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((row: GenerationRow) => fromRow(row));
    },
    async findByIdempotencyKey(agencyAccountId, idempotencyKey) {
      const { data, error } = await supabase.from('buyer_intelligence_generations')
        .select('*').eq('agency_account_id', agencyAccountId)
        .eq('idempotency_key', idempotencyKey).maybeSingle();
      if (error) throw error;
      return data ? fromRow(data as GenerationRow) : null;
    },
    async insert(request) {
      const { data, error } = await supabase.from('buyer_intelligence_generations').insert({
        agency_account_id: request.agencyAccountId,
        agency_client_id: request.agencyClientId,
        snapshot_id: request.snapshotId,
        view_kind: request.viewKind,
        idempotency_key: request.idempotencyKey,
        requested_by_user_id: request.requestedByUserId,
        branding: request.branding,
        hero_r2_key: request.heroR2Key,
      }).select('*').single();
      if (error || !data) throw error ?? new Error('buyer_intelligence_generation_insert_failed');
      return fromRow(data as GenerationRow);
    },
    async transition(args) {
      const now = new Date().toISOString();
      const values: Record<string, unknown> = {
        status: args.to,
        error_code: args.errorCode,
        ...(args.artifactR2Key !== undefined ? { artifact_r2_key: args.artifactR2Key } : {}),
        ...(args.to === 'rendering' ? { started_at: now, completed_at: null } : {}),
        ...(args.to === 'succeeded' || args.to === 'failed' ? { completed_at: now } : {}),
      };
      let expectedAttempts: number | null = null;
      if (args.incrementAttempts) {
        const { data: current, error: readError } = await supabase.from('buyer_intelligence_generations')
          .select('attempts').eq('id', args.id).eq('agency_account_id', args.agencyAccountId).maybeSingle();
        if (readError) throw readError;
        if (!current) return null;
        expectedAttempts = Number(current.attempts);
        values['attempts'] = expectedAttempts + 1;
        values['completed_at'] = null;
      }
      for (const key of Object.keys(values)) if (values[key] === undefined) delete values[key];
      let query = supabase.from('buyer_intelligence_generations')
        .update(values).eq('id', args.id).eq('agency_account_id', args.agencyAccountId)
        .in('status', [...args.from]);
      if (expectedAttempts !== null) query = query.eq('attempts', expectedAttempts);
      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw error;
      return data ? fromRow(data as GenerationRow) : null;
    },
  };
  return createBuyerIntelligenceGenerationRepository(persistence);
}
