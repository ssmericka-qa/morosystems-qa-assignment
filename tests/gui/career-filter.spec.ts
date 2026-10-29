import type { City } from '../../src/pages/CareerPage';
import { expect, test } from '../../src/fixtures';

const CITIES: City[] = ['Brno', 'Praha', 'Hradec Králové', 'Bratislava', 'home office'];

/**
 * The city filter is checked against the location printed on each card: for every city the
 * expected positions are computed from the full list, so the tests keep working when
 * MoroSystems publishes or closes a position.
 */
test.describe('Kariéra – city filter', () => {
  test.beforeEach(async ({ career }) => {
    await career.open();
    await career.expectLoaded();
    await expect(career.allPositions.first(), 'the page lists open positions').toBeAttached();
  });

  for (const city of CITIES) {
    test(`shows exactly the positions located in ${city}`, async ({ career }) => {
      const expectedCount = await career.expectedCountFor(city);

      await career.filterByCity(city);

      await expect(career.visiblePositions).toHaveCount(expectedCount);
      for (const location of await career.visibleLocations()) {
        expect(location).toContain(city);
      }

      if (expectedCount === 0) {
        test.info().annotations.push({
          type: 'finding',
          description: `UX: "${city}" is offered in the filter but has no positions and the page shows no empty-state message.`,
        });
      }
    });
  }

  test('"Všechna města" restores the full list', async ({ career }) => {
    const total = await career.allPositions.count();
    // Use a city that really narrows the list, otherwise the reset proves nothing.
    const counts = await Promise.all(CITIES.map(async (city) => [city, await career.expectedCountFor(city)] as const));
    const narrowing = counts.find(([, count]) => count > 0 && count < total);
    if (!narrowing) return test.skip(true, 'no city currently narrows the list');
    const [city, count] = narrowing;

    await career.filterByCity(city);
    await expect(career.visiblePositions).toHaveCount(count);

    await career.resetCityFilter();
    await expect(career.visiblePositions).toHaveCount(total);
  });
});
