import type { PaymentApiEnv } from '@/lib/server/cf-env';
import {
  ContentDestinationPublishError,
  resolveContentDestinationAdapter,
} from '@/lib/server/content-destination-adapters';
import { structuredError, structuredLog } from '@/lib/server/structured-log';
import {
  createDistributionEngineRepository,
  type DistributionAccountRow,
  type DistributionAssetRow,
  type DistributionJobRow,
} from '@/lib/server/distribution-engine-repository';

type SupabaseLike = {
  from(table: string): any;
};

type DispatchSummary = {
  readonly scanned: number;
  readonly dispatched: number;
  readonly succeeded: number;
  readonly failed: number;
};

export type { DispatchSummary };

type DispatchFailureDetails = {
  readonly message: string;
  readonly retryable: boolean;
  readonly providerStatusCode: number | null;
};

type DispatchDependencies = {
  readonly createRepository?: typeof createDistributionEngineRepository;
  readonly resolveAdapter?: typeof resolveContentDestinationAdapter;
  readonly structuredLog?: typeof structuredLog;
  readonly structuredError?: typeof structuredError;
};

type DispatchableContentRow = {
  readonly id: string;
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly keyword_cluster: string | null;
  readonly cta_goal: string;
  readonly source_type: string;
  readonly source_links: string[];
  readonly brief_markdown: string | null;
  readonly draft_markdown: string | null;
  readonly canonical_url: string | null;
  readonly metadata: Record<string, unknown>;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deliveries: unknown[];
};

function buildSyntheticDestination(account: DistributionAccountRow) {
  const destinationType =
    account.provider_name === 'buttondown' || account.provider_name === 'kit' || account.provider_name === 'ghost'
      ? 'newsletter'
      : 'social';

  return {
    id: account.id,
    destination_key: `${account.provider_name}_${account.account_id}`,
    destination_type: destinationType,
    provider_name: account.provider_name,
    display_name: account.account_label,
    enabled: true,
    is_default: false,
    requires_paid_plan: false,
    supports_api_publish: true,
    supports_scheduling: true,
    supports_public_archive: false,
    plan_tier: null,
    availability_status: 'available',
    availability_reason: null,
    metadata: account.metadata ?? {},
    created_at: account.created_at,
    updated_at: account.updated_at,
  } as const;
}

