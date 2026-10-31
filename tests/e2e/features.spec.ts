import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test('diet needs, ratings, who paid, dinner and room spots', async ({ browser }) => {
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Feature check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Pizza' })).toBeVisible();

    // Pizza has pork; Alex eats halal, so the pick list flags it
    await wei.locator('button.row', { hasText: 'Pizza' }).click();
    await wei.click('.sheet button.chip:text-is("Has pork")');
    await wei.click('button:text-is("Save changes")');
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    await alex.goto('/#settings');
    await alex.click('button.chip:text-is("Halal")');
    await expect(alex.locator('button.chip:text-is("Halal")')).toHaveAttribute('aria-pressed', 'true');
    await wei.click('nav >> text=Today');
    await wei.click('text=Pick from list');
    await expect(wei.locator('.sheet button.row', { hasText: 'Pizza' })).toContainText('Not for Alex (halal)');

    // Decide, rate and split the bill
    await wei.click('.sheet button.row:has-text("Nasi Lemak")');
    await alex.goto('/#today');
    await alex.click('button:has-text("Let\'s go")');
    await expect(wei.getByText("It's decided")).toBeVisible();
    await wei.click('button[aria-label^="Liked it"]');
    await expect(wei.locator('button[aria-label^="Liked it"]')).toHaveAttribute('aria-pressed', 'true');
    await wei.click('text=Who paid? Split the bill');
    await wei.fill('#bill-amount', '30');
    await wei.click('.sheet button:text-is("Save")');
    await expect(wei.getByText('You paid RM30.00 · split 2 ways · Edit')).toBeVisible();
    await wei.click('nav >> text=History');
    await expect(wei.getByText('RM15.00')).toBeVisible();
    await expect(wei.getByText('Room favourites')).toBeVisible();

    // Lunch and dinner: dinner goes to the next person, Alex
    await wei.goto('/#settings');
    await wei.click('button:text-is("Lunch and dinner")');
    await wei.goto('/#today');
    await wei.click('.segmented button:text-is("Dinner")');
    await expect(wei.getByText('is choosing')).toBeVisible();
    await wei.click('.segmented button:text-is("Lunch")');
    await expect(wei.getByText("It's decided")).toBeVisible();

    // A spot of the room's own
    await wei.click('text=/^See all \\d+$/');
    await wei.click('button:text-is("Add a place")');
    await wei.fill('#spot-name', 'Restoran Yong');
    await wei.fill('#spot-area', 'SS15');
    await wei.click('button:text-is("Add for the whole room")');
    await wei.click('text=/^See all \\d+$/');
    await expect(wei.locator('.sheet button.row', { hasText: 'Restoran Yong' })).toBeVisible();
  } finally {
    await deleteRoom(wei);
  }
});
