import { chromium } from "patchright";

const browser = await chromium.launchPersistentContext(".session", {
  channel: "chrome",
  headless: false,
  viewport: null,
});

const page = await browser.newPage()

await page.goto('https://www.e-disclosure.ru/')