function classifyDispatchError(error: unknown): DispatchFailureDetails {
  if (error instanceof ContentDestinationPublishError) {
    return {
      message: error.message,
      retryable: error.retryable,
      providerStatusCode: error.statusCode,
    };
  }

  if (error instanceof TypeError) {
    return {
      message: error.message || 'Network failure during distribution dispatch.',
      retryable: true,
      providerStatusCode: null,
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown dispatch failure';
  return {
    message,
    retryable: false,
    providerStatusCode: null,
  };
}

export function isRetryableDistributionDispatchError(error: unknown): boolean {
  return classifyDispatchError(error).retryable;
}

async function getDispatchableContentItem(
  supabase: SupabaseLike,
  distributionAsset: DistributionAssetRow
): Promise<DispatchableContentRow | null> {
  if (!distributionAsset.content_item_id) return null;

  const { data, error } = await supabase
    .from('content_items')
    .select(
      'id,content_id,slug,title,status,content_type,target_persona,primary_problem,topic_cluster,keyword_cluster,cta_goal,source_type,source_links,brief_markdown,draft_markdown,canonical_url,metadata,published_at,created_at,updated_at'
    )
    .eq('id', distributionAsset.content_item_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...(data as Omit<DispatchableContentRow, 'source_links' | 'metadata' | 'deliveries'>),
    source_links: Array.isArray((data as Record<string, unknown>).source_links)
      ? ((data as Record<string, unknown>).source_links as string[])
      : [],
    metadata:
      (data as Record<string, unknown>).metadata &&
      typeof (data as Record<string, unknown>).metadata === 'object' &&
      !Array.isArray((data as Record<string, unknown>).metadata)
        ? ((data as Record<string, unknown>).metadata as Record<string, unknown>)
        : {},
    deliveries: [],
  };
}

export async function dispatchDistributionJobs(
  supabase: SupabaseLike,
  env: PaymentApiEnv,
  args?: {
    readonly now?: string;
    readonly limit?: number;
  },
  deps: DispatchDependencies = {}
): Promise<DispatchSummary> {
  const repo = (deps.createRepository ?? createDistributionEngineRepository)(supabase as any);

  const jobs = await repo.listDispatchableJobs({
    now: args?.now,
    limit: args?.limit,
  });

  let dispatched = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    dispatched += 1;
    try {
      const summary = await dispatchDistributionJobById(supabase, env, job.id, deps);
      succeeded += summary.succeeded;
      failed += summary.failed;
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: jobs.length,
    dispatched,
    succeeded,
    failed,
  };
}

export async function dispatchDistributionJobById(
  supabase: SupabaseLike,
  env: PaymentApiEnv,
  distributionJobId: string,
  deps: DispatchDependencies = {}
): Promise<DispatchSummary> {
  const repo = (deps.createRepository ?? createDistributionEngineRepository)(supabase as any);
  const resolveAdapter = deps.resolveAdapter ?? resolveContentDestinationAdapter;
  const log = deps.structuredLog ?? structuredLog;
  const logError = deps.structuredError ?? structuredError;

  const job = await repo.getJobById(distributionJobId);
  if (!job) {
    log(
      'distribution_job_dispatch_skipped',
      { distribution_job_id: distributionJobId, reason: 'job_not_found' },
      'info'
    );
    return { scanned: 1, dispatched: 0, succeeded: 0, failed: 0 };
  }

  if (!['queued', 'scheduled', 'processing'].includes(job.status)) {
    log(
      'distribution_job_dispatch_skipped',
      {
        distribution_job_id: distributionJobId,
        job_id: job.job_id,
        reason: 'job_not_dispatchable',
        status: job.status,
      },
      'info'
    );
    return { scanned: 1, dispatched: 0, succeeded: 0, failed: 0 };
  }

  let currentJob: DistributionJobRow = job;

  try {
    if (currentJob.status !== 'processing') {
      currentJob = await repo.updateJob(job.id, {
        status: 'processing',
        lastError: null,
      });
    }

    const [account, asset] = await Promise.all([
      repo.getAccountById(currentJob.distribution_account_id),
      repo.getAssetById(currentJob.distribution_asset_id),
    ]);

    if (!account) {
      throw new Error('Distribution account not found for job.');
    }
    if (!asset) {
      throw new Error('Distribution asset not found for job.');
    }
    if (asset.source_type !== 'content_item') {
      throw new Error('Only content_item sourced assets are dispatchable in the current runtime.');
    }

    const item = await getDispatchableContentItem(supabase, asset);
    if (!item) {
      throw new Error('Canonical content item not found for asset.');
    }

    const attemptNumber = (await repo.listJobAttempts(currentJob.id)).length + 1;
    const destination = buildSyntheticDestination(account);
    const adapter = resolveAdapter(destination as any);

    const result = await adapter.publishDraft({
      item: item as any,
      destination: destination as any,
      env,
    });

    await repo.createJobAttempt({
      distributionJobId: currentJob.id,
      attemptNumber,
      requestSummary: {
        provider_name: account.provider_name,
        account_id: account.account_id,
        asset_id: asset.asset_id,
        publish_mode: currentJob.publish_mode,
      },
      responseSummary: {
        delivery_status: result.status,
        destination_url: result.destinationUrl,
        provider_publication_id: result.providerPublicationId,
      },
      providerStatusCode: null,
      errorMessage: null,
    });

    await repo.updateJob(currentJob.id, {
      status:
        result.status === 'published'
          ? 'published'
          : result.status === 'queued'
            ? 'queued'
            : 'published',
      destinationUrl: result.destinationUrl,
      providerPostId: result.providerPublicationId,
      lastError: null,
      completedAt: new Date().toISOString(),
    });

    log(
      'distribution_job_dispatch_succeeded',
      {
        job_id: currentJob.job_id,
        account_id: account.account_id,
        provider_name: account.provider_name,
        asset_id: asset.asset_id,
        publish_mode: currentJob.publish_mode,
        result_status: result.status,
      },
      'info'
    );

    return { scanned: 1, dispatched: 1, succeeded: 1, failed: 0 };
  } catch (error) {
    const failure = classifyDispatchError(error);
    const attempts = await repo.listJobAttempts(currentJob.id);

    await repo.createJobAttempt({
      distributionJobId: currentJob.id,
      attemptNumber: attempts.length + 1,
      requestSummary: {
        job_id: currentJob.job_id,
        publish_mode: currentJob.publish_mode,
      },
      responseSummary: {},
      providerStatusCode: failure.providerStatusCode,
      errorMessage: failure.message,
    });

    await repo.updateJob(currentJob.id, {
      status: failure.retryable
        ? currentJob.publish_mode === 'scheduled'
          ? 'scheduled'
          : 'queued'
        : 'failed',
      lastError: failure.message,
      completedAt: failure.retryable ? null : new Date().toISOString(),
    });

    logError(
      failure.retryable
        ? 'distribution_job_dispatch_retryable_failed'
        : 'distribution_job_dispatch_failed',
      {
        job_id: currentJob.job_id,
        message: failure.message,
        provider_status_code: failure.providerStatusCode,
      }
    );

    throw error;
  }
}
