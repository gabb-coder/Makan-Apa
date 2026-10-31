import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test('a room code alone is not enough to become someone else', async ({ browser }) => {
  const gabriel = await newPhone(browser);
  const code = await createRoom(gabriel, 'Gabriel');
  try {
    // Gabriel sets a PIN
    await gabriel.goto('/#settings');
    await gabriel.click('button:text-is("Set PIN")');
    await gabriel.fill('#my-pin', '2468');
    await gabriel.click('button:text-is("Save")');
    await expect(gabriel.getByText('Set. Joining as Gabriel on another phone needs it.')).toBeVisible();

    // Someone else with the code tries to join as Gabriel
    const intruder = await newPhone(browser);
    await intruder.goto(`/?join=${code}`);
    await intruder.fill('#join-name', 'gabriel');
    await intruder.click('button:text-is("Join room")');
    await expect(intruder.getByText("Gabriel is already in this room. If that's you, enter your PIN")).toBeVisible();
    await intruder.fill('#join-pin', '1111');
    await intruder.click('button:text-is("Join room")');
    await expect(intruder.getByText("That PIN isn't right. 4 tries left")).toBeVisible();
    await expect(intruder.locator('nav')).toHaveCount(0);

    // Gabriel on a new phone, with the PIN
    const gabrielsNewPhone = await newPhone(browser);
    await gabrielsNewPhone.goto(`/?join=${code}`);
    await gabrielsNewPhone.fill('#join-name', 'Gabriel');
    await gabrielsNewPhone.click('button:text-is("Join room")');
    await gabrielsNewPhone.fill('#join-pin', '2468');
    await gabrielsNewPhone.click('button:text-is("Join room")');
    await expect(gabrielsNewPhone.locator('nav')).toBeVisible();

    // Alex has no PIN; a second phone can't take the name while Alex is using it
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    const notAlex = await newPhone(browser);
    await notAlex.goto(`/?join=${code}`);
    await notAlex.fill('#join-name', 'Alex');
    await notAlex.click('button:text-is("Join room")');
    await expect(notAlex.getByText('Alex is already using this name on another phone.')).toBeVisible();

    // The host lets Alex back in (say Alex lost that phone)
    await gabriel.goto('/#settings');
    await gabriel.click('button[aria-label="Edit Alex"]');
    await gabriel.click('button:text-is("Let Alex rejoin on a new phone")');
    await expect(gabriel.getByText('Alex can rejoin on a new phone for the next 15 minutes.')).toBeVisible();
    await notAlex.click('button:text-is("Join room")');
    await expect(notAlex.locator('nav')).toBeVisible();
  } finally {
    await deleteRoom(gabriel);
  }
});
