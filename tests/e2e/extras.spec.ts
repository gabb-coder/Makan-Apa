import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test('live spin, guests, suggestions, a treat and challenges', async ({ browser }) => {
  test.setTimeout(150_000);
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Extras check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    await wei.click('nav >> text=Today');

    // Wei spins the wheel; Alex watches the same spin land
    await wei.click('nav >> text=Wheel');
    await wei.click('button:text-is("SPIN")');
    await expect(alex.getByRole('dialog')).toContainText('Wei is spinning…');
    await expect(alex.getByRole('dialog')).toContainText('it is!', { timeout: 10_000 });
    // It closes on its own a few seconds after landing
    await expect(alex.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    await wei.click('nav >> text=Today');

    // Alex is bringing a friend; Wei sees it
    await alex.click('button[aria-label="One more guest"]');
    await expect(wei.locator('section[aria-labelledby="whos-in"]')).toContainText('1 guest');

    // Whoever's turn it is asks for a suggestion and picks it; the other accepts
    const decider: Page = (await wei.getByText('✨ Suggest something').count()) ? wei : alex;
    const other = decider === wei ? alex : wei;
    await decider.click('text=✨ Suggest something');
    await expect(decider.getByText('How about…')).toBeVisible();
    await expect(decider.locator('section[aria-labelledby="suggest-label"] li').first()).toBeVisible();
    await decider.locator('section[aria-labelledby="suggest-label"] button:has-text("Pick ")').click();
    await other.click('button:has-text("Let\'s go")');
    await expect(wei.getByText("It's decided")).toBeVisible();

    // Wei treats everyone: the guest's line is there, and nobody owes anything
    await wei.click('text=Who paid? Split the bill');
    await expect(wei.locator('.sheet')).toContainText("Alex's guest");
    await wei.fill('input[aria-label="Line 1: price (RM)"]', '12');
    await wei.fill('input[aria-label="Line 2: price (RM)"]', '15');
    await wei.fill('input[aria-label="Line 3: price (RM)"]', '9');
    await wei.click('.sheet label:has-text("I’m treating")');
    await wei.click('.sheet button:text-is("Save bill")');
    await expect(wei.getByText(/Wei|You/).filter({ hasText: 'treated everyone 🎉' })).toBeVisible();
    await wei.click('nav >> text=Bills');
    await expect(wei.locator('main')).toContainText("Everyone's settled up.");

    // This week's challenges and the food passport are in History
    await wei.click('nav >> text=History');
    await expect(wei.getByRole('heading', { name: 'This week’s challenges' })).toBeVisible();
    await expect(wei.getByRole('heading', { name: 'Food passport' })).toBeVisible();
  } finally {
    await deleteRoom(wei);
  }
});

test('polls in chat, events, allergy flags and plan ahead from people', async ({ browser }) => {
  test.setTimeout(150_000);
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Plans check');
  try {
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');

    // A poll in the chat; Alex votes and Wei sees it
    await wei.click('button[aria-label="Chat"]');
    await wei.click('button[aria-label="Start a poll"]');
    await wei.fill('#poll-question', 'Mamak after dinner?');
    await wei.locator('.sheet input').nth(1).fill('Yes');
    await wei.locator('.sheet input').nth(2).fill('No');
    await wei.click('.sheet button:text-is("Post poll")');
    await expect(wei.getByRole('log')).toContainText('Mamak after dinner?');
    await alex.click('button[aria-label^="Chat, 1 new"]');
    await alex.getByRole('log').locator('button:has-text("Yes")').click();
    await expect(wei.getByRole('log')).toContainText('1 vote');
    await wei.click('button[aria-label="Back"]');
    await alex.click('button[aria-label="Back"]');

    // Wei plans an event; Alex says they're going
    await wei.click('text=🎉 Plan an event');
    // The sheet covers the screen, not just the Events card it was opened from
    expect((await wei.locator('.sheet-backdrop').boundingBox())!.height).toBeGreaterThan(600);
    await wei.fill('#event-title', 'Birthday dinner');
    await wei.click('.sheet button:text-is("Plan it")');
    await expect(wei.locator('#event-sheet-title')).toContainText('Birthday dinner');
    await wei.click('.sheet button:text-is("Done")');
    await alex.locator('section[aria-labelledby="events-label"] button', { hasText: 'Birthday dinner' }).click();
    await alex.click('.sheet button:text-is("Going")');
    await expect(alex.locator('.sheet')).toContainText('Going: Wei, You');
    await alex.click('.sheet button:text-is("Done")');
    await expect(wei.locator('section[aria-labelledby="events-label"]')).toContainText('2 going');

    // Plan ahead from the people pop-up
    await wei.click('button[aria-label*=", code "]');
    await wei.click('text=📅 Plan ahead: days you’re away');
    await expect(wei.locator('.sheet button[aria-label*="Lunch: in"]').first()).toBeVisible();
    await wei.keyboard.press('Escape');

    // Alex avoids seafood: a place's menu flags dishes with it
    await alex.goto('/');
    await alex.click('button:text-is("You")');
    await alex.click('button:has-text("Seafood")');
    await expect(alex.locator('button:has-text("Seafood")')).toHaveAttribute('aria-pressed', 'true');
    await wei.reload();
    await wei.click('text=/^See all \\d+$/');
    await wei.locator('.sheet button.row', { hasText: 'Gold Chilli' }).first().click();
    await expect(wei.locator('.sheet')).toContainText('Careful: Alex (seafood)');
  } finally {
    await deleteRoom(wei);
  }
});
