import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

test('two phones: propose, veto, re-pick, accept, and it shows in History', async ({ browser }) => {
  const gabriel = await newPhone(browser);
  const alex = await newPhone(browser);
  const code = await createRoom(gabriel, 'Gabriel', 'Sunway lunch gang');
  await expect(gabriel.locator('header .eyebrow')).toContainText('Sunway lunch gang');

  try {
    // Food list
    await gabriel.click('nav >> text=Food list');
    await gabriel.click('text=Load starter pack');
    await expect(gabriel.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
    await gabriel.click('nav >> text=Today');

    // Alex joins with the invite link; Gabriel decides today
    await joinRoom(alex, code, 'Alex');
    await expect(alex.getByText('is choosing')).toBeVisible();
    await expect(alex.locator('header .eyebrow')).toContainText('Sunway lunch gang');
    await expect(gabriel.getByText('Alex can veto once')).toBeVisible();

    // Gabriel picks Pizza; Alex vetoes it
    await gabriel.click('text=Pick from list');
    await gabriel.click('.sheet button.row:has-text("Pizza")');
    await expect(gabriel.getByText('Sent to Alex')).toBeVisible();
    await expect(alex.getByText('Good with this?')).toBeVisible();
    await alex.click('button:has-text("Veto · 1 left today")');
    await expect(alex.getByText('Back to Gabriel')).toBeVisible();
    await expect(gabriel.getByText('Alex vetoed Pizza. Pick again.')).toBeVisible();

    // Pizza is off the wheel; Gabriel spins and sends the result
    await gabriel.click('text=Spin the wheel');
    await expect(gabriel.locator('svg[role=img]')).not.toHaveAttribute('aria-label', /Pizza/);
    await gabriel.click('button:text-is("SPIN")');
    await expect(gabriel.getByText('The wheel says')).toBeVisible();
    await gabriel.click('button:text-is("Send to Alex")');

    // Alex has no vetoes left and accepts
    await expect(alex.getByText('Good with this?')).toBeVisible();
    await expect(alex.locator('button:has-text("Veto")')).toHaveCount(0);
    await alex.click('button:has-text("Let\'s go")');
    await expect(alex.getByText("It's decided")).toBeVisible();
    await expect(gabriel.getByText("It's decided")).toBeVisible();

    // History
    await gabriel.click('nav >> text=History');
    await expect(gabriel.getByText('Most eaten')).toBeVisible();
    await expect(gabriel.locator('.row')).toHaveCount(1);

    // Export the history as a spreadsheet
    const [xlsx] = await Promise.all([gabriel.waitForEvent('download'), gabriel.click('button:text-is("Excel (.xlsx)")')]);
    expect(xlsx.suggestedFilename()).toMatch(/^makan-apa-sunway-lunch-gang-history-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [csvFile] = await Promise.all([gabriel.waitForEvent('download'), gabriel.click('button:text-is("CSV")')]);
    const csv = readFileSync(await csvFile.path(), 'utf8');
    expect(csv).toContain('Date,Day,Meal,Food / place,Area,Chosen by,How,Suggested by,Vetoed (by),Tags');
    expect(csv).toMatch(/,Gabriel,Spun the wheel,,Pizza \(Alex\),/);
    if (process.env.EXPORT_DIR) {
      await xlsx.saveAs(`${process.env.EXPORT_DIR}/${xlsx.suggestedFilename()}`);
      await csvFile.saveAs(`${process.env.EXPORT_DIR}/${csvFile.suggestedFilename()}`);
    }
  } finally {
    await deleteRoom(gabriel);
  }
});
