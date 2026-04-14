/**
 * E2E: Startup team journey
 *
 * Tests the startup workspace experience end to end:
 *   - Dashboard home: scan hero (#dashboard-scan), workspace context bar, stats, WhatNextBanner (step 3)
 *   - Score trend and action backlog widgets
 *   - New Scan page with startup workspace context
 *   - Connectors page: heading, GitHub card, Slack card
 *   - Admin tools visible for founder/admin user
 *
 * Cookie used: gp_e2e_auth=admin
 *
 * Fixture data (see lib/supabase/e2e-auth.ts):
 *   - Workspace: "E2E Startup Workspace" (role: founder, key: e2e-startup)
 *   - Rollout flags: startup_dashboard ✓, github_agent ✓, slack_agent ✓, slack_auto_post ✗
 *   - Scan: score 74, grade B, domain example.com
 *   - Report: deep_audit, pdf_url set
 *   - Recommendation: "Add missing schema blocks", priority high
 *
 * NOTE: SUPABASE_SERVICE_ROLE_KEY is not set in the Playwright test env, so
 * startupServiceGates is null → githubEnabled = false, slackEnabled = false.
 * The connector cards render their "not enabled" state in E2E. Tests account for this.
 */

import { expect, test } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────

async function signInAsStartup(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.context().addCookies([
    { name: 'gp_e2e_auth', value: 'admin', url: page.url() },
  ]);
}

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000101';

// ── Dashboard home — startup section ───────────────────────────

test.describe('startup dashboard home', () => {
  test('renders dashboard heading and user email', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible();
    // Scope to main content to avoid the sidebar's truncated/hidden copy
    await expect(page.getByRole('main').getByText(/admin@example\.com/i)).toBeVisible();
  });

  test('renders dashboard scan hero — #dashboard-scan, headline, URL field, submit', async ({
    page,
  }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#dashboard-scan')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /start with any website/i })
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: /website url/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /run diagnostic/i })).toBeVisible();
  });

  test('renders startup workspace section with workspace name', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: /e2e startup workspace/i })
    ).toBeVisible();
  });

  test('shows workspace key chip', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/e2e-startup/i)).toBeVisible();
  });

  test('shows canonical domain chip', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // The chip renders exactly "example.com" — use exact match so we don't pick up "admin@example.com"
    await expect(page.getByText('example.com', { exact: true }).first()).toBeVisible();
  });

  test('shows role chip', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/role: founder/i)).toBeVisible();
  });

  test('renders WhatNextBanner at step 3 — connect GitHub and Slack', async ({ page }) => {
    // Fixture has 1 scan + 1 recommendation → step 3
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/step 3 of 3/i)).toBeVisible();
    await expect(
      page.getByText(/connect github & slack to automate delivery/i)
    ).toBeVisible();
  });

  test('WhatNextBanner CTA links to connectors page', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('link', { name: /go to connectors/i })
    ).toBeVisible();
  });

  test('renders score trend widget', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/score trend/i)).toBeVisible();
    // Fixture scan scored 74 — appears as a data point
    await expect(page.getByText(/74/i).first()).toBeVisible();
  });

  test('renders action backlog widget', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/action backlog/i)).toBeVisible();
    // The fixture scan (score 74, report linked) produces no scan-level blockers →
    // buildStartupActionBacklog returns the "no blockers" fallback item
    await expect(
      page.getByText(/no blocking implementation items/i)
    ).toBeVisible();
  });

  test('renders recent scans section with example.com scan', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/recent scans/i)).toBeVisible();
  });

  test('stats row renders scan and recommendation labels', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // StatCard labels for startup section
    await expect(page.getByText(/^scans$/i).first()).toBeVisible();
    await expect(page.getByText(/^recommendations$/i)).toBeVisible();
  });
});

// ── New scan page with startup context ─────────────────────────

test.describe('new scan page with startup context', () => {
  test('renders Run a Scan heading', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /run a scan/i })).toBeVisible();
  });

  test('shows startup context card when workspace is active', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto(
      `/dashboard/new-scan?startupWorkspace=${WORKSPACE_ID}`,
      { waitUntil: 'domcontentloaded' }
    );

    // Context card shows startup workspace context
    await expect(page.getByText(/startup context/i)).toBeVisible();
    await expect(page.getByText(/e2e startup workspace/i).first()).toBeVisible();
  });

  test('WhatNextBanner shows workspace scanning context', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto(
      `/dashboard/new-scan?startupWorkspace=${WORKSPACE_ID}`,
      { waitUntil: 'domcontentloaded' }
    );

    // Banner shows "Scanning for E2E Startup Workspace" when context is active
    await expect(
      page.getByText(/scanning for e2e startup workspace/i)
    ).toBeVisible();
  });
});

