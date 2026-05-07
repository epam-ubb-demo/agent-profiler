import { resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

test('landing pane renders with "Agent Profiler" text', async () => {
  const appPath = resolve(__dirname, '../out/main/index.js');

  const electronApp = await electron.launch({
    args: [appPath],
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  const title = window.locator('text=Agent Profiler');
  await expect(title).toBeVisible({ timeout: 10_000 });

  await electronApp.close();
});
