import type { ContentPublishCheck } from './content-publishing';

const HISTORY_KEY = 'publish_check_history';
const MAX_HISTORY_ITEMS = 20;

export type ContentPublishCheckSnapshot = {
  readonly checked_at: string;
  readonly passed: boolean;
  readonly total_checks: number;
  readonly failed_count: number;
  readonly failed_keys: readonly string[];
  readonly failed_hints: readonly string[];
  readonly category_totals: Record<string, number>;
};

export type ContentPublishQualityTrendRow = {
  readonly content_id: string;
  readonly title: string;
  readonly status: string;
  readonly metadata: Record<string, unknown> | null;
};

export type ContentPublishFailurePattern = {
  readonly key: string;
  readonly count: number;
};

export type ContentPublishRegressionFlag = {
  readonly content_id: string;
  readonly title: string;
  readonly checked_at: string;
  readonly failed_count: number;
  readonly previous_failed_count: number;
  readonly newly_failed_keys: readonly string[];
};

export type ContentPublishQualityTrendSummary = {
  readonly articles_with_history: number;
  readonly failing_articles: number;
  readonly regressions: number;
  readonly improvements: number;
  readonly latest_checked_at: string | null;
  readonly top_failed_keys: readonly ContentPublishFailurePattern[];
  readonly regression_flags: readonly ContentPublishRegressionFlag[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSnapshot(value: unknown): ContentPublishCheckSnapshot | null {
  if (!isRecord(value)) return null;

  const checkedAt = typeof value['checked_at'] === 'string' ? value['checked_at'] : null;
  const passed = value['passed'] === true;
  const totalChecks = typeof value['total_checks'] === 'number' ? value['total_checks'] : null;
  const failedCount = typeof value['failed_count'] === 'number' ? value['failed_count'] : null;
  const failedKeys = Array.isArray(value['failed_keys'])
    ? value['failed_keys'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  const failedHints = Array.isArray(value['failed_hints'])
    ? value['failed_hints'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  const categoryTotals = isRecord(value['category_totals'])
    ? Object.fromEntries(
        Object.entries(value['category_totals']).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number'
        )
      )
    : {};

  if (!checkedAt || totalChecks === null || failedCount === null) {
    return null;
  }

  return {
    checked_at: checkedAt,
    passed,
    total_checks: totalChecks,
    failed_count: failedCount,
    failed_keys: failedKeys,
    failed_hints: failedHints,
    category_totals: categoryTotals,
  };
}

export function readContentPublishCheckHistory(
  metadata: Record<string, unknown> | null | undefined
): ContentPublishCheckSnapshot[] {
  const raw = metadata?.[HISTORY_KEY];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => normalizeSnapshot(entry))
    .filter((entry): entry is ContentPublishCheckSnapshot => entry !== null);
}

export function appendContentPublishCheckSnapshot(
  metadata: Record<string, unknown> | null | undefined,
  checks: readonly ContentPublishCheck[]
): Record<string, unknown> {
  const previous = readContentPublishCheckHistory(metadata);
  const failedChecks = checks.filter((check) => !check.passed);
  const categoryTotals = checks.reduce<Record<string, number>>((acc, check) => {
    acc[check.category] = (acc[check.category] ?? 0) + 1;
    return acc;
  }, {});

  const snapshot: ContentPublishCheckSnapshot = {
    checked_at: new Date().toISOString(),
    passed: failedChecks.length === 0,
    total_checks: checks.length,
    failed_count: failedChecks.length,
    failed_keys: failedChecks.map((check) => check.key),
    failed_hints: failedChecks
      .map((check) => check.hint)
      .filter((hint): hint is string => typeof hint === 'string'),
    category_totals: categoryTotals,
  };

  return {
    ...(metadata ?? {}),
    [HISTORY_KEY]: [snapshot, ...previous].slice(0, MAX_HISTORY_ITEMS),
  };
}

function toUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function buildContentPublishQualityTrendSummary(
  rows: readonly ContentPublishQualityTrendRow[]
): ContentPublishQualityTrendSummary {
  let articlesWithHistory = 0;
  let failingArticles = 0;
  let regressions = 0;
  let improvements = 0;
  let latestCheckedAt: string | null = null;
  const failedKeyCounts = new Map<string, number>();
  const regressionFlags: ContentPublishRegressionFlag[] = [];

  for (const row of rows) {
    const history = readContentPublishCheckHistory(row.metadata ?? {});
    if (history.length === 0) continue;

    const latest = history[0];
    if (!latest) continue;

    articlesWithHistory += 1;

    if (!latestCheckedAt || latest.checked_at > latestCheckedAt) {
      latestCheckedAt = latest.checked_at;
    }

    const latestFailedKeys = toUniqueStrings(latest.failed_keys);
    if (latestFailedKeys.length > 0) {
      failingArticles += 1;
      for (const key of latestFailedKeys) {
        failedKeyCounts.set(key, (failedKeyCounts.get(key) ?? 0) + 1);
      }
    }

    const previous = history[1];
    if (!previous) continue;

    const previousFailedKeys = new Set(previous.failed_keys);
    const newlyFailedKeys = latestFailedKeys.filter((key) => !previousFailedKeys.has(key));
    const didRegress =
      (previous.passed && !latest.passed) ||
      latest.failed_count > previous.failed_count ||
      newlyFailedKeys.length > 0;
    const didImprove =
      (!previous.passed && latest.passed) || latest.failed_count < previous.failed_count;

    if (didRegress) {
      regressions += 1;
      regressionFlags.push({
        content_id: row.content_id,
        title: row.title,
        checked_at: latest.checked_at,
        failed_count: latest.failed_count,
        previous_failed_count: previous.failed_count,
        newly_failed_keys: newlyFailedKeys,
      });
    }
    if (didImprove) {
      improvements += 1;
    }
  }

  const topFailedKeys = [...failedKeyCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }));

  const sortedRegressionFlags = regressionFlags
    .sort((left, right) => {
      if (right.failed_count !== left.failed_count) {
        return right.failed_count - left.failed_count;
      }
      return right.checked_at.localeCompare(left.checked_at);
    })
    .slice(0, 5);

  return {
    articles_with_history: articlesWithHistory,
    failing_articles: failingArticles,
    regressions,
    improvements,
    latest_checked_at: latestCheckedAt,
    top_failed_keys: topFailedKeys,
    regression_flags: sortedRegressionFlags,
  };
}
