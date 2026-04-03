import { expect, test } from '@playwright/test';

test.describe('blog visual QA', () => {
  test('blog index uses dark theme shell and readable accents', async ({ page }) => {
    await page.goto('/blog');

    await expect(page.getByRole('heading', { name: /clear answers about ai search readiness/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /e2e blog dark theme fixture/i }).first()).toBeVisible();

    const headerBackground = await page.locator('header').evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    const footerBackground = await page.locator('footer').evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    expect(headerBackground).toMatch(/^rgba?\(0,\s*0,\s*0/);
    expect(footerBackground).toBe('rgb(0, 0, 0)');
  });

  test('topic and article pages retain dark readability markers', async ({ page }) => {
    await page.goto('/blog');
    const topicHref = await page.getByRole('link', { name: /open topic page/i }).first().getAttribute('href');
    expect(topicHref).toBeTruthy();
    await page.goto(topicHref as string);
    await expect(page).toHaveURL(/\/blog\/topic\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const articleHref = await page.getByRole('link', { name: /e2e blog dark theme fixture/i }).first().getAttribute('href');
    expect(articleHref).toBeTruthy();
    await page.goto(articleHref as string);
    await expect(page).toHaveURL(/\/blog\/e2e-blog-dark-theme/);
    await expect(page.getByRole('heading', { name: /e2e blog dark theme fixture/i })).toBeVisible();

    const articleCardBackground = await page
      .locator('article')
      .first()
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(articleCardBackground).toBe('rgb(9, 9, 11)');

    await expect(page.getByText(/run the free scan/i)).toBeVisible();
  });
});
