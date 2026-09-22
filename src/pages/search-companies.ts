import type { Locator, Page } from "patchright";

export type Company = {
  id: string;
  name: string;
};

export class SearchCompaniesPage {
  readonly page: Page;
  readonly input: Locator;
  readonly submit: Locator;
  readonly itemLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.input = page.locator("#textfield");
    this.submit = page.locator("#sendButton");
    this.itemLink = page.locator('a[href*="company.aspx?id="]');
  }

  goto() {
    return this.page.goto("https://www.e-disclosure.ru/poisk-po-kompaniyam");
  }

  async findCompanyByInn(inn: string): Promise<Company | null> {
    await this.input.fill(inn);
    await this.submit.click();

    const company = this.itemLink.first();
    const href = await company.getAttribute("href");
    const id = href && new URL(href, this.page.url()).searchParams.get("id");
    const name = (await company.textContent())?.trim() ?? inn;

    return id ? { id, name } : null;
  }
}
