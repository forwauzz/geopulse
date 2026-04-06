import { expect, test } from '@playwright/test';

type RouteCase = {
  path: string;
  heading: RegExp;
};

const ROUTE_CASES: RouteCase[] = [
  { path: '/', heading: /check your ai search readiness/i },
  { path: '/dashboard', heading: /^dashboard$/i },
  { path: '/dashboard/startup', heading: /e2e startup workspace/i },
];

test.describe('theme parity smoke', () => {
  test('persists dark mode across home and dashboard routes', async ({ page }) => {
    await page.goto('/');
    await page.context().addCookies([
      {
        name: 'gp_e2e_auth',
        value: 'admin',
        url: page.url(),
      },
    ]);

    for (const routeCase of ROUTE_CASES) {
      await page.evaluate(() => {
        window.localStorage.setItem('theme', 'light');
      });

      await page.goto(routeCase.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: routeCase.heading }).first()).toBeVisible();
      await expect(page.locator('html')).not.toHaveClass(/dark/);

      const darkModeButton = page.getByRole('button', { name: /switch to dark mode/i });
      await expect(darkModeButton).toBeVisible();
      await expect(darkModeButton).toBeEnabled();
      await darkModeButton.click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect(page.getByRole('button', { name: /switch to light mode/i })).toBeVisible();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveClass(/dark/);
    }
  });
});
