import { expect, test } from '@playwright/test';

test('admin sees canonical buyer-intelligence operating decisions and burden', async ({ page, context }) => {
  await page.goto('/');
  await context.addCookies([{ name: 'gp_e2e_auth', value: 'admin', url: new URL(page.url()).origin }]);
  await page.goto('/admin/intelligence');
  await expect(page).toHaveURL(/\/admin\/intelligence$/);
  await expect(page.getByRole('heading', { name: 'Buyer intelligence product health' })).toBeVisible();
  await expect(page.getByText('No active legacy artifact consumers')).toBeVisible();
  await expect(page.getByText('REVISE')).toBeVisible();
  await expect(page.getByText('DEFER')).toBeVisible();
  await expect(page.getByText(/No customer payloads, emails, tokens, signed URLs/)).toBeVisible();
});
