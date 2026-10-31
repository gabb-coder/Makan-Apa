import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, newPhone } from './helpers';

test('one phone can be in several rooms and switch between them', async ({ browser }) => {
  const phone = await newPhone(browser);
  await createRoom(phone, 'Wei', 'Lunch gang');
  const people = () => phone.locator('button[aria-label*=", code "]').click();

  // Add a second room without leaving the first
  await people();
  await phone.click('button:text-is("Join or create another room")');
  await expect(phone.getByText('Your rooms on this phone')).toBeVisible();
  await expect(phone.locator('button.row', { hasText: 'Lunch gang' })).toBeVisible();
  await phone.fill('#join-name', 'Wei');
  await phone.click('text=Create a new room');
  await phone.fill('#room-name', 'Housemates');
  await phone.click('button:text-is("Create room")');
  await expect(phone.locator('header .eyebrow')).toContainText('Housemates');

  // Switch back, and the choice survives a reload
  await people();
  await phone.locator('button.row', { hasText: 'Lunch gang' }).click();
  await expect(phone.locator('header .eyebrow')).toContainText('Lunch gang');
  await phone.reload();
  await expect(phone.locator('header .eyebrow')).toContainText('Lunch gang');

  // Deleting one room opens the other
  await deleteRoom(phone, false);
  await expect(phone.locator('header .eyebrow')).toContainText('Housemates');
  await deleteRoom(phone);
});
