import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

const bills = (page: Page) => page.locator('main', { has: page.locator('h1:text-is("Bills")') });

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
    // Itemised: one line each, plus 10% service charge, shared by what each person had
    await wei.fill('input[aria-label="Line 1: price (RM)"]', '12');
    await wei.fill('input[aria-label="Line 2: price (RM)"]', '18');
    await wei.click('.sheet label:has-text("Service charge")');
    await expect(wei.getByTestId('bill-total')).toHaveText('RM33.00');
    await wei.getByTestId('receipt-input').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    });
    await wei.click('.sheet button:text-is("Save bill")');
    await expect(wei.getByText('You paid RM33.00 · split 2 ways · Edit')).toBeVisible();

    // Bills tab: Wei adds DuitNow; Alex sees what to pay and where
    await wei.click('nav >> text=Bills');
    await expect(bills(wei)).toContainText('Alex owes You RM19.80');
    await expect(bills(wei)).toContainText('receipt');
    await wei.click('main button:text-is("Add")');
    await wei.fill('#pay-duitnow', '012-345 6789');
    await wei.click('main button:text-is("Save")');
    await expect(bills(wei)).toContainText('DuitNow: 012-345 6789');
    await alex.goto('/#bills');
    await expect(bills(alex)).toContainText('You owe RM19.80');
    await expect(bills(alex)).toContainText('DuitNow: 012-345 6789');
    await expect(alex.locator('a:has-text("Share to WhatsApp")')).toHaveAttribute('href', /wa\.me.*RM19\.80/);
    await alex.click('button:text-is("Mark paid")');
    await expect(bills(alex)).toContainText("Everyone's settled up.");
    await wei.click('nav >> text=History');
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
    // Back in the See all sheet, with the new place at the top.
    await expect(wei.locator('.sheet button.row', { hasText: 'Restoran Yong' })).toBeVisible();
  } finally {
    await deleteRoom(wei);
  }
});
