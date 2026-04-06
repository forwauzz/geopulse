/**
 * E2E: Startup team journey
 *
 * Tests the startup workspace experience end to end:
 *   - Dashboard home: workspace context bar, stats, WhatNextBanner (step 3)
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
    await expect(page.getByText(/admin@example\.com/i).first()).toBeVisible();
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

    // example.com appears in workspace context bar
    await expect(page.getByText(/example\.com/i).first()).toBeVisible();
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

  test('renders action backlog with fixture recommendation', async ({ page }) => {
    await signInAsStartup(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/action backlog/i)).toBeVisible();
    await expect(page.getByText(/add missing schema blocks/i)).toBeVisible();
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

  test('GitHub card body explains not-enabled state in E2E', async ({ page }) => {
    // In E2E, SUPABASE_SERVICE_ROLE_KEY is not set → service gates null → githubEnabled = false
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByText(/github integration is not enabled for this workspace/i)
    ).toBeVisible();
  });

  test('Slack card body explains not-enabled state in E2E', async ({ page }) => {
    // slackEnabled = false in E2E for same reason
    await signInAsStartup(page);
    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByText(/slack integration is not enabled for this workspace/i)
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

    // Should render heading-level content without error
    await expect(page.getByRole('heading', { name: /workspace/i })).toBeVisible();
  });
});
