import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test('leaving a room takes you out of its turns; rejoining brings you back', async ({ browser }) => {
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Leave check');
  try {
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    const upNext = wei.locator('section:has(.section-label:text-is("Up next"))');
    await expect(upNext).toContainText('Alex');

    // Alex leaves from the main menu
    await alex.goto('/');
    await alex.click('button[aria-label="More for Leave check"]');
    await alex.click('.sheet button:text-is("Leave room")');
    await alex.click('.sheet button:has-text("Tap again to leave")');
    await expect(alex.locator('#join-name')).toBeVisible();

    // Wei's room no longer counts Alex: no Alex in the upcoming turns, and Wei is alone again
    await wei.reload();
    await expect(wei.getByText('Share code')).toBeVisible();
    await expect(upNext).not.toContainText('Alex');

    // Alex rejoins with the same name and is back in the turns
    await joinRoom(alex, code, 'Alex');
    await wei.reload();
    await expect(upNext).toContainText('Alex');
  } finally {
    await deleteRoom(wei);
  }
});
