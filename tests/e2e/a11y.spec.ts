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
      await guest.click('button:has-text("Let\\'s go")');
      await expect(host.getByText("It's decided")).toBeVisible();
      await host.waitForTimeout(800);
      await scan(host, 'today');

      for (const route of ['wheel', 'pool', 'history', 'settings']) {
        await host.goto(`/#${route}`);
        await host.waitForTimeout(1200);
        await scan(host, route);
      }
    } finally {
      await deleteRoom(host);
    }
  });
}
