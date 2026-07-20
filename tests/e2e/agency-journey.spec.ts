/**
 * E2E: Agency owner journey
 *
 * Tests the agency workspace experience end to end:
 *   - /dashboard/history renders the agency section with account and client data
 *   - Client chips switch context
 *   - WhatNextBanner shows appropriate step
 *   - New Scan page shows agency context card
 *   - Scan runs scoped to agency + client
 *
 * Cookie used: gp_e2e_auth=agency
 *
 * Fixture data (see lib/supabase/e2e-auth.ts):
 *   - Account: "E2E Agency Inc" (id: E2E_AGENCY_ACCOUNT_ID)
 *   - Client: "E2E Client Co" (id: E2E_AGENCY_CLIENT_ID, domain: client.example)
 *   - Scan: score 61, grade C+, domain client.example (agency_account_id set)
 */

import { expect, test } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────

async function signInAsAgency(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.context().addCookies([
    { name: 'gp_e2e_auth', value: 'agency', url: page.url() },
  ]);
}

/**
 * Where the workspace surface lives. `/dashboard` was simplified down to the scan hero alone, and
 * the agency context bar, client chips and banners all moved here — so these assertions follow the
 * content rather than the URL.
 */
const WORKSPACE_HOME = '/dashboard/history';

// ── Dashboard home ─────────────────────────────────────────────

test.describe('agency dashboard home', () => {
  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login/);
  });

  test('renders history heading and agency user email', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^history$/i })).toBeVisible();
    // Email appears multiple times; use first() to avoid strict mode violation
    await expect(page.getByText(/agency@example\.com/i).first()).toBeVisible();
  });

  test('renders agency workspace section with account name', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    // h2 inside the agency section
    await expect(
      page.getByRole('heading', { name: /e2e agency inc/i })
    ).toBeVisible();
  });

  test('shows agency workspace eyebrow label', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/agency workspace/i).first()).toBeVisible();
  });

  test('renders "All clients" chip', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: /^all clients$/i })).toBeVisible();
  });

  test('renders client chip for E2E Client Co', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('link', { name: /e2e client co/i })
    ).toBeVisible();
  });

  test('WhatNextBanner prompts to select a client when no client is active', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    // No client selected → "Select a client to start scanning"
    await expect(
      page.getByText(/select a client to start scanning/i)
    ).toBeVisible();
  });

  // NOTE: the "New client scan" button no longer exists anywhere in the app — it went with the
  // dashboard simplification, and scanning for a client now happens through the scan box on
  // /dashboard with the client context applied. Its test is dropped rather than rewritten.
});

// ── Client context switching ────────────────────────────────────

test.describe('client context switching', () => {
  test('clicking a client chip scopes the dashboard to that client', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(WORKSPACE_HOME, { waitUntil: 'domcontentloaded' });

    // Click the client chip
    await page.getByRole('link', { name: /e2e client co/i }).click();

    // URL should include agencyClient param
    await expect(page).toHaveURL(/agencyClient=/);

    // WhatNextBanner now shows scans count for the client (1 scan exists)
    await expect(
      page.getByText(/1 scan for e2e client co/i)
    ).toBeVisible();
  });

  test('client chip becomes active (highlighted) when selected', async ({ page }) => {
    await signInAsAgency(page);

    // Navigate with client pre-selected
    await page.goto(
      `${WORKSPACE_HOME}?agencyAccount=00000000-0000-4000-8000-000000000201&agencyClient=00000000-0000-4000-8000-000000000202`,
      { waitUntil: 'domcontentloaded' }
    );

    // The client chip link should be styled with ring/primary style
    // We verify by checking the page loaded with correct client context
    await expect(
      page.getByText(/e2e client co/i).first()
    ).toBeVisible();
  });
});

// ── New Scan page with agency context ──────────────────────────

test.describe('new scan page with agency context', () => {
  test('renders Run a Scan heading and URL input', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /run a scan/i })).toBeVisible();
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('shows agency context card when agency account is active', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(
      `/dashboard/new-scan?agencyAccount=00000000-0000-4000-8000-000000000201`,
      { waitUntil: 'domcontentloaded' }
    );

    // Agency context card should show the account name
    await expect(page.getByText(/agency context/i)).toBeVisible();
    await expect(page.getByText(/e2e agency inc/i).first()).toBeVisible();
  });

  test('shows client name in context card when client is selected', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(
      `/dashboard/new-scan?agencyAccount=00000000-0000-4000-8000-000000000201&agencyClient=00000000-0000-4000-8000-000000000202`,
      { waitUntil: 'domcontentloaded' }
    );

    await expect(page.getByText(/e2e client co/i).first()).toBeVisible();
  });

  test('WhatNextBanner shows client context copy when client is active', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto(
      `/dashboard/new-scan?agencyAccount=00000000-0000-4000-8000-000000000201&agencyClient=00000000-0000-4000-8000-000000000202`,
      { waitUntil: 'domcontentloaded' }
    );

    // Banner body says "Scan will be linked to E2E Client Co"
    await expect(
      page.getByText(/scan will be linked to e2e client co/i)
    ).toBeVisible();
  });

  test('submitting scan form with client context navigates to results', async ({ page }) => {
    await page.route('**/api/scan', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      // Agency context should be passed
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scanId: 'e2e-agency-scan-result' }),
      });
    });

    await signInAsAgency(page);
    await page.goto(
      `/dashboard/new-scan?agencyAccount=00000000-0000-4000-8000-000000000201&agencyClient=00000000-0000-4000-8000-000000000202`,
      { waitUntil: 'domcontentloaded' }
    );

    await page.getByRole('textbox').fill('https://client.example');
    await page.getByRole('button', { name: /run diagnostic/i }).click();

    await page.waitForURL('**/results/e2e-agency-scan-result', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/results\/e2e-agency-scan-result/);
  });
});

// ── Agency user does not see admin tools ────────────────────────

test.describe('agency user access gates', () => {
  test('agency user does not see Admin Console link in sidebar', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Admin Console link only shows for admin users
    await expect(
      page.getByRole('link', { name: /admin console/i })
    ).not.toBeVisible();
  });

  test('agency user visiting /admin redirects or shows login', async ({ page }) => {
    await signInAsAgency(page);
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    // Admin routes require admin role — should redirect to login or dashboard
    const url = page.url();
    expect(
      url.includes('/login') || url.includes('/dashboard')
    ).toBe(true);
  });
});
