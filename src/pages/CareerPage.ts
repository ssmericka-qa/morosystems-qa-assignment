import { expect, type Locator, type Page } from '@playwright/test';
import { gotoDom } from './navigation';

/** Locations offered by the "Všechna města" select box (cities and remote work). */
export type City = 'Brno' | 'Praha' | 'Hradec Králové' | 'Bratislava' | 'home office';

export class CareerPage {
  readonly heading: Locator;
  readonly positionsSection: Locator;
  readonly citySelect: Locator;
  readonly allPositions: Locator;
  readonly visiblePositions: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Koho hledáme' });
    this.positionsSection = page.locator('#pozice');
    // Custom select box (the site has no native <select> and no test ids).
    this.citySelect = this.positionsSection.locator('a.inp-custom-select__select');
    this.allPositions = this.positionsSection.locator('li.js-filter__item');
    this.visiblePositions = this.allPositions.filter({ visible: true });
  }

  async open(): Promise<void> {
    await gotoDom(this.page, 'https://www.morosystems.cz/kariera/');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveTitle(/Kariéra/);
    await expect(this.heading).toBeVisible();
  }

  async filterByCity(city: City): Promise<void> {
    await this.chooseOption(city);
    await expect(this.citySelect).toHaveText(city);
  }

  async resetCityFilter(): Promise<void> {
    await this.chooseOption(''); // data-filter="" is the "Všechna města" option
    await expect(this.citySelect).toHaveText('Všechna města');
  }

  /**
   * Opens the custom select and clicks an option. Retried as a whole, because the cookie
   * dialog can pop up in between and closing it also closes the dropdown.
   */
  private async chooseOption(dataFilter: string): Promise<void> {
    const option = this.positionsSection.locator(`label.js-filter__link[data-filter="${dataFilter}"]`);
    await this.heading.scrollIntoViewIfNeeded();
    await expect(async () => {
      if (!(await option.isVisible())) await this.citySelect.click();
      await option.click({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }

  /**
   * Location text printed on every position card, e.g. "Brno, Hradec Králové".
   * Read from what the user sees, not from the data attribute the filter itself uses.
   */
  async allLocations(): Promise<string[]> {
    return this.allPositions.locator('.c-positions__info').evaluateAll((infos) =>
      infos.map((info) => info.textContent?.trim() ?? ''),
    );
  }

  async visibleLocations(): Promise<string[]> {
    return this.visiblePositions.locator('.c-positions__info').allInnerTexts();
  }

  /** How many positions the filter should show for a city, computed from the full list. */
  async expectedCountFor(city: City): Promise<number> {
    return (await this.allLocations()).filter((location) => location.includes(city)).length;
  }
}
