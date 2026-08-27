import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { chromium } from "patchright";

const execFileAsync = promisify(execFile);

const CAPTCHA_URL = "https://www.e-disclosure.ru/";
const CAPTCHA_ROOT_SELECTOR = "#captcha_root";
const CAPTCHA_IMAGE_SELECTOR = ".captcha-img img";
const CAPTCHA_TRACK_SELECTOR = ".captcha-control";
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
  return angle;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(CAPTCHA_URL, { waitUntil: "domcontentloaded" });

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
    await captchaImage.screenshot({ path: capturedImagePath });
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

    // A couple of correction passes compensate for any rounding the widget's
    // own angle-from-position math applies, since it isn't perfectly linear
    // at the edges.
    let targetX = trackBox.x + handleBox.width / 2 + (angle / 360) * travel;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.mouse.move(targetX, startY, { steps: 10 });
      await page.waitForTimeout(100);

      const currentAngle = await captchaImage.evaluate((img) => {
        const match = /rotate\((-?\d+(?:\.\d+)?)deg\)/.exec((img as HTMLElement).style.transform);
        return match ? Number.parseFloat(match[1]) : 0;
      });

      const diff = angle - currentAngle;
      if (Math.abs(diff) < 0.5) break;
      targetX += (diff / 360) * travel;
    }

    await page.mouse.up();
    await page.waitForTimeout(200);

    const rotatedPath = join(workDir, "captcha-rotated.png");
    await captchaImage.screenshot({ path: rotatedPath });
    console.log(`Rotated captcha screenshot saved to ${rotatedPath}`);
  } finally {
    await browser.close();
  }
}

await main();
