import { expect, test, type Page } from '@playwright/test';

async function gotoStartupDashboardWithE2EAuth(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.context().addCookies([
    {
      name: 'gp_e2e_auth',
      value: 'admin',
      url: page.url(),
    },
  ]);
  await page.goto('/dashboard/startup', { waitUntil: 'domcontentloaded' });
}

test.describe('startup dashboard tabs (e2e auth)', () => {
  test('renders tab bar, panels, and navigates Overview → Audits → Delivery → Settings', async ({ page }) => {
    await gotoStartupDashboardWithE2EAuth(page);

    await expect(page.getByTestId('startup-dashboard-layout')).toBeVisible();
    await expect(page.getByTestId('startup-dashboard-tab-bar')).toBeVisible();
    await expect(page.getByRole('heading', { name: /e2e startup workspace/i })).toBeVisible();

    await expect(page.getByTestId('startup-tab-panel-overview')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^score trend$/i })).toBeVisible();

    await page.getByRole('navigation', { name: 'Startup dashboard sections' }).getByRole('link', { name: /^audits$/i }).click();
    await page.waitForURL(/[?&]tab=audits/);
    await expect(page.getByTestId('startup-tab-panel-audits')).toBeVisible();
    await expect(page.getByTestId('startup-audits-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^audit history$/i })).toBeVisible();

    await page.getByRole('navigation', { name: 'Startup dashboard sections' }).getByRole('link', { name: /^delivery$/i }).click();
    await page.waitForURL(/[?&]tab=delivery/);
    await expect(page.getByTestId('startup-tab-panel-delivery')).toBeVisible();
    await expect(page.getByTestId('startup-delivery-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^slack delivery$/i })).toBeVisible();

    await page.getByRole('navigation', { name: 'Startup dashboard sections' }).getByRole('link', { name: /^settings$/i }).click();
    await page.waitForURL(/[?&]tab=settings/);
    await expect(page.getByTestId('startup-tab-panel-settings')).toBeVisible();
    await expect(page.getByTestId('startup-settings-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^workspace$/i })).toBeVisible();

    await page.getByRole('navigation', { name: 'Startup dashboard sections' }).getByRole('link', { name: /^overview$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/startup(\?[^#]*)?$/);
    await expect(page.getByTestId('startup-tab-panel-overview')).toBeVisible();
  });

  test('status param redirects GitHub callback to Settings tab', async ({ page }) => {
    await gotoStartupDashboardWithE2EAuth(page);
    await page.goto('/dashboard/startup?tab=overview&github=github_connected', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/[?&]tab=settings/);
    await expect(page.getByTestId('startup-tab-panel-settings')).toBeVisible();
    await expect(page.getByText(/github installation connected/i)).toBeVisible();
  });

  test('status param redirects Slack send result to Delivery tab', async ({ page }) => {
    await gotoStartupDashboardWithE2EAuth(page);
    await page.goto('/dashboard/startup?tab=settings&slack=slack_send_ok', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/[?&]tab=delivery/);
    await expect(page.getByTestId('startup-tab-panel-delivery')).toBeVisible();
    await expect(page.getByText(/report sent to slack/i)).toBeVisible();
  });
});
