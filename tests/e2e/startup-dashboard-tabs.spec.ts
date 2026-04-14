import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

async function openImplementationLane(page: Page) {
  await page
    .locator('details')
    .filter({ has: page.locator('summary').getByText(/implementation lane/i) })
    .locator('summary')
    .click();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(name),
    fullPage: true,
  });
}

test.describe('startup dashboard tabs (e2e auth)', () => {
  test('renders tab bar, panels, and navigates Overview to Audits to Delivery to Settings', async ({ page }, testInfo) => {
    await gotoStartupDashboardWithE2EAuth(page);

    await expect(page.getByTestId('startup-dashboard-layout')).toBeVisible();
    await expect(page.getByTestId('startup-dashboard-tab-bar')).toBeVisible();
    await expect(page.getByRole('heading', { name: /e2e startup workspace/i })).toBeVisible();

    await expect(page.getByTestId('startup-tab-panel-overview')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^score trend$/i })).toBeVisible();
    const orchestrationModule = page.getByTestId('startup-orchestration-module');
    await expect(orchestrationModule).toBeVisible();
    await expect(orchestrationModule.getByText(/planner created repo-aware execution tasks/i)).toBeVisible();
    await expect(orchestrationModule.getByText(/planner:\s*claude-opus-4.1/i)).toBeVisible();
    await capture(page, testInfo, 'overview-orchestration-module.png');

    await openImplementationLane(page);
    const manualQueue = page.getByTestId('startup-manual-operator-queue');
    await expect(manualQueue).toBeVisible();
    await expect(manualQueue.getByText(/manual operator queue/i)).toBeVisible();
    await expect(manualQueue.getByText(/run production migration/i)).toBeVisible();
    const blockExecutionButton = page.getByRole('button', { name: /block execution/i });
    const markCompleteButton = page.getByRole('button', { name: /mark complete/i });
    await expect(blockExecutionButton).toBeVisible();
    await expect(markCompleteButton).toBeVisible();
    await blockExecutionButton.click({ trial: true });
    await markCompleteButton.click({ trial: true });
    await capture(page, testInfo, 'overview-manual-operator-queue.png');

    await page
      .getByRole('navigation', { name: 'Startup dashboard sections' })
      .getByRole('link', { name: /^audits$/i })
      .click();
    await page.waitForURL(/[?&]tab=audits/);
    await expect(page.getByTestId('startup-tab-panel-audits')).toBeVisible();
    await expect(page.getByTestId('startup-audits-tab')).toBeVisible();
    await expect(
      page.getByTestId('startup-audits-tab').getByRole('heading', { name: /^audit history$/i })
    ).toBeVisible();
    await expect(page.getByText(/latest execution/i)).toBeVisible();
    await expect(page.getByTestId('startup-audits-tab').getByText(/^plan ready$/i).first()).toBeVisible();
    await expect(
      page.getByTestId('startup-audits-tab').getByText(/planner created repo-aware execution tasks/i).first()
    ).toBeVisible();
    await expect(page.getByTestId('startup-audits-tab').getByText(/execution approval/i)).toBeVisible();
    await expect(page.getByTestId('startup-audits-tab').getByText(/ready for review/i).first()).toBeVisible();
    await expect(page.getByTestId('startup-execution-approval-actions')).toBeVisible();
    const approveExecutionButton = page.getByRole('button', { name: /approve execution/i });
    await expect(approveExecutionButton).toBeVisible();
    await approveExecutionButton.click({ trial: true });
    await expect(page.getByRole('columnheader', { name: /^execution$/i })).toBeVisible();
    await capture(page, testInfo, 'audits-execution-approval.png');

    await page
      .getByRole('navigation', { name: 'Startup dashboard sections' })
      .getByRole('link', { name: /^delivery$/i })
      .click();
    await page.waitForURL(/[?&]tab=delivery/);
    await expect(page.getByTestId('startup-tab-panel-delivery')).toBeVisible();
    await expect(page.getByTestId('startup-delivery-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^slack delivery at a glance$/i })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Startup dashboard sections' })
      .getByRole('link', { name: /^settings$/i })
      .click();
    await page.waitForURL(/[?&]tab=settings/);
    await expect(page.getByTestId('startup-tab-panel-settings')).toBeVisible();
    await expect(page.getByTestId('startup-settings-tab')).toBeVisible();
    await expect(page.getByRole('heading', { name: /only the controls that need attention now/i })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Startup dashboard sections' })
      .getByRole('link', { name: /^overview$/i })
      .click();
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

  test('audits table shows execution badge and orchestration summary', async ({ page }, testInfo) => {
    await gotoStartupDashboardWithE2EAuth(page);
    await page.goto('/dashboard/startup?tab=audits', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('startup-audits-tab')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^execution$/i })).toBeVisible();
    await expect(page.locator('tbody').getByText(/^plan ready$/i)).toBeVisible();
    await expect(page.locator('tbody').getByText(/planner created repo-aware execution tasks/i)).toBeVisible();
    const rejectButton = page.getByRole('button', { name: /reject for now/i });
    await expect(rejectButton).toBeVisible();
    await rejectButton.click({ trial: true });
    await capture(page, testInfo, 'audits-table-summary.png');
  });

  test('overview shows improvement history and the manual operator queue from the latest implementation plan', async ({ page }, testInfo) => {
    await gotoStartupDashboardWithE2EAuth(page);

    await expect(page.getByTestId('startup-tab-panel-overview')).toBeVisible();
    const orchestrationModule = page.getByTestId('startup-orchestration-module');
    await expect(orchestrationModule).toBeVisible();
    await expect(orchestrationModule.getByText(/planner:\s*claude-opus-4.1/i)).toBeVisible();
    await expect(orchestrationModule.getByText(/repo review:\s*gpt-5.4/i)).toBeVisible();
    await expect(orchestrationModule.getByText(/2 tasks/i)).toBeVisible();
    const improvementHistory = page.getByTestId('startup-improvement-history');
    await expect(improvementHistory).toBeVisible();
    await expect(improvementHistory.getByText(/^executions$/i)).toBeVisible();
    await expect(page.getByText(/benchmark-ready outcomes/i)).toBeVisible();
    await capture(page, testInfo, 'overview-improvement-history.png');

    await openImplementationLane(page);
    const manualQueue = page.getByTestId('startup-manual-operator-queue');
    await expect(manualQueue).toBeVisible();
    await expect(manualQueue.getByText(/run migration 042 in production/i)).toBeVisible();
    await expect(manualQueue.getByText(/evidence needed: migration output, dashboard screenshot/i)).toBeVisible();
  });
});
