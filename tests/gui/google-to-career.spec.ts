import { expect, test } from '../../src/fixtures';
import { GoogleCaptchaError } from '../../src/pages/GoogleSearchPage';
import { MORO_TITLE } from '../../src/pages/MoroHomePage';
import type { City } from '../../src/pages/CareerPage';

const SEARCH_TERM = 'MoroSystems';
const CITY: City = 'Brno';

/**
 * The assignment scenario, split into two tests:
 * steps 1–5 depend on Google, which often answers automated browsers with a CAPTCHA –
 * then that test is reported as skipped (with the reason), while steps 6–7 still run.
 */
test.describe('Assignment scenario', () => {
  test('steps 1–5: Google search finds MoroSystems and opens its website', async ({ google, moroHome }) => {
    await test.step('1–3. Open Google and search for "MoroSystems"', async () => {
      try {
        await google.open();
        await google.search(SEARCH_TERM);
      } catch (error) {
        test.skip(error instanceof GoogleCaptchaError, String(error));
        throw error;
      }
    });

    await test.step('4. Search results page is displayed', async () => {
      await google.expectResultsFor(SEARCH_TERM);
    });

    await test.step('4a. The MoroSystems website is among the results', async () => {
      await expect(google.resultByTitle(MORO_TITLE)).toBeVisible();
    });

    await test.step('5. Open the MoroSystems website from the results', async () => {
      await google.openResult(MORO_TITLE);
      await moroHome.expectLoaded();
    });
  });

  test('steps 6–7: Kariéra page filters positions by city', async ({ moroHome, career }) => {
    await moroHome.open(); // where step 5 ends
    await moroHome.expectLoaded();

    await test.step('6. Open the "Kariéra" page', async () => {
      await moroHome.openCareer();
      await career.expectLoaded();
    });

    await test.step(`7. Filter by "${CITY}" and validate the results`, async () => {
      const expectedCount = await career.expectedCountFor(CITY);
      expect(expectedCount, `the page lists at least one position in ${CITY}`).toBeGreaterThan(0);

      await career.filterByCity(CITY);

      await expect(career.visiblePositions).toHaveCount(expectedCount);
      for (const location of await career.visibleLocations()) {
        expect(location, 'every visible position is in the selected city').toContain(CITY);
      }
    });
  });
});
