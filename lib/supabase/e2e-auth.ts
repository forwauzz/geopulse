const E2E_AUTH_COOKIE = 'gp_e2e_auth';
const E2E_ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';
const E2E_STARTUP_WORKSPACE_ID = '00000000-0000-4000-8000-000000000101';
const E2E_STARTUP_MEMBER_ID = '00000000-0000-4000-8000-000000000102';
const E2E_STARTUP_SCAN_ID = '00000000-0000-4000-8000-000000000103';
const E2E_STARTUP_REPORT_ID = '00000000-0000-4000-8000-000000000104';
const E2E_STARTUP_RECOMMENDATION_ID = '00000000-0000-4000-8000-000000000105';
// Agency fixture identifiers
const E2E_AGENCY_USER_ID = '00000000-0000-4000-8000-000000000200';
const E2E_AGENCY_ACCOUNT_ID = '00000000-0000-4000-8000-000000000201';
const E2E_AGENCY_CLIENT_ID = '00000000-0000-4000-8000-000000000202';
const E2E_AGENCY_SCAN_ID = '00000000-0000-4000-8000-000000000203';

type E2EAuthUser = {
  readonly id: string;
  readonly email: string;
};

export function isE2EAuthEnabled(): boolean {
  return process.env['E2E_AUTH_SESSIONS'] === '1' && process.env.NODE_ENV !== 'production';
}

function resolveAdminEmail(): string {
  return 'uzzielt@techehealthservices.com';
}

export function resolveE2EAuthUserFromCookieValue(
  cookieValue: string | null | undefined
): E2EAuthUser | null {
  if (!isE2EAuthEnabled()) return null;
  if (!cookieValue) return null;

  if (cookieValue === 'admin') {
    return {
      id: E2E_ADMIN_USER_ID,
      email: resolveAdminEmail(),
    };
  }

  if (cookieValue === 'agency') {
    return {
      id: E2E_AGENCY_USER_ID,
      email: 'agency@example.com',
    };
  }

  return null;
}

export function resolveE2EAuthUserFromCookieStore(cookieStore: {
  get(name: string): { value: string } | undefined;
}): E2EAuthUser | null {
  return resolveE2EAuthUserFromCookieValue(cookieStore.get(E2E_AUTH_COOKIE)?.value);
}

export function buildE2ESupabaseServerClient(user: E2EAuthUser) {
  return {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
    },
    from(table: string) {
      return createE2EQueryBuilder(table);
    },
  };
}

