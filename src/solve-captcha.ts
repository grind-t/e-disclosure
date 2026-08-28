import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { chromium, type Locator, type Page } from "patchright";

const execFileAsync = promisify(execFile);

const CAPTCHA_URL = "https://www.e-disclosure.ru/";
const CAPTCHA_ROOT_SELECTOR = "#captcha_root";
const CAPTCHA_IMAGE_SELECTOR = ".captcha-img img";
const CAPTCHA_TRACK_SELECTOR = ".captcha-control-wrap";
const CAPTCHA_HANDLE_SELECTOR = ".captcha-control-button";

async function detectRotationAngle(imagePath: string): Promise<number> {
  const { stdout, stderr } = await execFileAsync("uv", [
    "run",
    "scripts/detect_rotation_angle.py",
    imagePath,
  ]);
  if (stderr.trim()) {
    throw new Error(`detect_rotation_angle.py stderr: ${stderr.trim()}`);
  }
  const angle = Number.parseInt(stdout.trim());
  if (Number.isNaN(angle)) {
    throw new Error(`detect_rotation_angle.py returned a non-numeric angle: ${stdout.trim()}`);
  }
  return 360 - angle;
}

async function screenshotSquareElement(page: Page, locator: Locator, path: string): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not measure the captcha image element for screenshotting.");
  }
  const side = Math.floor(Math.min(box.width, box.height));
  await page.screenshot({ path, clip: { x: box.x, y: box.y, width: side, height: side } });
}

async function main(): Promise<void> {
  const browser = await chromium.launchPersistentContext("./user-data", {
    channel: "chrome",
    headless: false,
    viewport: null,
  });

  try {
    const page = await browser.newPage();
    await page.goto(CAPTCHA_URL, { waitUntil: "domcontentloaded" });

    /*

    const captchaRoot = page.locator(CAPTCHA_ROOT_SELECTOR);
    try {
      await captchaRoot.waitFor({ state: "visible", timeout: 30_000 });
    } catch (cause) {
      const debugDir = await mkdtemp(join(tmpdir(), "e-disclosure-captcha-debug-"));
      const debugPath = join(debugDir, "page.png");
      await page.screenshot({ path: debugPath, fullPage: true });
      throw new Error(
        `Captcha (${CAPTCHA_ROOT_SELECTOR}) did not appear. Debug screenshot saved to ${debugPath}`,
        { cause },
      );
    }

    const workDir = await mkdtemp(join(tmpdir(), "e-disclosure-captcha-"));
    const capturedImagePath = join(workDir, "captcha.png");

    const captchaImage = page.locator(CAPTCHA_IMAGE_SELECTOR);
    await screenshotSquareElement(page, captchaImage, capturedImagePath);
    console.log(`Captcha image saved to ${capturedImagePath}`);

    const angle = await detectRotationAngle(capturedImagePath);
    console.log(`Detected rotation angle: ${angle}`);

    const track = page.locator(CAPTCHA_TRACK_SELECTOR);
    const handle = page.locator(CAPTCHA_HANDLE_SELECTOR);
    const trackBox = await track.boundingBox();
    const handleBox = await handle.boundingBox();
    if (!trackBox || !handleBox) {
      throw new Error("Could not measure the captcha rotation control on the page.");
    }

    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const travel = trackBox.width - handleBox.width;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    let targetX = startX + (angle / 360) * travel;
    await page.mouse.move(targetX, startY);

    await page.mouse.up();
    await page.waitForTimeout(5000);

    const rotatedPath = join(workDir, "captcha-rotated.png");
    await screenshotSquareElement(page, captchaImage, rotatedPath);
    console.log(`Rotated captcha screenshot saved to ${rotatedPath}`);*/
  } finally {
    //await browser.close();
  }
}

await main();
