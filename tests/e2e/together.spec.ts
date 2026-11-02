import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test("who's in, and a tapau run that becomes the bill", async ({ browser }) => {
  const wei = await newPhone(browser);
  const code = await createRoom(wei, 'Wei', 'Tapau check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Nasi Lemak' })).toBeVisible();
    const alex = await newPhone(browser);
    await joinRoom(alex, code, 'Alex');
    await wei.click('nav >> text=Today');

    // Wei's turn today; Wei says they're out, so it passes to Alex, and back when Wei's in again
    await expect(wei.getByText('Your turn!')).toBeVisible();
    await wei.click("button:text-is(\"I'm out\")");
    await expect(alex.getByText('Your turn!')).toBeVisible();
    await expect(alex.getByText('Wei is out')).toBeVisible();
    await wei.click("button:text-is(\"I'm in\")");
    await expect(wei.getByText('Your turn!')).toBeVisible();

    // Alex is out: with nobody else in, Wei's pick is final
    await alex.click("button:text-is(\"I'm out\")");
    await expect(wei.getByText('Alex is out')).toBeVisible();
    await wei.click('text=Pick from list');
    await wei.click('.sheet button.row:has-text("Nasi Lemak")');
    await expect(wei.getByText("It's decided")).toBeVisible();

    // Wei starts a tapau run and adds an order; Alex changes their mind and adds one too
    await wei.click('text=/Take everyone/');
    await wei.fill('#tapau-place', 'Lai Kong');
    await wei.click('button:has-text("Start the run")');
    await wei.fill('input[aria-label="What do you want?"]', 'Teh tarik');
    await wei.selectOption('select[aria-label="How many"]', '2');
    await wei.fill('input[aria-label="Price each (RM), if you know it"]', '2.50');
    await wei.click('.sheet button:text-is("Add order")');
    await expect(wei.locator('.sheet')).toContainText('2× Teh tarik');

    await alex.click("button:text-is(\"I'm in\")");
    await alex.click('text=/Wei is buying from Lai Kong/');
    await alex.fill('input[aria-label="What do you want?"]', 'Nasi lemak ayam');
    await alex.fill('input[aria-label="Price each (RM), if you know it"]', '8');
    await alex.click('.sheet button:text-is("Add order")');
    await expect(alex.locator('.sheet')).toContainText('Nasi lemak ayam');

    // Back with the food: the orders become the bill
    await expect(wei.locator('.sheet')).toContainText('2 orders');
    await wei.click('button:has-text("Make the bill")');
    await expect(wei.getByTestId('bill-total')).toHaveText('RM13.00');
    await wei.click('.sheet button:text-is("Save bill")');
    await expect(wei.getByText('You paid RM13.00 · split 2 ways · Edit')).toBeVisible();

    // Alex pays back from the home screen's money card
    await alex.goto('/');
    const money = alex.locator('section[aria-labelledby="money-label"]');
    await expect(money).toContainText('You owe RM8.00');
    await money.locator('button[aria-expanded]').click();
    await expect(money).toContainText('You owe Wei RM8.00');
    await money.locator('button:text-is("Mark paid")').click();
    await expect(money).toBeHidden();
  } finally {
    await deleteRoom(wei);
  }
});
