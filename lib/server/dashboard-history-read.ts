export class DashboardHistoryUnavailableError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super('dashboard_history_unavailable');
    this.name = 'DashboardHistoryUnavailableError';
    this.stage = stage;
  }
}

type DashboardHistoryReadResult<T> = {
  readonly data: T;
  readonly error: unknown;
};

export async function readDashboardHistoryData<TResult extends DashboardHistoryReadResult<unknown>>(
  stage: string,
  query: PromiseLike<TResult>,
): Promise<TResult['data']> {
  let result: TResult;
  try {
    result = await query;
  } catch {
    throw new DashboardHistoryUnavailableError(stage);
  }

  if (result.error) {
    throw new DashboardHistoryUnavailableError(stage);
  }

  return result.data;
}
