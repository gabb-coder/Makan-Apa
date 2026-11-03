import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test('plan ahead, quick vote, meet-up and running late', async ({ browser }) => {
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Vote check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Nasi Lemak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    await wei.click('nav >> text=Today');

    // Alex marks tomorrow as away
    await alex.click('text=/Plan ahead/');
    await alex.locator('.sheet button[aria-label*="Lunch: in"]').nth(1).click();
    await expect(alex.locator('.sheet button[aria-pressed="true"]')).toHaveCount(1);
    await alex.click('.sheet button:text-is("Done")');
    // So tomorrow's turn passes from Alex to Wei
    const upNext = wei.locator('section:has(.section-label:text-is("Up next"))');
    await expect(upNext.locator('.card').first()).toContainText('You');

    // Wei puts it to a vote between two foods; both vote, and the winner is locked in
    await wei.click('text=/Put it to a vote/');
    await wei.click('.sheet button.chip:text-is("Nasi Lemak")');
    await wei.click('.sheet button.chip:text-is("Mamak")');
    await wei.click('.sheet button:text-is("Start the vote")');
    await expect(alex.getByText('Quick vote')).toBeVisible();
    await alex.click('section[aria-labelledby="vote-label"] button:has-text("Mamak")');
    await wei.click('section[aria-labelledby="vote-label"] button:has-text("Mamak")');
    await expect(wei.getByText("It's decided")).toBeVisible();
    await expect(wei.locator('main')).toContainText('Mamak!');

    // Meet-up: Wei sets it, Alex sees it and says they're running late
    const meet = (p: typeof wei) => p.locator('section[aria-labelledby="meet-label"]');
    await meet(wei).locator('input[type="time"]').fill('12:30');
    await meet(wei).locator('input:not([type="time"])').fill('Lobby');
    await meet(wei).locator('button:text-is("Set meet-up")').click();
    await expect(meet(alex)).toContainText('Leaving 12:30 · Lobby');
    await meet(alex).locator('button:has-text("running late")').click();
    await expect(meet(wei)).toContainText('Alex is running late');
  } finally {
    await deleteRoom(wei);
  }
});

test('fixed days, room icon, map view and QR invite', async ({ browser }) => {
  const wei = await newPhone(browser);
  await createRoom(wei, 'Wei', 'Fixed check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();

    // Today is a fixed day: lunch decides itself
    await wei.goto('/#settings');
    const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
    await wei.locator('label', { hasText: today }).locator('select').selectOption('Mamak');
    // Pick an icon and show the QR invite
    await wei.click('button[aria-label="🍜"]');
    await wei.click('button:text-is("Show QR code to scan")');
    await expect(wei.getByRole('img', { name: /QR code to join room/ })).toBeVisible();
    await wei.click('.sheet button:text-is("Close")');
    await wei.goto('/#today');
    await expect(wei.getByText("It's decided")).toBeVisible();
    await expect(wei.locator('main')).toContainText('Mamak!');

    // The map of places
    await wei.click('text=/^See all \\d+$/');
    await wei.click('.sheet button:text-is("Map")');
    await expect(wei.locator('.leaflet-container')).toBeVisible();
    await expect(wei.locator('.leaflet-interactive').first()).toBeVisible();
    await wei.keyboard.press('Escape');

    // The main menu shows the room's icon
    await wei.goto('/');
    await expect(wei.locator('main li', { hasText: 'Fixed check' })).toContainText('🍜');
    await wei.locator('main li button', { hasText: 'Fixed check' }).first().click();
  } finally {
    await deleteRoom(wei);
  }
});
