import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom } from './helpers';

const SS15 = { latitude: 3.0768, longitude: 101.5875 };
const KLCC = { latitude: 3.1579, longitude: 101.7116 };

test('location sorts Sunway ideas by distance, and searches around you when far away', async ({ browser }) => {
  const context = await browser.newContext({ geolocation: SS15, permissions: ['geolocation'] });
  const page = await context.newPage();
  await createRoom(page, 'Wei', 'Location test');

  await page.click("text=Use my location to find what's closest");
  await expect(page.getByText('Closest to you first')).toBeVisible();
  await expect(page.getByText('Ideas closest to you')).toBeVisible();
  // The nearest ideas are in SS15 itself.
  await expect(page.locator('.chip-row .card').first()).toContainText('SS15 Subang Jaya');

  // Remembered on this phone: a reload finds you again without asking.
  await page.reload();
  await expect(page.getByText('Closest to you first')).toBeVisible();

  // Far from Sunway: Google Maps searches around you instead.
  await context.setGeolocation(KLCC);
  await page.click('text=Stop using location');
  await expect(page.getByText('Ideas near Sunway Uni')).toBeVisible();
  await page.click("text=Use my location to find what's closest");
  await expect(page.getByText('Ideas near you')).toBeVisible();
  const search = page.locator('a', { hasText: 'Nasi lemak' });
  await expect(search).toHaveAttribute('href', /google\.com\/maps\/search\/nasi%20lemak\/@3\.157/);

  await deleteRoom(page);
  await context.close();
});
