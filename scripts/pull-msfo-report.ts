import assert from "assert";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { exit } from "node:process";

import { chromium } from "patchright";
import { $, fs } from "zx";

import { getLatestMsfoReport, type MsfoReport } from "../src/get-latest-msfo-report.ts";

const EXPORTS_DIR = join(import.meta.dirname, "..", "exports");

const [inn] = process.argv.slice(2);
assert(inn, "Usage: npm run pull:report -- <ИНН>");

const browser = await chromium.launchPersistentContext(".session", {
  channel: "chrome",
  headless: false,
  viewport: null,
});
const page = browser.pages()[0] ?? (await browser.newPage());

const report = await getLatestMsfoReport(page, inn);

if (!report) {
  console.log("Отчет не найден");
  exit(0);
}

void browser.close();
void exportReport(report);
void updateCompany(report);

async function exportReport(report: MsfoReport) {
  const tmpDir = await fs.mkdtemp(join(tmpdir(), "e-disclosure-"));
  const extractDir = join(tmpDir, "extracted");
  const sourceExtension = extname(report.fileName);
  const sourceFilePath = join(tmpDir, report.fileName);
  await fs.writeFile(sourceFilePath, report.body);

  if (sourceExtension === ".zip") {
    await $`unzip -o ${sourceFilePath} -d ${extractDir}`;
  } else if (sourceExtension === ".rar") {
    await $`7z x -o${extractDir} -y ${sourceFilePath}`;
  } else {
    await fs.mkdir(extractDir);
    await fs.copy(sourceFilePath, join(extractDir, report.fileName));
  }

  const topLevelFiles = (await fs.readdir(extractDir, { withFileTypes: true })).filter((entry) =>
    entry.isFile(),
  );

  for (const [index, entry] of topLevelFiles.entries()) {
    const suffix = topLevelFiles.length > 1 ? ` (${index + 1})` : "";
    const newName = `${inn} (${report.period})${suffix}${extname(entry.name)}`;
    await fs.copy(join(extractDir, entry.name), join(EXPORTS_DIR, newName));
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
}

async function updateCompany(report: MsfoReport) {
  const companiesPath = join(EXPORTS_DIR, "companies.json");
  const companies = await fs.readJSON(companiesPath);

  if (!companies[inn]) {
    companies[inn] = {
      id: report.companyId,
      ratings: [],
      reportType: report.type,
    };
  }

  companies[inn].ratings.push({ period: report.period, value: 0, outlook: "" });

  await fs.writeJSON(companiesPath, companies, { spaces: 2 });
}