export function buildE2EAdminDb() {
  const runGroupCreatedAt = '2026-03-27T18:58:29.844Z';
  const runGroups = [
    {
      id: 'e2e-run-group-1',
      query_set_id: 'e2e-query-set-1',
      label: 'benchmark-grounded_site-gemini-2.5-flash-lite-e2e',
      run_scope: 'single_domain',
      model_set_version: 'gemini-2.5-flash-lite',
      status: 'completed',
      notes: null,
      metadata: { run_mode: 'grounded_site' },
      started_at: runGroupCreatedAt,
      completed_at: runGroupCreatedAt,
      created_at: runGroupCreatedAt,
    },
    {
      id: 'e2e-run-group-2',
      query_set_id: 'e2e-query-set-1',
      label: 'benchmark-grounded_site-gemini-2.5-flash-lite-e2e-competitor',
      run_scope: 'single_domain',
      model_set_version: 'gemini-2.5-flash-lite',
      status: 'completed',
      notes: null,
      metadata: { run_mode: 'grounded_site' },
      started_at: '2026-03-27T18:40:29.844Z',
      completed_at: '2026-03-27T18:40:29.844Z',
      created_at: '2026-03-27T18:40:29.844Z',
    },
  ];

  const queryRuns = [
    {
      id: 'e2e-query-run-1',
      run_group_id: 'e2e-run-group-1',
      domain_id: 'e2e-domain-1',
      query_id: 'e2e-query-1',
      status: 'completed',
      response_text: 'Example is a healthcare technology consulting firm.',
      response_metadata: {},
      error_message: null,
      executed_at: runGroupCreatedAt,
    },
    {
      id: 'e2e-query-run-2',
      run_group_id: 'e2e-run-group-2',
      domain_id: 'e2e-domain-2',
      query_id: 'e2e-query-1',
      status: 'completed',
      response_text: 'Competitor Example provides AI consulting services.',
      response_metadata: {},
      error_message: null,
      executed_at: '2026-03-27T18:40:29.844Z',
    },
  ];

  const metrics = [
    {
      run_group_id: 'e2e-run-group-1',
      domain_id: 'e2e-domain-1',
      model_id: 'gemini-2.5-flash-lite',
      query_coverage: 1,
      citation_rate: 0.88,
      share_of_voice: 1,
    },
    {
      run_group_id: 'e2e-run-group-2',
      domain_id: 'e2e-domain-2',
      model_id: 'gemini-2.5-flash-lite',
      query_coverage: 0.63,
      citation_rate: 0.42,
      share_of_voice: 0.51,
    },
  ];

  const querySets = [
    { id: 'e2e-query-set-1', name: 'brand-baseline', version: 'v1', status: 'active' },
  ];

  const domains = [
    {
      id: 'e2e-domain-1',
      domain: 'example.com',
      canonical_domain: 'example.com',
      site_url: 'https://example.com/',
      display_name: 'Example Co',
      created_at: runGroupCreatedAt,
    },
    {
      id: 'e2e-domain-2',
      domain: 'competitor.example',
      canonical_domain: 'competitor.example',
      site_url: 'https://competitor.example/',
      display_name: 'Competitor Example',
      created_at: runGroupCreatedAt,
    },
  ];

  const queries = [
    {
      id: 'e2e-query-1',
      query_key: 'query-1',
      query_text: 'What does Example Co do?',
    },
  ];

  const citations = [
    {
      id: 'e2e-citation-1',
      query_run_id: 'e2e-query-run-1',
      cited_domain: 'example.com',
      cited_url: 'https://example.com/',
      rank_position: 1,
      citation_type: 'explicit_domain',
      confidence: 0.8,
      metadata: {},
      created_at: runGroupCreatedAt,
    },
  ];

  const cohorts = [
    {
      id: 'e2e-cohort-1',
      name: 'Example healthcare cohort',
      query_set_id: 'e2e-query-set-1',
      model_id: 'gemini-2.5-flash-lite',
      run_mode: 'grounded_site',
      benchmark_window_label: '2026-W13',
      description: 'Internal comparison frame for smoke coverage.',
      status: 'active',
      created_at: runGroupCreatedAt,
    },
  ];

  const cohortMembers = [
    {
      cohort_id: 'e2e-cohort-1',
      domain_id: 'e2e-domain-1',
      role: 'measured_customer',
    },
    {
      cohort_id: 'e2e-cohort-1',
      domain_id: 'e2e-domain-2',
      role: 'competitor',
    },
  ];

  const rowsByTable: Record<string, unknown[]> = {
    benchmark_run_groups: runGroups,
    query_runs: queryRuns,
    benchmark_domain_metrics: metrics,
    benchmark_query_sets: querySets,
    benchmark_domains: domains,
    benchmark_queries: queries,
    query_citations: citations,
    benchmark_cohorts: cohorts,
    benchmark_cohort_members: cohortMembers,
  };

  return {
    from(table: string) {
      return createE2EAdminQueryBuilder(rowsByTable[table] ?? []);
    },
  };
}

