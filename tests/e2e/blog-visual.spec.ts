import { expect, test } from '@playwright/test';

test.describe('blog visual QA', () => {
  test('blog index uses light blog shell and readable accents', async ({ page }) => {
    await page.goto('/blog');

    await expect(page.getByRole('heading', { name: /clear answers about ai search readiness/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /e2e blog dark theme fixture/i }).first()).toBeVisible();

    const headerBackground = await page.locator('header').evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    const footerBackground = await page.locator('footer').evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Light blog chrome (not marketing dark mode): near-white / light gray RGB
    expect(headerBackground).not.toMatch(/^rgba?\(0,\s*0,\s*0/);
    expect(footerBackground).not.toBe('rgb(0, 0, 0)');
  });

  test('topic and article pages match light blog readability', async ({ page }) => {
    await page.goto('/blog/topic/ai_search_readiness');
    await expect(page).toHaveURL(/\/blog\/topic\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/blog/e2e-blog-dark-theme');
    await expect(page).toHaveURL(/\/blog\/e2e-blog-dark-theme/);
    await expect(page.getByRole('heading', { name: /e2e blog dark theme fixture/i })).toBeVisible();

    const articleCardBackground = await page
      .locator('article')
      .first()
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(articleCardBackground).not.toBe('rgb(9, 9, 11)');

    await expect(page.getByText(/run the free scan/i)).toBeVisible();
  });
});
