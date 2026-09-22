import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import type { Locator, Page } from "patchright";

dayjs.extend(customParseFormat);

export type Report = {
  type: string;
  period: string;
  placementDate: Date;
  downloadUrl: string;
};

export class ReportsPage {
  readonly page: Page;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rows = page.locator("table.files-table tr");
  }

  get empty() {
    return !this.page.url().includes("files.aspx");
  }

  goto(companyId: string, reportType: 3 | 4) {
    return this.page.goto(
      `https://www.e-disclosure.ru/portal/files.aspx?id=${companyId}&type=${reportType}`,
    );
  }

  async find(predicate: (report: Report) => boolean): Promise<Report | null> {
    if (this.empty) return null;

    for (const row of await this.rows.all()) {
      const cells = await row.locator("td").allTextContents();
      if (cells.length < 6) continue;

      const num = cells[0].trim();
      if (!/^\d+$/.test(num)) continue;
      const type = cells[1].trim();
      const period = cells[2].trim();
      const placementDateText = cells[4].trim();
      const downloadUrl = await row.locator("td").nth(5).locator("a").getAttribute("href");
      if (!downloadUrl) continue;

      const report = {
        type,
        period,
        placementDate: dayjs(placementDateText, "DD.MM.YYYY").toDate(),
        downloadUrl,
      };

      if (predicate(report)) return report;
    }

    return null;
  }
}
