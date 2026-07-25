export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export type GoogleOAuthTokens = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number;
  readonly scope: string;
};

export type SearchConsoleRow = {
  readonly query: string;
  readonly page: string | null;
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number;
  readonly position: number;
};

export function buildGoogleSearchConsoleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SEARCH_CONSOLE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', input.state);
  return url.toString();
}

async function parseGoogleTokenResponse(response: Response): Promise<GoogleOAuthTokens> {
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof json['access_token'] !== 'string') {
    const providerError =
      typeof json['error_description'] === 'string'
        ? json['error_description']
        : typeof json['error'] === 'string'
          ? json['error']
          : `HTTP ${String(response.status)}`;
    throw new Error(`google_oauth_failed:${providerError}`);
  }
  return {
    accessToken: json['access_token'],
    refreshToken: typeof json['refresh_token'] === 'string' ? json['refresh_token'] : null,
    expiresIn:
      typeof json['expires_in'] === 'number' && Number.isFinite(json['expires_in'])
        ? Math.max(60, Math.floor(json['expires_in']))
        : 3600,
    scope: typeof json['scope'] === 'string' ? json['scope'] : SEARCH_CONSOLE_SCOPE,
  };
}

export async function exchangeGoogleSearchConsoleCode(
  input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  },
  fetcher: typeof fetch = fetch
): Promise<GoogleOAuthTokens> {
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    grant_type: 'authorization_code',
  });
  return parseGoogleTokenResponse(
    await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
  );
}

export async function refreshGoogleSearchConsoleToken(
  input: { clientId: string; clientSecret: string; refreshToken: string },
  fetcher: typeof fetch = fetch
): Promise<GoogleOAuthTokens> {
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token',
  });
  return parseGoogleTokenResponse(
    await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
  );
}

export async function fetchSearchConsoleRows(
  input: {
    accessToken: string;
    siteUrl: string;
    startDate: string;
    endDate: string;
    rowLimit?: number;
  },
  fetcher: typeof fetch = fetch
): Promise<SearchConsoleRow[]> {
  const response = await fetcher(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: ['query', 'page'],
        rowLimit: Math.min(Math.max(input.rowLimit ?? 500, 1), 25_000),
        dataState: 'final',
      }),
    }
  );
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`search_console_query_failed:HTTP_${String(response.status)}`);
  }
  const rows = Array.isArray(json['rows']) ? json['rows'] : [];
  return rows.flatMap((value): SearchConsoleRow[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const keys = Array.isArray(row['keys']) ? row['keys'] : [];
    const query = typeof keys[0] === 'string' ? keys[0].trim() : '';
    if (!query) return [];
    return [{
      query,
      page: typeof keys[1] === 'string' ? keys[1] : null,
      clicks: Number(row['clicks'] ?? 0) || 0,
      impressions: Number(row['impressions'] ?? 0) || 0,
      ctr: Number(row['ctr'] ?? 0) || 0,
      position: Number(row['position'] ?? 0) || 0,
    }];
  });
}

type DataForSeoTask = {
  readonly id: string;
  readonly cost: number;
  readonly statusCode: number;
  readonly statusMessage: string;
};

type DataForSeoResponse = {
  readonly cost: number;
  readonly tasks: DataForSeoTask[];
  readonly rawTasks: Array<Record<string, unknown>>;
};

function dataForSeoAuth(login: string, password: string): string {
  return `Basic ${btoa(`${login}:${password}`)}`;
}

