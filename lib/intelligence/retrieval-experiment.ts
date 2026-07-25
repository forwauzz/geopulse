import { createHash } from 'node:crypto';

export const RETRIEVAL_EXPERIMENT_VERSION = 'retrieval-experiment-v1';

export type RetrievalDocument = {
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly objectType: string;
  readonly text: string;
  readonly domain: string | null;
  readonly lane: string | null;
  readonly model: string | null;
  readonly quality: string;
  readonly visibility: 'public' | 'shared' | 'internal' | 'private_tenant';
  readonly tenantId: string | null;
  readonly observedAt: string;
};

export type RetrievalFilters = {
  readonly tenantId?: readonly string[];
  readonly domain?: readonly string[];
  readonly lane?: readonly string[];
  readonly model?: readonly string[];
  readonly quality?: readonly string[];
  readonly visibility?: readonly string[];
  readonly objectType?: readonly string[];
  readonly observedAfter?: string;
  readonly observedBefore?: string;
};

export type RetrievalTask = {
  readonly taskId: string;
  readonly taskType: string;
  readonly query: string;
  readonly filters: RetrievalFilters;
  readonly relevantEvidenceIds: readonly string[];
  readonly forbiddenEvidenceIds?: readonly string[];
};

export type RetrievalFixture = {
  readonly fixtureVersion: string;
  readonly createdBeforeIndexing: boolean;
  readonly topK: number;
  readonly documents: readonly RetrievalDocument[];
  readonly tasks: readonly RetrievalTask[];
};

export type EmbeddingBatch = {
  readonly vectors: readonly (readonly number[])[];
  readonly tokenCount: number;
  readonly estimatedCostUsd: number;
};

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly version: string;
  embed(texts: readonly string[]): Promise<EmbeddingBatch>;
}

export type IndexedEmbedding = {
  readonly embeddingId: string;
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly sourceTextHash: string;
  readonly provider: string;
  readonly model: string;
  readonly version: string;
  readonly vector: readonly number[];
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sourceTextHash(text: string): string {
  return hash(text);
}

export function stableEmbeddingId(
  document: Pick<RetrievalDocument, 'evidenceId' | 'sourceId' | 'text'>,
  provider: Pick<EmbeddingProvider, 'provider' | 'model' | 'version'>
): string {
  return `emb_${hash([
    document.evidenceId, document.sourceId, sourceTextHash(document.text),
    provider.provider, provider.model, provider.version,
  ].join(':')).slice(0, 40)}`;
}

export function documentPassesFilters(
  document: RetrievalDocument,
  filters: RetrievalFilters,
  options: { allowTenantPrivate: boolean }
): boolean {
  if (document.visibility === 'private_tenant') {
    if (!options.allowTenantPrivate || !document.tenantId) return false;
    if (!filters.tenantId?.includes(document.tenantId)) return false;
  }
  const checks: Array<[readonly string[] | undefined, string | null]> = [
    [filters.domain, document.domain],
    [filters.lane, document.lane],
    [filters.model, document.model],
    [filters.quality, document.quality],
    [filters.visibility, document.visibility],
    [filters.objectType, document.objectType],
  ];
  if (checks.some(([allowed, value]) => allowed && (!value || !allowed.includes(value)))) return false;
  if (filters.observedAfter && document.observedAt < filters.observedAfter) return false;
  if (filters.observedBefore && document.observedAt > filters.observedBefore) return false;
  return true;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'find', 'for', 'from',
  'has', 'in', 'is', 'it', 'of', 'on', 'or', 'our', 'that', 'the', 'this', 'to',
  'where', 'which', 'while', 'with',
]);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) =>
    token.length > 1 && !STOP_WORDS.has(token)
  ).map((token) => token.replace(/(ing|ed|es|s)$/, '')) ?? [];
}

