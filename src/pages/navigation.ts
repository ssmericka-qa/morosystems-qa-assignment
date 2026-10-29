import type { Page } from '@playwright/test';

/**
 * Navigates and waits only for the DOM. The live sites load third-party trackers and videos
 * that can delay the `load` event by tens of seconds; assertions wait for the elements instead.
 */
export async function gotoDom(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
