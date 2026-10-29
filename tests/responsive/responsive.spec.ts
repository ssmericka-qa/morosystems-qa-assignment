import type { Page } from '@playwright/test';
import { expect, test } from '../../src/fixtures';

/** No element may make the page wider than the viewport (no horizontal scrolling). */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        ),
      { message: 'page must not be wider than the viewport' },
    )
    .toBeLessThanOrEqual(0);
}

test.describe('Responsive layout', () => {
  test('homepage fits the viewport and navigation reaches "Kariéra"', async ({ page, moroHome, career }) => {
    await moroHome.open();
    await moroHome.expectLoaded();
    await expectNoHorizontalOverflow(page);

    await moroHome.openCareer();
    await career.expectLoaded();
  });

  test('"Kariéra" page fits the viewport and the city filter works', async ({ page, career }) => {
    await career.open();
    await career.expectLoaded();
    await expectNoHorizontalOverflow(page);

    const expectedCount = await career.expectedCountFor('Brno');
    // Without positions the layout checks below would pass on an empty list.
    expect(expectedCount, 'Brno has open positions to check the layout on').toBeGreaterThan(0);
    await career.filterByCity('Brno');
    await expect(career.visiblePositions).toHaveCount(expectedCount);

    const viewportWidth = page.viewportSize()?.width ?? 0;
    for (const position of await career.visiblePositions.all()) {
      const box = await position.boundingBox();
      if (!box) throw new Error('visible position has no layout box');
      expect(box.x, 'position is not cut off on the left').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'position is not cut off on the right').toBeLessThanOrEqual(viewportWidth + 1);
    }
  });
});
