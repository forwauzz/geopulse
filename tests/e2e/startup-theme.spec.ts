import { expect, test } from '@playwright/test';

test.describe('startup dashboard theme toggle', () => {
  test('persists light/dark mode on startup dashboard', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('theme', 'light');
    });
    await page.context().addCookies([
      {
        name: 'gp_e2e_auth',
        value: 'admin',
        url: page.url(),
      },
    ]);

    await page.goto('/dashboard/startup', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /e2e startup workspace/i })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: /switch to dark mode/i })).toBeVisible();

    await page.getByRole('button', { name: /switch to dark mode/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: /switch to light mode/i })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});
