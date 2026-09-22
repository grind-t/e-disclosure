import { parse } from "content-disposition";
import type { Page } from "patchright";

import { ReportsPage } from "./pages/reports.ts";
import { SearchCompaniesPage } from "./pages/search-companies.ts";

export type MsfoReport = {
  companyId: string;
  type: 3 | 4;
  period: string;
  fileName: string;
  body: Buffer<ArrayBufferLike>;
};

export async function getLatestMsfoReport(page: Page, inn: string): Promise<MsfoReport | null> {
  const searchCompaniesPage = new SearchCompaniesPage(page);
  await searchCompaniesPage.goto();
  const company = await searchCompaniesPage.findCompanyByInn(inn);

  if (!company) return null;

  const reportsPage = new ReportsPage(page);
  // Вкладка "Консолидированная" (type=4) — если есть, там уже только консолидированная МСФО.
  await reportsPage.goto(company.id, 4);
  const consolidatedLatest = await reportsPage.find(() => true);
  // Вкладка "Бухгалтерская (финансовая)" (type=3) может содержать МСФО-отчётность
  // (консолидированную или индивидуальную) вперемешку с обычной бухгалтерской (РСБУ) —
  // берём только строки, где тип документа упоминает МСФО.
  await reportsPage.goto(company.id, 3);
  const accountingLatest = await reportsPage.find((report) => /мсфо/i.test(report.type));
  const report = [consolidatedLatest, accountingLatest]
    .filter((v) => !!v)
    .sort((a, b) => b.placementDate.getTime() - a.placementDate.getTime())
    .at(0);

  if (!report) return null;

  const response = await page.request.get(report.downloadUrl);
  const body = await response.body();
  const disposition = response.headers()["content-disposition"];
  const fileName = parse(disposition).parameters.filename;

  return report
    ? {
        companyId: company.id,
        type: report === accountingLatest ? 3 : 4,
        period: report.period,
        fileName,
        body,
      }
    : null;
}
