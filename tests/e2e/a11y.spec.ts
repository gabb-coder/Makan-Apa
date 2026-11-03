import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRoom, joinRoom, newPhone } from './helpers';

const scan = async (page: Page, where: string) => {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const problems = result.violations.map((v) => `${where}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  expect(problems).toEqual([]);
};

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every screen passes an accessibility scan (${colorScheme})`, async ({ browser }) => {
    const host = await browser.newContext({ colorScheme }).then((c) => c.newPage());
    await host.goto('/');
    await scan(host, 'join');
    const code = await createRoom(host, 'Wei', 'A11y check');
    try {
      await host.click('nav >> text=Food list');
      await host.click('text=Load starter pack');
      await expect(host.locator('button.row', { hasText: 'Mamak' })).toBeVisible();
      const guest = await newPhone(browser);
      await joinRoom(guest, code, 'Alex');

      // Decide today, so the decided card (rating, bill, nearby) is on screen.
      await host.click('nav >> text=Today');
      await host.click('text=Pick from list');
      await scan(host, 'pick sheet');
      await host.click('.sheet button.row:has-text("Nasi Lemak")');
      await guest.click('button:has-text("Let\'s go")');
      await expect(host.getByText("It's decided")).toBeVisible();
      await host.waitForTimeout(800);
      await scan(host, 'today');

      // A chat message, the kitty and a budget, so their screens and cards get scanned too.
      await guest.click('button[aria-label="Chat"]');
      await guest.fill('#chat-input', 'On my way');
      await guest.click('button[aria-label="Send"]');
      await host.goto('/#settings');
      await host.selectOption('#kitty-keeper', { label: 'Wei (you)' });
      await host.evaluate(() => localStorage.setItem('makan.monthlyBudget', '30000'));

      for (const route of ['wheel', 'pool', 'bills', 'history', 'settings', 'chat']) {
        await host.goto(`/#${route}`);
        await host.waitForTimeout(1200);
        await scan(host, route);
      }

      // The home screen with every room, then back into the room
      await host.goto('/');
      await expect(host.locator('main li button').first()).toBeVisible();
      await host.waitForTimeout(1200);
      await scan(host, 'home');
      await host.click('button:text-is("You")');
      await expect(host.getByRole('heading', { name: 'You & this phone' })).toBeVisible();
      await expect(host.getByText('Add your DuitNow or bank account so kaki can pay you back.')).toBeVisible();
      await host.waitForTimeout(500);
      await scan(host, 'profile');
      await host.click('button[aria-label="Your rooms"]');
      await host.locator('main li button').first().click();
      await expect(host.locator('nav')).toBeVisible();
    } finally {
      await deleteRoom(host);
    }
  });
}