export function keywordScore(query: string, text: string): number {
  const queryTokens = tokens(query);
  const documentTokens = tokens(text);
  const frequencies = new Map<string, number>();
  for (const token of documentTokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  return queryTokens.reduce((score, token) =>
    score + (frequencies.get(token) ?? 0) / Math.max(1, Math.sqrt(documentTokens.length)),
  0);
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

export function indexEmbeddings(
  documents: readonly RetrievalDocument[],
  provider: EmbeddingProvider,
  vectors: readonly (readonly number[])[]
): IndexedEmbedding[] {
  if (documents.length !== vectors.length) throw new Error('Embedding vector count does not match document count.');
  return documents.map((document, index) => ({
    embeddingId: stableEmbeddingId(document, provider),
    evidenceId: document.evidenceId,
    sourceId: document.sourceId,
    sourceTextHash: sourceTextHash(document.text),
    provider: provider.provider,
    model: provider.model,
    version: provider.version,
    vector: vectors[index]!,
  }));
}

export type RankedResult = {
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly score: number;
};

type TaskEvaluation = {
  readonly taskId: string;
  readonly results: readonly RankedResult[];
  readonly precisionAtK: number;
  readonly recallAtK: number;
  readonly reciprocalRank: number;
  readonly accessCorrect: boolean;
};

function evaluateTask(
  task: RetrievalTask,
  results: readonly RankedResult[],
  topK: number
): Omit<TaskEvaluation, 'taskId' | 'results'> {
  const top = results.slice(0, topK);
  const relevant = new Set(task.relevantEvidenceIds);
  const relevantRetrieved = top.filter((result) => relevant.has(result.evidenceId)).length;
  const firstRelevant = top.findIndex((result) => relevant.has(result.evidenceId));
  const forbidden = new Set(task.forbiddenEvidenceIds ?? []);
  return {
    precisionAtK: relevantRetrieved / topK,
    recallAtK: relevant.size ? relevantRetrieved / relevant.size : 1,
    reciprocalRank: firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0,
    accessCorrect: top.every((result) => !forbidden.has(result.evidenceId)),
  };
}

function aggregate(evaluations: readonly TaskEvaluation[]) {
  const divisor = Math.max(1, evaluations.length);
  return {
    precisionAtK: evaluations.reduce((sum, item) => sum + item.precisionAtK, 0) / divisor,
    recallAtK: evaluations.reduce((sum, item) => sum + item.recallAtK, 0) / divisor,
    meanReciprocalRank: evaluations.reduce((sum, item) => sum + item.reciprocalRank, 0) / divisor,
    accessControlAccuracy: evaluations.filter((item) => item.accessCorrect).length / divisor,
  };
}

export type RetrievalExperimentReport = {
  readonly experimentVersion: string;
  readonly fixtureVersion: string;
  readonly provider: { provider: string; model: string; version: string };
  readonly documentCount: number;
  readonly taskCount: number;
  readonly topK: number;
  readonly keyword: ReturnType<typeof aggregate> & { latencyMs: number };
  readonly semantic: ReturnType<typeof aggregate> & {
    latencyMs: number;
    tokenCount: number;
    estimatedCostUsd: number;
  };
  readonly semanticImprovement: number;
  readonly thresholdPassed: boolean;
  readonly recommendation: 'go' | 'no_go';
  readonly recommendationReasons: readonly string[];
  readonly keywordTasks: readonly TaskEvaluation[];
  readonly semanticTasks: readonly TaskEvaluation[];
  readonly embeddings: readonly Omit<IndexedEmbedding, 'vector'>[];
};

export async function runRetrievalExperiment(
  fixture: RetrievalFixture,
  provider: EmbeddingProvider,
  options: { allowTenantPrivate?: boolean; minimumPrecisionImprovement?: number } = {}
): Promise<RetrievalExperimentReport> {
  if (!fixture.createdBeforeIndexing) throw new Error('Evaluation fixture must be labeled before indexing.');
  const allowTenantPrivate = options.allowTenantPrivate ?? false;
  const minimumImprovement = options.minimumPrecisionImprovement ?? 0.1;
  const indexableDocuments = fixture.documents.filter((document) =>
    document.visibility !== 'private_tenant' || allowTenantPrivate
  );
  const documentEmbeddingBatch = await provider.embed(indexableDocuments.map((document) => document.text));
  const indexed = indexEmbeddings(indexableDocuments, provider, documentEmbeddingBatch.vectors);
  const indexedByEvidence = new Map(indexed.map((item) => [item.evidenceId, item]));

  const keywordStart = performance.now();
  const keywordTasks = fixture.tasks.map((task): TaskEvaluation => {
    const candidates = indexableDocuments.filter((document) =>
      documentPassesFilters(document, task.filters, { allowTenantPrivate })
    );
    const results = candidates.map((document) => ({
      evidenceId: document.evidenceId,
      sourceId: document.sourceId,
      score: keywordScore(task.query, document.text),
    })).sort((left, right) => right.score - left.score || left.evidenceId.localeCompare(right.evidenceId));
    return { taskId: task.taskId, results, ...evaluateTask(task, results, fixture.topK) };
  });
  const keywordLatency = performance.now() - keywordStart;

  const semanticStart = performance.now();
  const queryBatch = await provider.embed(fixture.tasks.map((task) => task.query));
  const semanticTasks = fixture.tasks.map((task, taskIndex): TaskEvaluation => {
    const candidates = indexableDocuments.filter((document) =>
      documentPassesFilters(document, task.filters, { allowTenantPrivate })
    );
    const queryVector = queryBatch.vectors[taskIndex]!;
    const results = candidates.map((document) => {
      const embedding = indexedByEvidence.get(document.evidenceId)!;
      return {
        evidenceId: document.evidenceId,
        sourceId: document.sourceId,
        score: cosineSimilarity(queryVector, embedding.vector),
      };
    }).sort((left, right) => right.score - left.score || left.evidenceId.localeCompare(right.evidenceId));
    return { taskId: task.taskId, results, ...evaluateTask(task, results, fixture.topK) };
  });
  const semanticLatency = performance.now() - semanticStart;
  const keyword = aggregate(keywordTasks);
  const semantic = aggregate(semanticTasks);
  const improvement = semantic.precisionAtK - keyword.precisionAtK;
  const reasons: string[] = [];
  if (improvement < minimumImprovement) reasons.push('semantic_precision_improvement_below_threshold');
  if (semantic.accessControlAccuracy !== 1) reasons.push('access_control_failure');
  if (semantic.recallAtK < 0.9) reasons.push('semantic_recall_below_threshold');
  const thresholdPassed = reasons.length === 0;
  return {
    experimentVersion: RETRIEVAL_EXPERIMENT_VERSION,
    fixtureVersion: fixture.fixtureVersion,
    provider: { provider: provider.provider, model: provider.model, version: provider.version },
    documentCount: indexableDocuments.length,
    taskCount: fixture.tasks.length,
    topK: fixture.topK,
    keyword: { ...keyword, latencyMs: keywordLatency },
    semantic: {
      ...semantic,
      latencyMs: semanticLatency,
      tokenCount: documentEmbeddingBatch.tokenCount + queryBatch.tokenCount,
      estimatedCostUsd: documentEmbeddingBatch.estimatedCostUsd + queryBatch.estimatedCostUsd,
    },
    semanticImprovement: improvement,
    thresholdPassed,
    recommendation: thresholdPassed ? 'go' : 'no_go',
    recommendationReasons: reasons,
    keywordTasks,
    semanticTasks,
    embeddings: indexed.map(({ vector: _vector, ...metadata }) => metadata),
  };
}