async function dataForSeoRequest(
  input: {
    login: string;
    password: string;
    path: string;
    method?: 'GET' | 'POST';
    body?: unknown;
  },
  fetcher: typeof fetch
): Promise<DataForSeoResponse> {
  const response = await fetcher(`https://api.dataforseo.com${input.path}`, {
    method: input.method ?? 'GET',
    headers: {
      Authorization: dataForSeoAuth(input.login, input.password),
      'Content-Type': 'application/json',
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`dataforseo_http_${String(response.status)}`);
  const rawTasks = (Array.isArray(json['tasks']) ? json['tasks'] : []).filter(
    (task): task is Record<string, unknown> => Boolean(task && typeof task === 'object')
  );
  return {
    cost: Number(json['cost'] ?? 0) || 0,
    rawTasks,
    tasks: rawTasks.map((task) => ({
      id: typeof task['id'] === 'string' ? task['id'] : '',
      cost: Number(task['cost'] ?? 0) || 0,
      statusCode: Number(task['status_code'] ?? 0) || 0,
      statusMessage: typeof task['status_message'] === 'string' ? task['status_message'] : '',
    })),
  };
}

export type DataForSeoKeywordTaskInput = {
  readonly keywordId: string;
  readonly keyword: string;
};

export async function queueDataForSeoRanks(
  input: {
    login: string;
    password: string;
    domain: string;
    keywords: readonly DataForSeoKeywordTaskInput[];
    locationCode?: number;
  },
  fetcher: typeof fetch = fetch
): Promise<Array<DataForSeoTask & { keywordId: string }>> {
  if (input.keywords.length === 0) return [];
  const response = await dataForSeoRequest(
    {
      login: input.login,
      password: input.password,
      path: '/v3/serp/google/organic/task_post',
      method: 'POST',
      body: input.keywords.map((item) => ({
        keyword: item.keyword,
        location_code: input.locationCode ?? 2124,
        language_code: 'en',
        device: 'desktop',
        os: 'windows',
        depth: 10,
        priority: 1,
        tag: `geo-pulse:${item.keywordId}`,
      })),
    },
    fetcher
  );
  return response.tasks.map((task, index) => ({
    ...task,
    keywordId: input.keywords[index]?.keywordId ?? '',
  }));
}

export async function fetchReadyDataForSeoTaskIds(
  input: { login: string; password: string },
  fetcher: typeof fetch = fetch
): Promise<string[]> {
  const response = await dataForSeoRequest(
    {
      login: input.login,
      password: input.password,
      path: '/v3/serp/google/organic/tasks_ready',
    },
    fetcher
  );
  const result = response.rawTasks[0]?.['result'];
  if (!Array.isArray(result)) return [];
  return result.flatMap((item): string[] => {
    if (!item || typeof item !== 'object') return [];
    const id = (item as Record<string, unknown>)['id'];
    return typeof id === 'string' && id ? [id] : [];
  });
}

export type DataForSeoRankResult = {
  readonly taskId: string;
  readonly position: number | null;
  readonly pageUrl: string | null;
  readonly competitors: Array<{ domain: string; position: number; url: string | null }>;
};

export async function fetchDataForSeoRankResult(
  input: { login: string; password: string; taskId: string; domain: string },
  fetcher: typeof fetch = fetch
): Promise<DataForSeoRankResult> {
  const response = await dataForSeoRequest(
    {
      login: input.login,
      password: input.password,
      path: `/v3/serp/google/organic/task_get/regular/${encodeURIComponent(input.taskId)}`,
    },
    fetcher
  );
  const firstResult = response.rawTasks[0]?.['result'];
  const result =
    Array.isArray(firstResult) && firstResult[0] && typeof firstResult[0] === 'object'
      ? (firstResult[0] as Record<string, unknown>)
      : {};
  const items = (Array.isArray(result['items']) ? result['items'] : []).filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && (item as Record<string, unknown>)['type'] === 'organic')
  );
  const normalizedDomain = input.domain.replace(/^www\./i, '').toLowerCase();
  const competitors = items.slice(0, 10).flatMap((item) => {
    const domain = typeof item['domain'] === 'string' ? item['domain'].replace(/^www\./i, '').toLowerCase() : '';
    if (!domain) return [];
    return [{
      domain,
      position: Number(item['rank_absolute'] ?? item['rank_group'] ?? 0) || 0,
      url: typeof item['url'] === 'string' ? item['url'] : null,
    }];
  });
  const own = competitors.find((item) => item.domain === normalizedDomain);
  return {
    taskId: input.taskId,
    position: own?.position ?? null,
    pageUrl: own?.url ?? null,
    competitors: competitors.filter((item) => item.domain !== normalizedDomain).slice(0, 5),
  };
}