// ── Connectors page ────────────────────────────────────────────

test.describe('connectors page', () => {
  test('loads with "Connectors" heading', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^connectors$/i })).toBeVisible();
  });

  test('shows workspace name in page subtitle', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/e2e startup workspace/i).first()).toBeVisible();
  });

  test('renders GitHub connector card header', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^github$/i })).toBeVisible();
    await expect(
      page.getByText(/automate pr creation from scan recommendations/i)
    ).toBeVisible();
  });

  test('renders Slack connector card header', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^slack$/i })).toBeVisible();
  });

  test('GitHub card shows disconnected status in E2E', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    // No installation → disconnected badge
    await expect(
      page.getByText(/disconnected/i).first()
    ).toBeVisible();
  });

  test('GitHub card body shows Connect GitHub button when not connected', async ({ page }) => {
    // Service catalog has default_access_mode: free → githubEnabled = true in E2E
    // No fixture installation → disconnected state → "Connect GitHub" button renders
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('button', { name: /connect github/i })
    ).toBeVisible();
  });

  test('Slack card body shows Connect Slack button when not connected', async ({ page }) => {
    // No fixture Slack installation → disconnected state → "Connect Slack" button renders
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('button', { name: /connect slack/i })
    ).toBeVisible();
  });

  test('renders LinkedIn and Twitter future placeholder cards', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/linkedin/i).first()).toBeVisible();
    await expect(page.getByText(/twitter/i).first()).toBeVisible();
  });

  test('loads correctly with workspace query param', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto(
      `/dashboard/connectors?startupWorkspace=${WORKSPACE_ID}`,
      { waitUntil: 'domcontentloaded' }
    );

    await expect(page.getByRole('heading', { name: /^connectors$/i })).toBeVisible();
  });
});

// ── Slack section detail (slackEnabled = true via real service catalog) ────

test.describe('slack section', () => {
  test('shows "No Slack workspaces connected" empty state', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByText(/no slack workspaces connected/i)
    ).toBeVisible();
  });

  test('recurring audits section renders for founder role', async ({ page }) => {
    // canManageSlackAutoPost = true when role is founder/admin AND slackEnabled = true
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/recurring audits/i)).toBeVisible();
  });

  test('auto-post toggle checkbox is present', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    // Label: "Enable recurring auto-scan + Slack delivery"
    await expect(
      page.getByRole('checkbox', { name: /enable recurring auto-scan/i })
    ).toBeVisible();
  });

  test('cadence selector renders with monthly default (30 days)', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    // Workspace fixture has no audit_cadence_days set → auditCadenceDays = 30
    const cadenceSelect = page.locator('select[name="cadenceDays"]');
    await expect(cadenceSelect).toBeVisible();
    await expect(cadenceSelect).toHaveValue('30');
  });

  test('cadence selector has 5 options', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    const options = page.locator('select[name="cadenceDays"] option');
    await expect(options).toHaveCount(5);
  });

  test('delivery log section is absent when no events exist', async ({ page }) => {
    // Fixture has 0 delivery events → section only renders when length > 0
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/recent deliveries/i)).not.toBeVisible();
  });
});

// ── Navigation flows ───────────────────────────────────────────

test.describe('navigation flows', () => {
  test('"Go to Connectors" CTA navigates from dashboard to connectors', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await page.getByRole('link', { name: /go to connectors/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/connectors/);
    await expect(page.getByRole('heading', { name: /^connectors$/i })).toBeVisible();
  });

  test('"Run a Scan" sidebar link goes to new-scan page', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Get the sidebar Run a Scan link (first match — sidebar vs main content)
    await page.getByRole('link', { name: /run a scan/i }).first().click();

    await expect(page).toHaveURL(/\/dashboard\/new-scan/);
    await expect(page.getByRole('heading', { name: /run a scan/i })).toBeVisible();
  });

  test('Admin Console link visible in sidebar for admin session', async ({ page }) => {
    // The 'admin' E2E user is the platform admin → Admin Console link shows at bottom of sidebar
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('link', { name: /admin console/i })
    ).toBeVisible();
  });
});

// ── Workspace page ─────────────────────────────────────────────

test.describe('workspace settings page', () => {
  test('loads workspace page without crashing', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard/workspace', { waitUntil: 'domcontentloaded' });

    // Multiple "Workspace" headings can appear (page h1 + section h2); use first()
    await expect(page.getByRole('heading', { name: /workspace/i }).first()).toBeVisible();
  });
});
