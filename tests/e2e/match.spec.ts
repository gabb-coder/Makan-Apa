import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

/** Swipe through the whole deck: yes on the first card, no on the rest. Drags the first one. */
async function swipeDeck(page: Page, drag: boolean): Promise<string> {
  await page.click('button:has-text("Start swiping")');
  const title = page.locator('#sw-title');
  await expect(title).toHaveText('1 of 6');
  const first = (await page.locator('.sw-card--top .sw-name').textContent())!.trim();
  if (drag) {
    const box = (await page.locator('.sw-card--top').boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 4 });
    await expect(page.locator('.sw-stamp--yes')).not.toHaveCSS('opacity', '0');
    await page.mouse.move(x + 220, y + 10, { steps: 6 });
    await page.mouse.up();
  } else {
    await page.click('.sw-btn--yes');
  }
  for (let n = 2; n <= 6; n++) {
    await expect(title).toHaveText(`${n} of 6`);
    await page.click('.sw-btn--no');
  }
  await expect(page.getByText('All swiped!')).toBeVisible();
  await page.click('button:text-is("See the matches")');
  return first;
}

test('swipe to match: everyone swipes, the decider picks the match', async ({ browser }) => {
  test.setTimeout(150_000);
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Match check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    await wei.click('nav >> text=Today');
    await expect(wei.getByText(/Your turn!|is choosing/).first()).toBeVisible();
    const [decider, other] = (await wei.getByText('Your turn!').count()) ? [wei, alex] : [alex, wei];
    if (other === wei) await alex.goto('/#today');

    await decider.click('button:text-is("💘 Swipe to match")');
    await decider.click('.sheet button:text-is("6 foods")');
    await decider.click('.sheet button:text-is("Start swiping")');
    await expect(other.getByRole('heading', { name: 'Swipe to match' })).toBeVisible();

    const first = await swipeDeck(decider, false);
    await expect(decider.getByText(/You’re done\. Waiting for/)).toBeVisible();
    expect(await swipeDeck(other, true)).toBe(first);

    // Both liked the first card only: it's the match, and the decider goes with it
    await expect(decider.getByText('It’s a match!')).toBeVisible();
    await expect(other.getByText(/picks from these/)).toBeVisible();
    await decider.click(`button[aria-label="Go with ${first}"]`);
    await expect(other.getByText("It's decided")).toBeVisible();
    await expect(other.locator('main')).toContainText(first);
  } finally {
    await deleteRoom(wei);
  }
});
