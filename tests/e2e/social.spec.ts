import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Makes today a fixed Mamak day, so lunch decides itself. */
async function decideToday(page: Page) {
  await page.goto('/#settings');
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  await page.locator('label', { hasText: today }).locator('select').selectOption('Mamak');
  await page.goto('/#today');
  await expect(page.locator('main')).toContainText('Mamak!');
}

test('chat, reactions, meal photos, place tips and the kitty', async ({ browser }) => {
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Social check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');

    // Chat: Alex writes, Wei sees a new-message badge and reads it
    await alex.click('button[aria-label="Chat"]');
    await alex.fill('#chat-input', 'Running 5 min late');
    await alex.click('button[aria-label="Send"]');
    await expect(alex.getByRole('log')).toContainText('Running 5 min late');
    await wei.click('nav >> text=Today');
    await wei.click('button[aria-label="Chat, 1 new message"]');
    await expect(wei.getByRole('log')).toContainText('Alex');
    await expect(wei.getByRole('log')).toContainText('Running 5 min late');
    await wei.click('button[aria-label="Back"]');
    await expect(wei.locator('button[aria-label="Chat"]')).toBeVisible();

    // Lunch is decided: Wei reacts, Alex sees it
    await decideToday(wei);
    await wei.click('button[aria-label="Fire"]');
    await expect(wei.locator('button[aria-label="Fire: You"]')).toHaveAttribute('aria-pressed', 'true');
    await alex.goto("/#today");
    await expect(alex.locator('button[aria-label="Fire: Wei"]')).toBeVisible();

    // A photo of the meal shows on Today and in History
    await wei.getByTestId('meal-photo-input').first().setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: PNG });
    await expect(wei.locator('button[aria-label="Meal photo by You"]').first()).toBeVisible();
    await wei.click('nav >> text=History');
    await expect(wei.getByRole('heading', { name: 'Photos' })).toBeVisible();
    await expect(wei.locator('button[aria-label="Photo of Mamak"]')).toBeVisible();
    await wei.click('nav >> text=Today');

    // A tip on a place, seen by the other phone
    await wei.click('text=/^See all \\d+$/');
    await wei.locator('.sheet button.row').first().click();
    const spotName = (await wei.locator('#spot-title').textContent())!;
    await wei.fill('#place-note', 'Cash only');
    await wei.click('.sheet button:text-is("Add")');
    await expect(wei.locator('.sheet')).toContainText('“Cash only”');
    await alex.click('text=/^See all \\d+$/');
    await alex.locator('.sheet button.row', { hasText: spotName }).first().click();
    await expect(alex.locator('.sheet')).toContainText('“Cash only”');
    await alex.keyboard.press('Escape');

    // The kitty: Wei keeps it, both top up, and a bill paid from it leaves nobody owing
    await wei.goto('/#settings');
    await wei.getByRole('switch', { name: 'Use a group kitty' }).check();
    await expect(wei.locator('#kitty-keeper option:checked')).toHaveText('Wei (you)');
    await wei.click('nav >> text=Bills');
    const kittyCard = wei.locator('section[aria-labelledby="kitty-label"]');
    await kittyCard.locator('button:text-is("Record a top-up")').click();
    await kittyCard.locator('#kitty-amount').fill('50');
    await kittyCard.locator('button:text-is("Add")').click();
    await kittyCard.locator('button:text-is("Record a top-up")').click();
    await kittyCard.locator('button.chip:text-is("Alex")').click();
    await kittyCard.locator('#kitty-amount').fill('50');
    await kittyCard.locator('button:text-is("Add")').click();
    await expect(kittyCard).toContainText('RM100.00');
    await wei.locator('button[aria-label*="add bill"]').first().click();
    await wei.click('.sheet button.chip:text-is("🫙 The kitty")');
    await wei.fill('input[aria-label="Line 1: price (RM)"]', '12');
    await wei.fill('input[aria-label="Line 2: price (RM)"]', '18');
    await wei.click('.sheet button:text-is("Save bill")');
    await expect(kittyCard).toContainText('RM70.00');
    await expect(kittyCard).toContainText('RM38.00 left');
    await expect(kittyCard).toContainText('RM32.00 left');
    await expect(wei.locator('main')).toContainText("Everyone's settled up.");
    await expect(wei.locator('main')).toContainText('from the kitty');
  } finally {
    await deleteRoom(wei);
  }
});

test('host controls: lock the room, let someone in, hand over, remove', async ({ browser }) => {
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Host check');
  try {
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');

    // Wei locks the room; Sam has to ask
    await wei.goto('/#settings');
    await wei.click('button:text-is("Ask me first")');
    await expect(wei.locator('button:text-is("Ask me first")')).toHaveAttribute('aria-pressed', 'true');
    const sam = await newPhone(browser);
    await sam.goto(`/?join=${code}`);
    await sam.fill('#join-name', 'Sam');
    await sam.click('button:text-is("Join room")');
    await expect(sam.getByRole('status')).toContainText('Waiting for the host to let you in');

    // Wei sees the request on Today and lets Sam in; Sam's phone goes straight into the room
    await wei.goto('/#today');
    await expect(wei.getByText('Sam wants to join')).toBeVisible();
    await wei.click('button:text-is("Let in")');
    await expect(sam.locator('header h1')).toContainText('Host check');

    // Wei hands host over to Alex
    await wei.goto('/#settings');
    await wei.click('button[aria-label="Edit Alex"]');
    await wei.click('button:text-is("Make Alex the host")');
    await wei.click('button:text-is("Tap again to hand over to Alex")');
    await expect(wei.getByText('Alex is the host now.')).toBeVisible();
    await alex.goto('/#settings');
    await expect(alex.getByText('You’re the host: tap someone’s name', { exact: false })).toBeVisible();

    // Alex removes Sam, who then can't just join again
    await alex.click('button[aria-label="Edit Sam"]');
    await alex.click('button:text-is("Remove Sam from the room")');
    await alex.click('button:text-is("Tap again to remove Sam")');
    await expect(alex.locator('ol')).not.toContainText('Sam');
    const sam2 = await newPhone(browser);
    await sam2.goto(`/?join=${code}`);
    await sam2.fill('#join-name', 'Sam');
    await sam2.click('button:text-is("Join room")');
    await expect(sam2.getByRole('status')).toContainText('Waiting for the host');

    // Back to Wei as host so the room can be deleted
    await alex.click('button[aria-label="Edit Wei"]');
    await alex.click('button:text-is("Make Wei the host")');
    await alex.click('button:text-is("Tap again to hand over to Wei")');
    await expect(alex.getByText('Wei is the host now.')).toBeVisible();
  } finally {
    await deleteRoom(wei);
  }
});
