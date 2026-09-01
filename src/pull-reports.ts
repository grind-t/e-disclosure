import assert from "node:assert";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { json } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import { setTimeout } from "node:timers/promises";

import { chromium } from "patchright";

const rl = createInterface({ input: stdin, output: stdout });

const browser = await chromium.launchPersistentContext(".session", {
  channel: "chrome",
  headless: false,
  viewport: null,
});

const page = browser.pages()[0];

await page.goto("https://www.e-disclosure.ru/");

const companies = (await pipeline(createReadStream("src/companies.json"), json)) as any[];

await rl.question("Continue?");

for (const [inn, company] of Object.entries(companies)) {
  const { id, ratings, reportType } = company;
  const reportsUrl = `https://www.e-disclosure.ru/portal/files.aspx?id=${id}&type=${reportType}`;
  await page.goto(reportsUrl);
  const reportRow = page.locator("table").locator("tr").nth(1);
  const reportCell = reportRow.locator("td");
  const reportPeriod = await reportCell.nth(2).textContent();
  const lastRating = ratings.at(-1);

  if (reportPeriod !== lastRating.period) {
    const downloadUrl = await reportCell.nth(5).locator("a").getAttribute("href");
    assert(downloadUrl);
    const file = await page.request.get(downloadUrl).then((v) => v.body());
    await writeFile(`exports/${inn} (${reportPeriod}).zip`, file);
  }

  await setTimeout(500);
}
