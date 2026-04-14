export function formatBenchmarkOverviewTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatBenchmarkOverviewPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

export function buildBenchmarkOverviewHref(filters: {
  readonly domain?: string;
  readonly querySet?: string;
  readonly model?: string;
  readonly status?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.domain && filters.domain !== 'all') params.set('domain', filters.domain);
  if (filters.querySet && filters.querySet !== 'all') params.set('querySet', filters.querySet);
  if (filters.model && filters.model !== 'all') params.set('model', filters.model);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  const query = params.toString();
  return query ? `/dashboard/benchmarks?${query}` : '/dashboard/benchmarks';
}
