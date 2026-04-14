import { expect, test, type Page, type TestInfo } from '@playwright/test';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000101';

async function signInAsStartup(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.context().addCookies([
    {
      name: 'gp_e2e_auth',
      value: 'admin',
      url: page.url(),
    },
  ]);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(name),
    fullPage: true,
  });
}

async function openImplementationLane(page: Page) {
  await page
    .locator('details')
    .filter({ has: page.locator('summary').getByText(/implementation lane/i) })
    .locator('summary')
    .click();
}

test.describe('startup_dev workflow', () => {
  test('covers the startup workspace workflow end to end with screenshots', async ({ page }, testInfo) => {
    test.setTimeout(120000);

    await signInAsStartup(page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /e2e startup workspace/i })).toBeVisible();
    await capture(page, testInfo, '01-dashboard-home.png');

    await page.goto('/dashboard/connectors', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^connectors$/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /^github$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect github/i })).toBeVisible();
    await capture(page, testInfo, '02-connectors-github.png');

    await page.getByRole('navigation', { name: 'Connector integrations' }).getByRole('link', { name: /^slack$/i }).click();
    await page.waitForURL(/connector=slack/);
    await expect(page.getByRole('heading', { name: /^slack$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect slack/i })).toBeVisible();
    await capture(page, testInfo, '03-connectors-slack.png');

    await page.goto(`/dashboard/new-scan?startupWorkspace=${WORKSPACE_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: /run a scan/i })).toBeVisible();
    await expect(page.getByText(/startup context/i)).toBeVisible();
    await expect(page.getByText(/scanning for e2e startup workspace/i)).toBeVisible();
    await capture(page, testInfo, '04-new-scan-context.png');

    await page.goto('/dashboard/startup', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('startup-tab-panel-overview')).toBeVisible();
    const orchestrationModule = page.getByTestId('startup-orchestration-module');
    await expect(orchestrationModule).toBeVisible();
    await expect(orchestrationModule.getByText(/planner:\s*claude-opus-4.1/i)).toBeVisible();
    await expect(page.getByTestId('startup-improvement-history')).toBeVisible();
    await capture(page, testInfo, '05-startup-overview.png');

    await openImplementationLane(page);
    const manualQueue = page.getByTestId('startup-manual-operator-queue');
    await expect(manualQueue).toBeVisible();
    await expect(manualQueue.getByText(/run migration 042 in production/i)).toBeVisible();
    const blockExecutionButton = page.getByRole('button', { name: /block execution/i });
    const markCompleteButton = page.getByRole('button', { name: /mark complete/i });
    await blockExecutionButton.click({ trial: true });
    await markCompleteButton.click({ trial: true });
    await capture(page, testInfo, '06-startup-manual-queue.png');

    await page.goto('/dashboard/startup?tab=audits', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('startup-audits-tab')).toBeVisible();
    await expect(page.getByText(/latest execution/i)).toBeVisible();
    const approveExecutionButton = page.getByRole('button', { name: /approve execution/i });
    const rejectExecutionButton = page.getByRole('button', { name: /reject for now/i });
    await expect(approveExecutionButton).toBeVisible();
    await expect(rejectExecutionButton).toBeVisible();
    await approveExecutionButton.click({ trial: true });
    await rejectExecutionButton.click({ trial: true });
    await capture(page, testInfo, '07-startup-audits-approval.png');

    await page.goto('/dashboard/startup?tab=delivery', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('startup-delivery-tab')).toBeVisible();
    await capture(page, testInfo, '08-startup-delivery.png');

    await page.goto('/dashboard/startup?tab=settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('startup-settings-tab')).toBeVisible();
    await capture(page, testInfo, '09-startup-settings.png');
  });
});