function createE2EAdminQueryBuilder(seedRows: unknown[]) {
  let rows = [...seedRows];
  const result = () => ({ data: rows, error: null });
  const builder: {
    select: () => typeof builder;
    order: (column: string, options?: { ascending?: boolean }) => typeof builder;
    limit: (count: number) => typeof builder;
    eq: (column: string, value: unknown) => typeof builder;
    in: (column: string, values: unknown[]) => typeof builder;
    then: <TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise<TResult1 | TResult2>;
  } = {
    select() {
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      rows.sort((left, right) => {
        const a = (left as Record<string, unknown>)[column];
        const b = (right as Record<string, unknown>)[column];
        if (a === b) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return a < b ? -1 : 1;
      });
      if (options?.ascending === false) {
        rows.reverse();
      }
      return builder;
    },
    limit(count: number) {
      rows = rows.slice(0, count);
      return builder;
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      rows = rows.filter((row) => allowed.has((row as Record<string, unknown>)[column]));
      return builder;
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve(result()).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function createE2EQueryBuilder(table: string) {
  const now = '2026-04-05T10:00:00.000Z';
  const rowsByTable: Record<string, Record<string, unknown>[]> = {
    startup_workspace_users: [
      {
        id: E2E_STARTUP_MEMBER_ID,
        startup_workspace_id: E2E_STARTUP_WORKSPACE_ID,
        user_id: E2E_ADMIN_USER_ID,
        role: 'founder',
        status: 'active',
        created_at: now,
      },
    ],
    startup_workspaces: [
      {
        id: E2E_STARTUP_WORKSPACE_ID,
        workspace_key: 'e2e-startup',
        name: 'E2E Startup Workspace',
        canonical_domain: 'example.com',
        primary_domain: 'example.com',
        billing_mode: 'free',
        status: 'active',
        metadata: {
          rollout_flags: {
            startup_dashboard: true,
            github_agent: true,
            auto_pr: false,
            slack_agent: true,
            slack_auto_post: false,
          },
        },
        created_at: now,
        updated_at: now,
      },
    ],
    scans: [
      {
        id: E2E_STARTUP_SCAN_ID,
        startup_workspace_id: E2E_STARTUP_WORKSPACE_ID,
        agency_account_id: null,
        agency_client_id: null,
        url: 'https://example.com',
        domain: 'example.com',
        score: 74,
        letter_grade: 'B',
        run_source: 'startup_dashboard',
        created_at: now,
      },
      {
        id: E2E_AGENCY_SCAN_ID,
        startup_workspace_id: null,
        agency_account_id: E2E_AGENCY_ACCOUNT_ID,
        agency_client_id: E2E_AGENCY_CLIENT_ID,
        url: 'https://client.example',
        domain: 'client.example',
        score: 61,
        letter_grade: 'C+',
        run_source: 'agency_dashboard',
        created_at: now,
      },
    ],
    reports: [
      {
        id: E2E_STARTUP_REPORT_ID,
        scan_id: E2E_STARTUP_SCAN_ID,
        startup_workspace_id: E2E_STARTUP_WORKSPACE_ID,
        type: 'deep_audit',
        email_delivered_at: now,
        pdf_generated_at: now,
        pdf_url: 'https://example.com/report.pdf',
        created_at: now,
      },
    ],
    startup_recommendations: [
      {
        id: E2E_STARTUP_RECOMMENDATION_ID,
        startup_workspace_id: E2E_STARTUP_WORKSPACE_ID,
        scan_id: E2E_STARTUP_SCAN_ID,
        report_id: E2E_STARTUP_REPORT_ID,
        source_kind: 'manual',
        source_ref: 'e2e',
        title: 'Add missing schema blocks',
        summary: 'Improve AI extractability',
        team_lane: 'dev',
        priority: 'high',
        status: 'approved',
        status_changed_at: now,
        status_reason: null,
        created_at: now,
      },
    ],
    startup_github_installations: [],
    startup_github_installation_repositories: [],
    startup_slack_installations: [],
    startup_slack_destinations: [],
    startup_slack_delivery_events: [],
    startup_agent_pr_runs: [],
    startup_implementation_plans: [],
    startup_implementation_plan_tasks: [],
    // Agency fixture tables — used by the 'agency' cookie session
    agency_users: [
      {
        id: E2E_AGENCY_USER_ID,
        agency_account_id: E2E_AGENCY_ACCOUNT_ID,
        user_id: E2E_AGENCY_USER_ID,
        role: 'owner',
        status: 'active',
        created_at: now,
      },
    ],
    agency_accounts: [
      {
        id: E2E_AGENCY_ACCOUNT_ID,
        account_key: 'e2e-agency',
        name: 'E2E Agency Inc',
        billing_mode: 'agency',
        status: 'active',
        benchmark_vertical: null,
        benchmark_subvertical: null,
        created_at: now,
        updated_at: now,
      },
    ],
    agency_clients: [
      {
        id: E2E_AGENCY_CLIENT_ID,
        agency_account_id: E2E_AGENCY_ACCOUNT_ID,
        client_key: 'e2e-client',
        name: 'E2E Client Co',
        canonical_domain: 'client.example',
        vertical: null,
        subvertical: null,
        icp_tag: null,
        status: 'active',
        created_at: now,
      },
    ],
    agency_client_domains: [
      {
        id: '00000000-0000-4000-8000-000000000204',
        agency_client_id: E2E_AGENCY_CLIENT_ID,
        domain: 'client.example',
        canonical_domain: 'client.example',
        site_url: 'https://client.example',
        is_primary: true,
        created_at: now,
      },
    ],
  };

  let rows = [...(rowsByTable[table] ?? [])];

  const builder: {
    select: (columns?: string) => typeof builder;
    eq: (column: string, value: unknown) => typeof builder;
    neq: (column: string, value: unknown) => typeof builder;
    in: (column: string, values: unknown[]) => typeof builder;
    is: (column: string, value: unknown) => typeof builder;
    contains: (column: string, value: unknown) => typeof builder;
    order: (column: string, options?: { ascending?: boolean }) => typeof builder;
    limit: (count: number) => typeof builder;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
    single: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
    then: <TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise<TResult1 | TResult2>;
  } = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    neq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] !== value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      rows = rows.filter((row) => allowed.has(row[column]));
      return builder;
    },
    is(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    contains() {
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      rows.sort((left, right) => {
        const a = left[column];
        const b = right[column];
        if (a === b) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return a < b ? -1 : 1;
      });
      if (options?.ascending === false) rows.reverse();
      return builder;
    },
    limit(count: number) {
      rows = rows.slice(0, count);
      return builder;
    },
    async maybeSingle() {
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      return { data: rows[0] ?? null, error: null };
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
    },
  };

  return builder;
}
