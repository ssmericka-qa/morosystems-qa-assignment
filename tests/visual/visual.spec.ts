import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from '../../src/fixtures';

/**
 * Visual regression of the intro block (header + hero) of two pages against committed baselines.
 * It runs against the live site, so it is a demonstration: an intentional redesign means
 * updating the baselines with `npm run test:visual:update`.
 */

const HIDE_OVERLAYS = fileURLToPath(new URL('./hide-overlays.css', import.meta.url));

/**
 * Waits for fonts and images inside the compared block. `document.fonts.ready` alone is not
 * enough: it resolves before a web font has even started to load, and the screenshot then shows
 * the fallback font (seen in CI) – so every font face of the page is loaded explicitly.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((font) => font.load().catch(() => undefined)));
    await document.fonts.ready;
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.b-intro img')].every((img) => img.complete),
  );
}

test.describe('Visual regression', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('homepage – intro block', async ({ page, moroHome }) => {
    await moroHome.open();
    await settle(page);

    await expect(page.locator('.b-intro').first()).toHaveScreenshot('homepage-intro.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.005,
      stylePath: HIDE_OVERLAYS,
    });
  });

  test('"Kariéra" – intro block', async ({ page, career }) => {
    await career.open();
    await settle(page);

    await expect(page.locator('.b-intro').first()).toHaveScreenshot('career-intro.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.005,
      stylePath: HIDE_OVERLAYS,
    });
  });
});
