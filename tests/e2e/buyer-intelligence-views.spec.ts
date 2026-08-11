import { expect, test, type Page } from '@playwright/test';

async function authenticate(page: Page) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'gp_e2e_auth', value: 'admin', url: page.url() }]);
}

test.describe('buyer intelligence product views', () => {
  test('renders four gated views with client hero proof on desktop', async ({ page }, testInfo) => {
    await authenticate(page);
    await page.goto('/admin/intelligence/buyer-views');

    const kinds = ['prospect_preview', 'full_baseline', 'monthly_brief', 'agency_portfolio'] as const;
    for (const kind of kinds) await expect(page.locator(`[data-view-kind="${kind}"]`)).toHaveCount(1);

    const preview = page.locator('[data-view-kind="prospect_preview"]');
    const heroProof = preview.locator('[data-client-hero-proof] img');
    await expect(heroProof).toBeVisible();
    await heroProof.screenshot({ path: testInfo.outputPath('northstar-hero.png') });
    await expect(preview.getByRole('link', { name: 'View the full baseline' })).toBeVisible();
    await expect(preview.getByText('How to reproduce this baseline')).toHaveCount(0);

    const baseline = page.locator('[data-view-kind="full_baseline"]');
    await expect(baseline.getByText('How to reproduce this baseline')).toBeVisible();
    await expect(baseline.getByText('No eligible comparison cohort was attached')).toBeVisible();
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate((node) => node.clientWidth));
    await page.screenshot({ path: testInfo.outputPath('buyer-intelligence-desktop.png'), fullPage: true });
  });

  test('stays readable without horizontal clipping on a mobile viewport', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticate(page);
    await page.goto('/admin/intelligence/buyer-views');

    await expect(page.locator('[data-view-kind="prospect_preview"] h1')).toBeVisible();
    const dimensions = await page.locator('html').evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.screenshot({ path: testInfo.outputPath('buyer-intelligence-mobile.png'), fullPage: true });
  });
});
