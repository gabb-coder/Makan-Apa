import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, newPhone } from './helpers';

test('one phone can be in several rooms and switch between them', async ({ browser }) => {
  const phone = await newPhone(browser);
  await createRoom(phone, 'Wei', 'Lunch gang');
  const people = () => phone.locator('button[aria-label*=", code "]').click();

  // Add a second room without leaving the first
  await people();
  await phone.click('button:text-is("Join or create another room")');
  // Your name carries over from your other room
  await expect(phone.locator('#join-name')).toHaveValue('Wei');
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

  // Home: every room, like a list of group chats; open one and come back
  await phone.goto('/');
  await expect(phone.getByRole('heading', { name: '2 rooms' })).toBeVisible();
  await expect(phone.locator('main li', { hasText: 'Housemates' })).toContainText('Your turn to choose');
  await phone.locator('main li button', { hasText: 'Housemates' }).click();
  await expect(phone.locator('header .eyebrow')).toContainText('Housemates');
  await phone.click('button[aria-label="All rooms"]');
  await expect(phone.locator('main li', { hasText: 'Lunch gang' })).toBeVisible();

  // Today: down for lunch in both rooms, so skip one
  const today = phone.locator('section[aria-labelledby="today-label"]');
  await expect(today).toContainText('in 2 rooms');
  await today.locator('button[aria-label="Skip Lunch in Lunch gang"]').click();
  await expect(phone.locator('main li', { hasText: 'Lunch gang' })).toContainText('You’re out today');
  await expect(today).not.toContainText('in 2 rooms');

  // ⋯ on a room: pin it to the top
  await phone.click('button[aria-label="More for Lunch gang"]');
  await phone.click('.sheet button:text-is("Pin to top")');
  await expect(phone.locator('main li').first()).toContainText('Lunch gang');
  await expect(phone.locator('main li').first().getByRole('img', { name: 'Pinned' })).toBeVisible();

  // Deleting one room goes back home, with the other still there
  await phone.locator('main li button', { hasText: 'Lunch gang' }).click();
  await deleteRoom(phone, false);
  await expect(phone.getByRole('heading', { name: '1 room' })).toBeVisible();
  await phone.locator('main li button', { hasText: 'Housemates' }).click();
  await deleteRoom(phone);
});
