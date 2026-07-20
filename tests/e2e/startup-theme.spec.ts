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
    // One button that toggles, labelled "Toggle color theme" in both states — it used to be two
    // state-specific labels ("Switch to dark mode" / "Switch to light mode"). The applied theme,
    // not the label, is the behaviour worth pinning.
    await expect(page.getByRole('button', { name: /toggle color theme/i })).toBeVisible();

    await page.getByRole('button', { name: /toggle color theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});
