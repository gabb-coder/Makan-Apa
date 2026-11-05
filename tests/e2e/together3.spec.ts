import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

const todayName = () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());

test('days off, deals and queue reports', async ({ browser }) => {
  test.setTimeout(150_000);
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Days check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');

    // Today isn't an eating day any more: no turns, but anyone can decide anyway
    await wei.goto('/#settings');
    await wei.click(`button[aria-label="${todayName()}"]`);
    await expect(wei.locator(`button[aria-label="${todayName()}"]`)).toHaveAttribute('aria-pressed', 'false');
    await wei.goto('/#today');
    await expect(wei.getByRole('heading', { name: 'Day off' })).toBeVisible();
    await wei.click('text=Eating together anyway? I’ll decide');
    await expect(wei.getByText('Your turn!')).toBeVisible();
    // Alex sees whose turn it is once someone started the day
    await alex.reload();
    await expect(alex.getByText('is choosing')).toBeVisible();

    // A deal at a place shows for everyone, on Today and on the place's page
    await wei.click('text=🏷️ Spotted a promo? Post a deal');
    await wei.fill('#deal-text', '1-for-1 teh tarik');
    await wei.selectOption('#deal-spot', { index: 1 });
    const place = (await wei.locator('#deal-spot option:checked').textContent())!.trim();
    await wei.click('.sheet button:text-is("Post deal")');
    await expect(wei.getByText('🏷️ 1-for-1 teh tarik')).toBeVisible();
    await expect(alex.getByText('🏷️ 1-for-1 teh tarik')).toBeVisible();
    await alex.getByText('🏷️ 1-for-1 teh tarik').click();
    await expect(alex.locator('#spot-title')).toHaveText(place);
    await expect(alex.locator('section[aria-labelledby="spot-deals-label"]')).toContainText('1-for-1 teh tarik');

    // Alex says the queue there is short; Wei sees it on the same place
    await alex.click('.sheet button:has-text("Short queue")');
    await expect(alex.getByText('Thanks! Everyone heading here sees it for 30 minutes.')).toBeVisible();
    await wei.reload();
    await wei.getByText('🏷️ 1-for-1 teh tarik').click();
    await expect(wei.locator('section[aria-labelledby="queue-label"]')).toContainText('Short queue');
  } finally {
    await deleteRoom(wei);
  }
});

/** Whoever's turn it is today. */
async function deciderOf(wei: Page, alex: Page): Promise<[Page, Page]> {
  await expect(wei.getByText(/Your turn!|is choosing/).first()).toBeVisible();
  return (await wei.getByText('Your turn!').count()) ? [wei, alex] : [alex, wei];
}

test('a mystery lunch with lifts, Wrapped, and copying the food list', async ({ browser }) => {
  test.setTimeout(180_000);
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Mystery check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    await wei.click('nav >> text=Today');

    // The decider picks a mystery: agreed at once, hidden from the other
    const [decider, other] = await deciderOf(wei, alex);
    await decider.click('button:text-is("Pick from list")');
    await decider.click('.sheet label:has-text("Make it a mystery")');
    await decider.locator('.sheet button.row', { hasText: 'Mamak' }).first().click();
    await expect(other.getByRole('heading', { name: 'Mystery lunch!' })).toBeVisible();
    await expect(other.locator('main')).not.toContainText('Mamak');

    // The decider sets where to meet (late tonight, so it stays a mystery)
    await decider.locator('section[aria-labelledby="meet-label"] input[type="time"]').fill('23:59');
    await decider.locator('section[aria-labelledby="meet-label"] input:not([type])').fill('Lobby');
    await decider.click('button:text-is("Set meet-up")');

    // Lifts: the decider drives, the other grabs a seat
    await decider.click('text=🚗 I’m driving: offer a lift');
    await decider.click('button:text-is("Offer lift")');
    await expect(decider.getByText('You’re driving')).toBeVisible();
    await other.click('button:text-is("Grab a seat")');
    await expect(decider.getByText(/With (Alex|Wei)/)).toBeVisible();

    // Reveal: now the other sees it
    await decider.click('button:text-is("Reveal now")');
    await expect(other.getByText('Mamak!').first()).toBeVisible();

    // History has the month as a story
    await wei.click('nav >> text=History');
    // With motion on, so the story plays by itself
    await wei.emulateMedia({ reducedMotion: 'no-preference' });
    await wei.locator('button.chip', { hasText: /wrapped/ }).first().click();
    await expect(wei.getByRole('dialog')).toContainText('Mystery check');
    // The story moves on by itself to the top food, then Next goes on to variety
    await expect(wei.getByRole('dialog')).toContainText('Mamak', { timeout: 12_000 });
    await expect(wei.getByRole('dialog')).toContainText('2/');
    await wei.click('[role="dialog"] button:text-is("Next")');
    await expect(wei.getByRole('dialog')).toContainText('different food');
    // Pausing stops it moving on
    await wei.click('[role="dialog"] button[aria-label="Pause"]');
    await wei.waitForTimeout(7_500);
    await expect(wei.getByRole('dialog')).toContainText('3/');
    await wei.keyboard.press('Escape');
    await expect(wei.getByRole('dialog')).toHaveCount(0);
    await wei.emulateMedia({ reducedMotion: 'reduce' });

    // A second room on Wei's phone copies this room's food list
    await wei.goto('/');
    await wei.click('button[aria-haspopup="menu"]');
    await wei.click('[role="menuitem"]:has-text("Create")');
    await wei.fill('#room-name', 'Copy check');
    await wei.click('button:text-is("Create room")');
    await wei.click('nav >> text=Food list');
    await wei.click('button:text-is("Copy from another room")');
    await wei.locator('.sheet button', { hasText: 'Mystery check' }).click();
    await expect(wei.getByText(/Added \d+ foods and 0 places\./)).toBeVisible();
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    // Delete the copy (from inside it), then back to the first room
    await wei.click('nav >> text=Today');
    await wei.click('button[aria-label="Room settings"]');
    await wei.click('text=Delete this room for everyone');
    await wei.click('text=Tap again to delete everything');
    await wei.locator('main li button', { hasText: 'Mystery check' }).first().click();
    await expect(wei.locator('header h1')).toContainText('Mystery check');
  } finally {
    await deleteRoom(wei);
  }
});
