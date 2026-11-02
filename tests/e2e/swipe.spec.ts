import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRoom } from './helpers';

test.use({ hasTouch: true, isMobile: true });

/** A finger drag across the screen at height y, from x1 to x2, in a few steps. */
async function swipe(page: Page, x1: number, x2: number, y = 420, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number) => [{ x, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x1) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x1 + ((x2 - x1) * i) / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Let the next screen finish loading and sliding in.
  await page.waitForTimeout(700);
}

test('swipe sideways between tabs, and the tab bar follows', async ({ browser }) => {
  const page = await (await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })).newPage();
  await createRoom(page, 'Wei', 'Swipe check');
  try {
    const current = () => page.locator('nav button[aria-current="page"]');
    await expect(current()).toContainText('Today');

    // Swipe left: next tab. Swipe right: back.
    await swipe(page, 320, 80);
    await expect(current()).toContainText('Wheel');
    await expect(page).toHaveURL(/#wheel$/);
    await swipe(page, 320, 80);
    await expect(current()).toContainText('Food list');
    await swipe(page, 80, 320);
    await expect(current()).toContainText('Wheel');

    // A short, slow drag springs back
    await swipe(page, 250, 200, 420, 20);
    await expect(current()).toContainText('Wheel');

    // Swiping on the sideways "Ideas" strip scrolls it instead of changing tab
    await page.click('nav >> text=Today');
    const strip = page.locator('.chip-row:has(button.card.lift)').first();
    await strip.scrollIntoViewIfNeeded();
    const box = (await strip.boundingBox())!;
    await swipe(page, 320, 80, box.y + box.height / 2);
    await expect(current()).toContainText('Today');

    // Tapping still works, and the pill sits under the tapped tab
    await page.click('nav >> text=History');
    await expect(current()).toContainText('History');
  } finally {
    await deleteRoom(page);
  }
});
