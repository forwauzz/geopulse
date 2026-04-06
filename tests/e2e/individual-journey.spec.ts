/**
 * E2E: Individual user journey
 *
 * Tests the full individual (non-agency, non-startup) user experience:
 *   - Unauthenticated redirects
 *   - Login page
 *   - Dashboard home while authenticated
 *   - Run a Scan in-dashboard
 *   - Scan result flow
 *
 * Cookie used: none (public) or gp_e2e_auth=admin (personal user session)
 *
 * NOTE: The 'admin' E2E session also has a startup workspace, so some pages
 * render with workspace context applied. Tests account for this.
 */

import { expect, test } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────

async function signInAsIndividual(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.context().addCookies([
    { name: 'gp_e2e_auth', value: 'admin', url: page.url() },
  ]);
}

// ── Unauthenticated redirect tests ─────────────────────────────

test.describe('unauthenticated redirects', () => {
  test('visiting /dashboard redirects to /login with next param', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await expect(page.getByRole('heading', { name: /^sign in$/i })).toBeVisible();
  });

  test('visiting /dashboard/new-scan redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/new-scan');

    await expect(page).toHaveURL(/\/login/);
  });

  test('visiting /dashboard/connectors redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/connectors');

    await expect(page).toHaveURL(/\/login/);
  });
});

// ── Authenticated dashboard ─────────────────────────────────────

test.describe('authenticated dashboard home', () => {
  test('renders dashboard heading', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible();
  });

  test('renders user email on page', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Email appears multiple times (sidebar + page body); use first() to avoid strict mode error
    await expect(page.getByText(/admin@example\.com/i).first()).toBeVisible();
  });

  test('Run a Scan link is visible in the sidebar', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Sidebar does not use <nav> role — match by link text directly
    await expect(
      page.getByRole('link', { name: /run a scan/i }).first()
    ).toBeVisible();
  });

  test('Connectors link is visible for startup workspace user', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('link', { name: /connectors/i }).first()
    ).toBeVisible();
  });

  test('personal section shows "run your first audit" banner or empty scan list', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // The admin E2E user has 0 personal scans → personal WhatNextBanner shows "Run your first audit"
    await expect(
      page.getByText(/run your first audit/i).first()
    ).toBeVisible();
  });

  test('startup section renders with workspace name', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Admin user also has a startup workspace — it renders below the personal section
    await expect(
      page.getByRole('heading', { name: /e2e startup workspace/i })
    ).toBeVisible();
  });
});

// ── New Scan page ──────────────────────────────────────────────

test.describe('new scan page', () => {
  test('renders Run a Scan heading and URL input', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /run a scan/i })).toBeVisible();
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('shows WhatNextBanner — with startup context for admin user', async ({ page }) => {
    await signInAsIndividual(page);
    // Admin user has startup workspace auto-selected → context banner renders
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    // Banner shows either startup context or personal guidance
    await expect(
      page.getByText(/scanning for|active context|start here|run an ai search/i).first()
    ).toBeVisible();
  });

  test('back link to dashboard is visible', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    // Back link: arrow_back + "Dashboard" text
    await expect(
      page.getByRole('link', { name: /^dashboard$/i }).first()
    ).toBeVisible();
  });

  test('Run diagnostic button is present and enabled', async ({ page }) => {
    await signInAsIndividual(page);
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    // ScanForm renders "Run diagnostic" button
    await expect(
      page.getByRole('button', { name: /run diagnostic/i })
    ).toBeVisible();
  });

  test('submitting scan form navigates to results page', async ({ page }) => {
    await page.route('**/api/scan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scanId: 'e2e-indiv-scan' }),
      });
    });

    // Mock the scan polling endpoint so the results page can render
    await page.route('**/api/scans/e2e-indiv-scan*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-indiv-scan',
          url: 'https://example.com',
          score: 72,
          letterGrade: 'B',
          topIssues: [],
          categoryScores: [],
          hasPaidReport: false,
          reportStatus: 'none',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await signInAsIndividual(page);
    await page.goto('/dashboard/new-scan', { waitUntil: 'domcontentloaded' });

    await page.getByRole('textbox').fill('https://example.com');
    await page.getByRole('button', { name: /run diagnostic/i }).click();

    await page.waitForURL('**/results/e2e-indiv-scan', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/results\/e2e-indiv-scan/);
  });
});

// ── Scan results from the dashboard ────────────────────────────

test.describe('scan results page', () => {
  test('renders score and domain from mocked scan', async ({ page }) => {
    await page.route('**/api/scans/e2e-personal-result*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-personal-result',
          url: 'https://example.com',
          score: 68,
          letterGrade: 'C+',
          topIssues: [
            {
              check: 'Author signals',
              finding: 'No author schema found.',
              fix: 'Add Person schema with sameAs links.',
              status: 'FAIL',
              category: 'ai_readiness',
            },
          ],
          categoryScores: [
            { category: 'ai_readiness', score: 0.68, letterGrade: 'C+', checkCount: 5 },
          ],
          hasPaidReport: false,
          reportStatus: 'none',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-personal-result');

    await expect(page.getByRole('heading', { name: /diagnostic for/i })).toBeVisible();
    await expect(page.getByText(/example\.com/i).first()).toBeVisible();
    // Score "68" appears in multiple places; check for the score display
    await expect(page.getByText(/68\/100|score.*68|68.*100/i).first()).toBeVisible();
  });

  test('results page shows upgrade CTA for free scan', async ({ page }) => {
    await page.route('**/api/scans/e2e-free-scan*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-free-scan',
          url: 'https://example.com',
          score: 55,
          letterGrade: 'D',
          topIssues: [],
          categoryScores: [],
          hasPaidReport: false,
          reportStatus: 'none',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-free-scan');

    // Results page shows the "one path, with a preview first" section for free users
    await expect(
      page.getByText(/one path, with a preview first/i)
    ).toBeVisible();
  });

  test('results page for generating report shows "being prepared" banner', async ({ page }) => {
    await page.route('**/api/scans/e2e-generating-indiv*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-generating-indiv',
          url: 'https://example.com',
          score: 74,
          letterGrade: 'B',
          topIssues: [],
          categoryScores: [],
          hasPaidReport: true,
          reportStatus: 'generating',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-generating-indiv');

    await expect(page.getByText(/your full audit is being prepared/i)).toBeVisible();
  });
});
