export type DistributionQueueMessage = {
  readonly v: 1;
  readonly distributionJobId: string;
};

export function buildDistributionQueueMessage(distributionJobId: string): DistributionQueueMessage {
  return {
    v: 1,
    distributionJobId,
  };
}

export function parseDistributionQueueMessage(rawBody: string): DistributionQueueMessage | null {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (parsed['v'] !== 1) return null;
    const distributionJobId = parsed['distributionJobId'];
    if (typeof distributionJobId !== 'string' || distributionJobId.trim().length === 0) {
      return null;
    }

    return {
      v: 1,
      distributionJobId: distributionJobId.trim(),
    };
  } catch {
    return null;
  }
}
