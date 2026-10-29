import { expect, type Locator, type Page } from '@playwright/test';
import { gotoDom } from './navigation';

/** Page title of morosystems.cz – also the title of its Google search result. */
export const MORO_TITLE = 'MoroSystems - smysluplná IT řešení a technologické inovace';

export class MoroHomePage {
  readonly burger: Locator;
  readonly mobileCareerLink: Locator;
  readonly aboutMenu: Locator;
  readonly desktopCareerLink: Locator;

  constructor(private readonly page: Page) {
    // aria-label distinguishes the burger from the footer "MENU" toggle with the same text.
    this.burger = page.getByLabel('Menu', { exact: true });
    this.mobileCareerLink = page.locator('a.m-main__link[href$="/kariera/"]');
    // The site has no test ids; the "O nás" menu item is the one whose dropdown links to /kariera/.
    this.desktopCareerLink = page.locator('a.dropdown__link[href$="/kariera/"]');
    this.aboutMenu = page.locator('li.m-main__item', { has: this.desktopCareerLink });
  }

  async open(): Promise<void> {
    await gotoDom(this.page, 'https://www.morosystems.cz/');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/morosystems\.cz/);
    await expect(this.page).toHaveTitle(MORO_TITLE);
  }

  /**
   * Opens "Kariéra" the way a user would: on desktop via the "O nás" dropdown,
   * on mobile via the burger menu.
   */
  async openCareer(): Promise<void> {
    // Wait for the header to render before deciding which navigation the layout offers.
    await expect(this.burger.or(this.aboutMenu).filter({ visible: true }).first()).toBeVisible();

    if (await this.burger.isVisible()) {
      await this.burger.click();
      await this.mobileCareerLink.click();
    } else {
      // The dropdown closes when the pointer leaves it, so hover + click are retried together.
      await expect(async () => {
        await this.aboutMenu.hover();
        await this.desktopCareerLink.click({ timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
    }
    await expect(this.page).toHaveURL(/\/kariera\/?([?#]|$)/);
  }
}
