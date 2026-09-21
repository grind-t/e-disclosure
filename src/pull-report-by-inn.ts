import assert from "node:assert";
import os from "node:os";
import { basename, extname, join } from "node:path";

import { chromium } from "patchright";
import { $, fs } from "zx";

const [inn] = process.argv.slice(2);
assert(inn, "Usage: npm run pull:report -- <ИНН>");

type Candidate = {
  typeText: string;
  period: string;
  placementDate: Date;
  placementDateText: string;
  downloadUrl: string;
};

const browser = await chromium.launchPersistentContext(".session", {
  channel: "chrome",
  headless: false,
  viewport: null,
});

const page = browser.pages()[0] ?? (await browser.newPage());

await page.goto("https://www.e-disclosure.ru/poisk-po-kompaniyam");
await page.locator("#textfield").fill(inn);
await page.locator("#sendButton").click();

const companyLink = page.locator('a[href*="company.aspx?id="]').first();
const href = await companyLink.getAttribute("href");
assert(href, `Компания с ИНН ${inn} не найдена`);

const id = new URL(href, page.url()).searchParams.get("id");
assert(id, `Не удалось извлечь id компании из ссылки: ${href}`);
const companyName = (await companyLink.textContent())?.trim() ?? inn;

function parseDate(text: string): Date {
  const [day, month, year] = text.split(".").map(Number);
  return new Date(year, month - 1, day);
}

async function getReportRow(
  reportType: 3 | 4,
  match: (typeText: string) => boolean,
): Promise<Candidate | undefined> {
  await page.goto(`https://www.e-disclosure.ru/portal/files.aspx?id=${id}&type=${reportType}`);
  if (!page.url().includes("files.aspx")) return undefined; // такой категории отчётности у компании нет

  const rows = page.locator("table.files-table tr");

  for (const row of await rows.all()) {
    const cells = await row.locator("td").allTextContents();
    if (cells.length < 6) continue;

    const num = cells[0].trim();
    if (!/^\d+$/.test(num)) continue;

    const typeText = cells[1].trim();
    if (!match(typeText)) continue;

    const period = cells[2].trim();
    const placementDateText = cells[4].trim();
    const downloadUrl = await row.locator("td").nth(5).locator("a").getAttribute("href");
    if (!downloadUrl || !placementDateText) continue;

    return {
      typeText,
      period,
      placementDate: parseDate(placementDateText),
      placementDateText,
      downloadUrl,
    };
  }

  return undefined;
}

// Вкладка "Консолидированная" (type=4) — если есть, там уже только консолидированная МСФО.
const consolidatedBest = await getReportRow(4, () => true);
// Вкладка "Бухгалтерская (финансовая)" (type=3) может содержать МСФО-отчётность
// (консолидированную или индивидуальную) вперемешку с обычной бухгалтерской (РСБУ) —
// берём только строки, где тип документа упоминает МСФО.
const accountingBest = await getReportRow(3, (typeText) => /мсфо/i.test(typeText));

const best = [consolidatedBest, accountingBest]
  .filter((v) => !!v)
  .sort((a, b) => b.placementDate.getTime() - a.placementDate.getTime())
  .at(0);
assert(best, `Консолидированная/МСФО отчетность не найдена для ${companyName} (ИНН ${inn})`);

type Rating = { period: string; value: number; outlook?: string };

const companiesPath = join(import.meta.dirname, "companies.json");
const companies: Record<string, { id: string; ratings: Rating[]; reportType: 3 | 4 }> = JSON.parse(
  await fs.readFile(companiesPath, "utf8"),
);

if (!companies[inn]) {
  companies[inn] = {
    id,
    ratings: [],
    reportType: best === consolidatedBest ? 4 : 3,
  };
}

companies[inn].ratings.push({ period: best.period, value: 0 });

await fs.writeFile(companiesPath, JSON.stringify(companies, null, 2) + "\n");

const file = await page.request.get(best.downloadUrl).then((v) => v.body());
await fs.mkdir("exports", { recursive: true });
const fileName = `exports/${inn} (${best.period}).zip`;
await fs.writeFile(fileName, file);

console.log(
  `Скачано: ${fileName} — ${companyName}\n` +
    `  Тип: ${best.typeText}\n` +
    `  Период: ${best.period}, размещено ${best.placementDateText}`,
);

await browser.close();

const extension = extname(fileName);
if ([".zip", ".rar"].includes(extension)) {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "e-disclosure-"));

  if (extension === ".zip") {
    await $`unzip -o ${fileName} -d ${tmpDir}`;
  } else {
    await $`7z x -o${tmpDir} -y ${fileName}`;
  }

  // Берём только файлы верхнего уровня архива, без содержимого вложенных папок,
  // и называем их так же, как архив (с суффиксом при их количестве больше одного).
  const archiveBaseName = basename(fileName, extension);
  const topLevelFiles = (await fs.readdir(tmpDir, { withFileTypes: true })).filter((entry) =>
    entry.isFile(),
  );

  for (const [index, entry] of topLevelFiles.entries()) {
    const suffix = topLevelFiles.length > 1 ? ` (${index + 1})` : "";
    const newName = `${archiveBaseName}${suffix}${extname(entry.name)}`;
    await fs.copyFile(join(tmpDir, entry.name), join("exports", newName));
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(fileName);
}
