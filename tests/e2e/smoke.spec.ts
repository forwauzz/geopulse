import { expect, test } from '@playwright/test';

test.describe('public smoke flows', () => {
  test('home page renders the core scan entry points', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /check your ai search readiness/i })
    ).toBeVisible();
    await expect(page.getByLabel('Website URL')).toBeVisible();
    await expect(page.getByRole('button', { name: /run diagnostic/i })).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('link', { name: /^sign in$/i })
    ).toBeVisible();
  });

  test('scan form blocks submit until verification is complete', async ({ page }) => {
    let scanCalled = false;

    await page.route('**/api/scan', async (route) => {
      scanCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scanId: 'unexpected-scan-id' }),
      });
    });

    await page.addInitScript(() => {
      (
        window as Window & {
          __GEO_PULSE_DISABLE_E2E_TURNSTILE_BYPASS__?: boolean;
        }
      ).__GEO_PULSE_DISABLE_E2E_TURNSTILE_BYPASS__ = true;
    });
    await page.goto('/');

    await page.getByLabel('Website URL').fill('https://example.com');
    await page.getByRole('button', { name: /run diagnostic/i }).click();
    await page.waitForTimeout(500);

    expect(scanCalled).toBe(false);
    await expect(page).toHaveURL(/\/$/);
  });

  test('scan form submits and renders results with mocked scan APIs', async ({ page }) => {
    await page.route('**/api/scan', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as Record<string, unknown>;

      expect(body['url']).toBe('https://example.com');
      expect(body['turnstileToken']).toBe('e2e-bypass-token');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scanId: 'e2e-scan-id' }),
      });
    });

    await page.route('**/api/scans/e2e-scan-id*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-scan-id',
          url: 'https://example.com',
          score: 72,
          letterGrade: 'B',
          topIssues: [
            {
              check: 'Structured data',
              finding: 'Schema coverage is partial.',
              fix: 'Add organization and webpage schema.',
              status: 'FAIL',
              category: 'ai_readiness',
            },
          ],
          categoryScores: [
            { category: 'ai_readiness', score: 0.72, letterGrade: 'B', checkCount: 4 },
          ],
          hasPaidReport: false,
          reportStatus: 'none',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/');
    await page.getByLabel('Website URL').fill('https://example.com');
    await page.getByRole('button', { name: /run diagnostic/i }).click();

    await page.waitForURL('**/results/e2e-scan-id');
    await expect(page.getByRole('heading', { name: /diagnostic for/i })).toBeVisible();
    await expect(page.getByText(/example\.com/i).first()).toBeVisible();
    await expect(page.getByText(/one path, with a preview first/i)).toBeVisible();
  });

  test('results page shows checkout return messaging before payment confirmation', async ({
    page,
  }) => {
    await page.route('**/api/scans/e2e-return-state*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-return-state',
          url: 'https://example.com',
          score: 72,
          letterGrade: 'B',
          topIssues: [],
          categoryScores: [
            { category: 'ai_readiness', score: 0.72, letterGrade: 'B', checkCount: 4 },
          ],
          hasPaidReport: false,
          reportStatus: 'none',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-return-state?checkout=success');

    await expect(
      page.getByText(/waiting for payment confirmation before we start the full audit/i)
    ).toBeVisible();
    await expect(page.getByText(/you are back from checkout/i)).toBeVisible();
    await expect(page.getByText(/continue from preview to the full audit/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /choose what to do next/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue to full audit/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /save preview instead/i }).first()).toBeVisible();
  });

  test('results page surfaces the in-progress action band while the full audit is generating', async ({
    page,
  }) => {
    await page.route('**/api/scans/e2e-generating*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-generating',
          url: 'https://example.com',
          score: 72,
          letterGrade: 'B',
          topIssues: [],
          categoryScores: [
            { category: 'ai_readiness', score: 72, letterGrade: 'B', checkCount: 4 },
          ],
          hasPaidReport: true,
          reportStatus: 'generating',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-generating');

    await expect(page.getByText(/your full audit is being prepared/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /refresh status/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /open dashboard sign-in/i })).toBeVisible();
  });

  test('delivered results page explains dashboard recovery with the checkout email', async ({
    page,
  }) => {
    await page.route('**/api/scans/e2e-delivered*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-delivered',
          url: 'https://example.com',
          score: 84,
          letterGrade: 'A-',
          topIssues: [],
          categoryScores: [
            { category: 'ai_readiness', score: 84, letterGrade: 'A-', checkCount: 4 },
          ],
          hasPaidReport: true,
          reportStatus: 'delivered',
          pdfUrl: 'https://example.com/report.pdf',
          markdownUrl: '/__e2e/delivered-report.md',
        }),
      });
    });

    await page.goto('/results/e2e-delivered');

    await expect(page.getByText(/want this report in your dashboard too/i)).toBeVisible();
    await expect(page.getByText(/same email you used in stripe checkout/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /your report is ready/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in to dashboard/i }).first()).toBeVisible();
  });

  test('results page share snapshot action copies the results link', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as Window & { __geoPulseCopiedText?: string }).__geoPulseCopiedText = value;
          },
        },
      });
    });

    await page.route('**/api/scans/e2e-share*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-share',
          url: 'https://example.com',
          score: 72,
          letterGrade: 'B',
          topIssues: [],
          categoryScores: [
            { category: 'ai_readiness', score: 72, letterGrade: 'B', checkCount: 4 },
          ],
          hasPaidReport: false,
          reportStatus: 'none',
          pdfUrl: null,
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-share');
    await page.getByRole('button', { name: /share snapshot/i }).click();

    await expect(page.getByText(/link copied/i)).toBeVisible();
    const copiedText = await page.evaluate(
      () => (window as Window & { __geoPulseCopiedText?: string }).__geoPulseCopiedText
    );
    expect(copiedText).toContain('/results/e2e-share');
  });

  test('report page falls back to a PDF download when no web report is available', async ({
    page,
  }) => {
    await page.route('**/api/scans/e2e-pdf-only*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-pdf-only',
          url: 'https://example.com',
          domain: 'example.com',
          score: 81,
          letterGrade: 'A-',
          topIssues: [],
          categoryScores: [
            { category: 'ai_readiness', score: 81, letterGrade: 'A-', checkCount: 4 },
          ],
          pdfUrl: 'https://example.com/report.pdf',
          markdownUrl: null,
        }),
      });
    });

    await page.goto('/results/e2e-pdf-only/report', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/available as a pdf download only/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /download pdf/i })).toBeVisible();
  });

  test('report page renders interactive summary from mocked report content', async ({
    page,
  }) => {
    await page.route('**/api/scans/e2e-report*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scanId: 'e2e-report',
          url: 'https://example.com',
          domain: 'example.com',
          score: 81,
          letterGrade: 'A-',
          topIssues: [
            {
              check: 'Structured data',
              finding: 'Schema coverage is partial.',
              fix: 'Add organization and webpage schema.',
              weight: 8,
              status: 'FAIL',
            },
          ],
          categoryScores: [
            { category: 'ai_readiness', score: 81, letterGrade: 'A-', checkCount: 4 },
          ],
          pdfUrl: 'https://example.com/report.pdf',
          markdownUrl: '/__e2e/report.md',
        }),
      });
    });

    await page.route('**/__e2e/report.md', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/markdown',
        body: [
          '# Example report',
          '',
          '## Executive Summary',
          'Example has strong AI readiness.',
          '',
          '## Priority Action Plan',
          '1. Add more schema coverage.',
        ].join('\n'),
      });
    });

    await page.goto('/results/e2e-report/report', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/loading report/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: /example\.com/i })).toBeVisible();
    await expect(page.getByText(/interactive summary/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to results/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /pdf/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /executive summary/i })).toBeVisible();
  });

  test('customer login page renders the magic-link flow', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /email me a sign-in link/i })
    ).toBeVisible();
  });

  test('admin login page renders the operator password flow', async ({ page }) => {
    await page.goto('/admin/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /operator sign-in/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });

  test('unauthenticated benchmark page redirects to login with next path', async ({ page }) => {
    await page.goto('/dashboard/benchmarks');

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fbenchmarks/);
    await expect(page.getByRole('heading', { name: /^sign in$/i })).toBeVisible();
  });

  test('authenticated admin session renders dashboard admin actions', async ({ page }) => {
    await page.goto('/');
    await page.context().addCookies([
      {
        name: 'gp_e2e_auth',
        value: 'admin',
        url: page.url(),
      },
    ]);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /your scans/i })).toBeVisible();
    await expect(page.getByText(/admin@example\.com/i)).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /^benchmarks$/i })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /^logs$/i })).toBeVisible();
  });

  test('authenticated admin session renders benchmark overview', async ({ page }) => {
    await page.goto('/');
    await page.context().addCookies([
      {
        name: 'gp_e2e_auth',
        value: 'admin',
        url: page.url(),
      },
    ]);

    await page.goto('/dashboard/benchmarks', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /^benchmarks$/i })).toBeVisible();
    await expect(page.getByText(/run groups/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /example co/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /brand-baseline/i })).toBeVisible();
  });

  test('authenticated admin session renders benchmark cohort frame on domain history', async ({
    page,
  }) => {
    await page.goto('/');
    await page.context().addCookies([
      {
        name: 'gp_e2e_auth',
        value: 'admin',
        url: page.url(),
      },
    ]);

    await page.goto('/dashboard/benchmarks/domains/e2e-domain-1', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: /benchmark domain history/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /cohort frames/i })).toBeVisible();
    await expect(page.getByText(/example healthcare cohort/i)).toBeVisible();
    await expect(page.getByText(/measured customer/i)).toBeVisible();
    await expect(page.getByText(/competitor example/i)).toBeVisible();
  });
});
