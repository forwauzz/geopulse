export class DashboardHomeUnavailableError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super('dashboard_home_unavailable');
    this.name = 'DashboardHomeUnavailableError';
    this.stage = stage;
  }
}

type DashboardHomeReadResult = {
  readonly error: unknown;
};

export async function readDashboardHomeResult<TResult extends DashboardHomeReadResult>(
  stage: string,
  query: PromiseLike<TResult>,
): Promise<TResult> {
  let result: TResult;
  try {
    result = await query;
  } catch {
    throw new DashboardHomeUnavailableError(stage);
  }

  if (result.error) {
    throw new DashboardHomeUnavailableError(stage);
  }

  return result;
}

export async function readDashboardHomeData<
  TResult extends DashboardHomeReadResult & { readonly data: unknown },
>(stage: string, query: PromiseLike<TResult>): Promise<TResult['data']> {
  const result = await readDashboardHomeResult(stage, query);
  return result.data;
}
