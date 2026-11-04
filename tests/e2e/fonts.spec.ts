import { expect, test } from '@playwright/test';

// Google Fonts load after the page, so a slow or blocked fonts server never holds the app up
// (it used to: the first test on CI would sometimes hang until it timed out).
test('the app opens even when Google Fonts never answers', async ({ browser }) => {
  const context = await browser.newContext();
  await context.route('**/fonts.googleapis.com/**', () => {});
  await context.route('**/fonts.gstatic.com/**', () => {});
  const page = await context.newPage();
  await page.goto('/', { timeout: 10_000 });
  await expect(page.locator('#join-name')).toBeVisible({ timeout: 5_000 });
  await context.close();
});

test('the fonts still arrive after the page has loaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]')).toHaveCount(1);
});
