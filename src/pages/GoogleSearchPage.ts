import { expect, type Locator, type Page } from '@playwright/test';
import { gotoDom } from './navigation';

/** Thrown when Google answers with its "unusual traffic" / reCAPTCHA page. */
export class GoogleCaptchaError extends Error {
  constructor(url: string) {
    super(`Google returned a CAPTCHA / "unusual traffic" page (${url}). This is bot protection, not an app defect.`);
  }
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class GoogleSearchPage {
  readonly searchBox: Locator;
  readonly consentAccept: Locator;
  readonly results: Locator;

  constructor(private readonly page: Page) {
    // name="q" has been Google's search field for decades; it is a <textarea> on desktop.
    this.searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
    this.consentAccept = page.getByRole('button', { name: /^(Přijmout vše|Accept all)$/ }).first();
    this.results = page.locator('#search');
  }

  async open(): Promise<void> {
    await gotoDom(this.page, 'https://www.google.com/?hl=cs');
    await this.throwIfCaptcha();
    // New EU sessions get a consent dialog first; whichever appears first decides.
    await expect(this.consentAccept.or(this.searchBox).filter({ visible: true }).first()).toBeVisible();
    if (await this.consentAccept.isVisible()) await this.consentAccept.click();
  }

  async search(term: string): Promise<void> {
    await expect(this.searchBox).toBeVisible();
    await this.searchBox.fill(term);
    await this.searchBox.press('Enter');
    // Wait for the real outcome: either the results page or Google's CAPTCHA page.
    await this.page.waitForURL(/google\.[a-z.]+\/(search|sorry)/);
    await this.throwIfCaptcha();
  }

  async throwIfCaptcha(): Promise<void> {
    const url = this.page.url();
    const captchaShown =
      url.includes('/sorry/') ||
      (await this.page.locator('#captcha-form, iframe[src*="recaptcha"]').count()) > 0;
    if (captchaShown) throw new GoogleCaptchaError(url);
  }

  async expectResultsFor(term: string): Promise<void> {
    await expect(this.page).toHaveURL(/\/search\?/);
    await expect(this.page).toHaveTitle(new RegExp(escapeRegExp(term), 'i'));
    await expect(this.results).toBeVisible();
  }

  /** Organic result identified by its title – hrefs are Google redirect links, titles are stable. */
  resultByTitle(title: string): Locator {
    return this.results.locator('a', { has: this.page.locator('h3', { hasText: title }) }).first();
  }

  async openResult(title: string): Promise<void> {
    await this.resultByTitle(title).click();
  }
}
