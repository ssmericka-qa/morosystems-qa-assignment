import { expect, test as base } from '@playwright/test';
import { TodoApi, type Task } from './api/TodoApi';
import { expectTaskShape } from './api/assertions';
import { uniqueText } from './api/testData';
import { CareerPage } from './pages/CareerPage';
import { GoogleSearchPage } from './pages/GoogleSearchPage';
import { MoroHomePage } from './pages/MoroHomePage';

type Fixtures = {
  api: TodoApi;
  /** A fresh task created for the test and deleted afterwards. */
  task: Task;
  google: GoogleSearchPage;
  moroHome: MoroHomePage;
  career: CareerPage;
};

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    // morosystems.cz shows a CookieScript consent dialog with a delay or after interaction.
    // Whenever it covers the page, dismiss it (reject = no tracking cookies) and continue.
    await page.addLocatorHandler(page.locator('#cookiescript_injected'), async (dialog) => {
      await dialog.locator('#cookiescript_reject, #cookiescript_accept').first().click();
    });
    await use(page);
  },

  api: async ({ request }, use) => {
    await use(new TodoApi(request));
  },

  task: async ({ api }, use, testInfo) => {
    const response = await api.createTask({ text: uniqueText(testInfo.title) });
    expect(response.status(), 'fixture could not create a task').toBe(200);
    const task = await response.json();
    expectTaskShape(task);

    await use(task);

    // Clean up even if the test already deleted the task (404 is fine then).
    await api.deleteTask(task.id);
  },

  google: async ({ page }, use) => use(new GoogleSearchPage(page)),
  moroHome: async ({ page }, use) => use(new MoroHomePage(page)),
  career: async ({ page }, use) => use(new CareerPage(page)),
});

export { expect } from '@playwright/test';
