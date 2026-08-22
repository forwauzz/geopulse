import type { BuyerIntelligenceSnapshot } from '@/lib/intelligence/buyer-intelligence-contract';
import { buildBuyerIntelligenceView } from '@/lib/intelligence/buyer-intelligence-view-model';
import type { BrandConfig } from '@workers/report/report-branding';
import { buildBuyerIntelligenceAgencyReportPdf } from './agency-report-pdf';
import type {
  BuyerIntelligenceGeneration,
  BuyerIntelligenceGenerationRequest,
} from './buyer-intelligence-generation-repository';

type GenerationRepository = {
  claim(request: BuyerIntelligenceGenerationRequest): Promise<{ generation: BuyerIntelligenceGeneration; execute: boolean }>;
  start(generation: BuyerIntelligenceGeneration): Promise<BuyerIntelligenceGeneration>;
  succeed(generation: BuyerIntelligenceGeneration, artifactR2Key: string): Promise<BuyerIntelligenceGeneration>;
  fail(generation: BuyerIntelligenceGeneration, errorCode: string): Promise<BuyerIntelligenceGeneration>;
};

type ArtifactBucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
};

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /storage/i.test(error.message)) return 'storage_failed';
  return 'render_failed';
}

export async function generateBuyerIntelligenceArtifact(args: {
  readonly request: BuyerIntelligenceGenerationRequest;
  readonly snapshot: BuyerIntelligenceSnapshot;
  readonly brand: BrandConfig;
  readonly heroImageBytes?: Uint8Array | null;
  readonly heroImageMime?: 'image/png' | 'image/jpeg';
  readonly repository: GenerationRepository;
  readonly bucket: ArtifactBucket;
}): Promise<{ readonly generation: BuyerIntelligenceGeneration; readonly bytes: Uint8Array; readonly reused: boolean }> {
  const claimed = await args.repository.claim(args.request);
  if (!claimed.execute) {
    if (claimed.generation.status !== 'succeeded' || !claimed.generation.artifactR2Key) {
      throw new Error(`buyer_intelligence_generation_in_progress:${claimed.generation.id}`);
    }
    const stored = await args.bucket.get(claimed.generation.artifactR2Key);
    if (!stored) throw new Error(`buyer_intelligence_generation_artifact_missing:${claimed.generation.id}`);
    return { generation: claimed.generation, bytes: new Uint8Array(await stored.arrayBuffer()), reused: true };
  }

  let active = claimed.generation;
  try {
    active = await args.repository.start(active);
    const model = buildBuyerIntelligenceView({
      kind: args.request.viewKind,
      snapshot: args.snapshot,
      ...(args.request.viewKind === 'prospect_preview'
        ? { fullBaselineHref: `https://getgeopulse.com/report/${encodeURIComponent(args.snapshot.snapshotId)}` }
        : {}),
    });
    const bytes = await buildBuyerIntelligenceAgencyReportPdf(model, {
      brand: args.brand,
      heroImageBytes: args.heroImageBytes,
      heroImageMime: args.heroImageMime,
    });
    const artifactR2Key = `buyer-intelligence/${args.request.agencyAccountId}/${args.request.agencyClientId}/${active.id}.pdf`;
    await args.bucket.put(artifactR2Key, bytes, {
      httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
    });
    const succeeded = await args.repository.succeed(active, artifactR2Key);
    return { generation: succeeded, bytes, reused: false };
  } catch (error) {
    await args.repository.fail(active, safeErrorCode(error)).catch(() => undefined);
    throw error;
  }
}
