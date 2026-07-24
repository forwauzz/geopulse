import { expect, test } from '@playwright/test';

type RouteCase = {
  path: string;
  heading: RegExp;
};

const ROUTE_CASES: RouteCase[] = [
  { path: '/', heading: /see how ai sees your business/i },
  // /dashboard is the scan hero and nothing else now — its heading is the hero's, not "Dashboard".
  { path: '/dashboard', heading: /audit any website/i },
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

      const darkModeButton = page.getByRole('button', { name: /toggle color theme/i });
      await expect(darkModeButton).toBeVisible();
      await expect(darkModeButton).toBeEnabled();
      await darkModeButton.click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      // The label is now static ("Toggle color theme") in both states, so the applied theme above
      // is the assertion that carries the behaviour.

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveClass(/dark/);
    }
  });
});
