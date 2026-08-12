import { expect, test } from '@playwright/test';

const CLIENT_ID = '00000000-0000-4000-8000-000000000202';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000201';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'gp_e2e_auth', value: 'agency', url: page.url() }]);
}

test('authorized partner can inspect all three artifact policies', async ({ page }) => {
  await signIn(page);
  const base = `/dashboard/clients/${CLIENT_ID}/buyer-intelligence?agencyAccount=${ACCOUNT_ID}`;
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /turn one verified snapshot/i })).toBeVisible();
  await expect(page.getByText('Northstar Technology Services').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /generate pdf in new tab/i })).toBeVisible();
  await expect(page.getByText(/no artifacts generated yet/i)).toBeVisible();

  await page.getByLabel('Artifact').selectOption('full_baseline');
  await page.getByRole('button', { name: /update preview/i }).click();
  await expect(page).toHaveURL(/view=full_baseline/);
  await expect(page.getByRole('heading', { name: /how to reproduce this baseline/i })).toBeVisible();
  await expect(page.getByText(/does not invent a peer rank/i)).toBeVisible();

  await page.getByLabel('Artifact').selectOption('monthly_brief');
  await page.getByRole('button', { name: /update preview/i }).click();
  await expect(page).toHaveURL(/view=monthly_brief/);
  await expect(page.getByText(/monthly verification brief/i).first()).toBeVisible();
  await expect(page.getByText(/like-for-like comparison is unavailable/i)).toBeVisible();
});

test('partner workspace stays usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(`/dashboard/clients/${CLIENT_ID}/buyer-intelligence?agencyAccount=${ACCOUNT_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /generate pdf in new tab/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
