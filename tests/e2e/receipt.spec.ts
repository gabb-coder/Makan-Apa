import { expect, test } from '@playwright/test';
import { createRoom, deleteRoom, newPhone } from './helpers';

const RECEIPT = `
     RESTORAN PELITA SUNWAY
   Jalan PJS 11/28, Bandar Sunway
Inv No: 0012345   05/11/2026 12:41
--------------------------------
QTY ITEM                  AMOUNT
1   Nasi Lemak Ayam        12.50
2   Teh Tarik Ais           7.00
1   Roti Canai Telur        3.50
--------------------------------
Sub Total                  23.00
Service Charge 10%          2.30
SST 6%                      1.52
TOTAL                      26.80
Cash                       50.00
Change                     23.20`;

test('scanning a receipt fills in the bill', async ({ browser }) => {
  test.setTimeout(150_000);
  const wei = await newPhone(browser);
  await createRoom(wei, 'Wei', 'Receipt check');
  try {
    await wei.click('nav >> text=Food list');
    await wei.click('text=Load starter pack');
    await expect(wei.locator('button.row', { hasText: 'Nasi Lemak' })).toBeVisible();
    await wei.click('nav >> text=Today');
    await wei.click('button:text-is("Pick from list")');
    await wei.locator('.sheet button.row', { hasText: 'Nasi Lemak' }).first().click();
    await wei.click('text=Who paid? Split the bill');

    // A photo of a printed receipt
    const camera = await browser.newPage({ deviceScaleFactor: 2 });
    await camera.setContent(`<pre id="r" style="font:16px 'Courier New',monospace;padding:24px;width:360px;line-height:1.35;color:#111;background:#fff;margin:0">${RECEIPT}</pre>`);
    const photo = await camera.locator('#r').screenshot();
    await camera.close();
    await wei.getByTestId('scan-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: photo });

    await expect(wei.getByText('Found 4 items. Check them, then tick who had each one.')).toBeVisible({ timeout: 90_000 });
    await expect(wei.locator('input[aria-label="Line 1: item"]')).toHaveValue('Nasi Lemak Ayam');
    await expect(wei.locator('input[aria-label="Line 1: price (RM)"]')).toHaveValue('12.50');
    // Two teh tarik become two lines, so two people can have one each
    await expect(wei.locator('input[aria-label="Line 2: item"]')).toHaveValue('Teh Tarik Ais');
    await expect(wei.locator('input[aria-label="Line 3: price (RM)"]')).toHaveValue('3.50');
    await expect(wei.locator('#bill-service')).toHaveValue('10');
    await expect(wei.locator('#bill-sst')).toHaveValue('6');
    // Nobody's ticked yet, so it can't be saved until each line has someone
    await expect(wei.getByText('Line 1: tick who had it.')).toBeVisible();
    for (let n = 1; n <= 4; n++) await wei.locator(`[aria-label="Line ${n}: who had it"] button:text-is("You")`).click();
    await expect(wei.getByTestId('bill-total')).toHaveText('RM26.82');
    await wei.click('.sheet button:text-is("Save bill")');
    await expect(wei.getByText(/You paid RM26\.82/)).toBeVisible();
  } finally {
    await deleteRoom(wei);
  }
});
