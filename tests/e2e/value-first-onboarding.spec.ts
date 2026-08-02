import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page, role: 'admin' | 'agency') {
  await page.goto('/');
  await page.context().addCookies([{ name: 'gp_e2e_auth', value: role, url: page.url() }]);
}

test.describe('value-first onboarding', () => {
  test('a non-marketer starts with intent, business name, and website only', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/dashboard/welcome', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /get to a useful answer first/i })).toBeVisible();
    await expect(page.getByText(/you do not need to understand geo tools/i)).toBeVisible();
    await expect(page.getByText('My business', { exact: true })).toBeVisible();
    await expect(page.getByText('Client work', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /business name/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^website$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /detect business details/i })).toBeVisible();
    await expect(page.getByText(/confirm the right market/i)).toBeVisible();
    await expect(page.getByText(/build buyer questions/i)).toBeVisible();
    await expect(page.getByText(/reveal one next action/i)).toBeVisible();
  });

  test('the welcome path stays readable without horizontal scrolling on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'admin');
    await page.goto('/dashboard/welcome', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /get to a useful answer first/i })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });

  test('agency client setup uses the same familiar two-field flow', async ({ page }) => {
    await signIn(page, 'agency');
    await page.goto('/dashboard/clients?agencyAccount=00000000-0000-4000-8000-000000000201&manage=1', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /clients/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /add the business; geo-pulse handles the setup/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /business name/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^website$/i })).toBeVisible();
    await expect(page.getByText(/held report preview/i)).toBeVisible();
  });

  test('activation reveals one dominant next action and keeps sharing held', async ({ page }) => {
    await signIn(page, 'agency');
    await page.goto('/dashboard/clients/00000000-0000-4000-8000-000000000202?agencyAccount=00000000-0000-4000-8000-000000000201&activation=1', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/first useful result/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /build e2e client co's starting point/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /complete baseline/i })).toBeVisible();
    await expect(page.getByText(/next: use the highlighted baseline action below/i)).toBeVisible();
    await expect(page.getByText(/sharing is held for review/i)).toBeVisible();
  });
});
