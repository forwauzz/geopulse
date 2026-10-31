export class BillingDashboardUnavailableError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super('billing_dashboard_unavailable');
    this.name = 'BillingDashboardUnavailableError';
    this.stage = stage;
  }
}

type BillingDashboardReadResult<T> = {
  readonly data: T;
  readonly error: unknown;
};

export async function readBillingDashboardData<
  TResult extends BillingDashboardReadResult<unknown>,
>(
  stage: string,
  query: PromiseLike<TResult>,
): Promise<TResult['data']> {
  let result: TResult;
  try {
    result = await query;
  } catch {
    throw new BillingDashboardUnavailableError(stage);
  }

  if (result.error) {
    throw new BillingDashboardUnavailableError(stage);
  }

  return result.data;
}
