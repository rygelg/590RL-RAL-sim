// Verifies the Reset to default button:
//   1. is rendered, disabled, on initial load
//   2. enables after clicking a scenario
//   3. restores α=0, AMIP, vanilla, real-arena when clicked
//   4. then disables itself again

import { chromium } from "playwright";

const URL = process.env.URL || "http://127.0.0.1:3100/";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1800 } });
const page = await ctx.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

async function snap(label) {
  const data = await page.evaluate(() => {
    const resetBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Reset to default",
    );
    const alphaSlider = document.querySelector('input[type="range"]');
    // The currently-active scenario card has aria-pressed="true".
    const activeBtn = document.querySelector('button[aria-pressed="true"]');
    return {
      resetBtnPresent: !!resetBtn,
      resetBtnDisabled: resetBtn?.disabled ?? null,
      resetBtnTitle: resetBtn?.title ?? null,
      alpha: alphaSlider ? Number(alphaSlider.value) : null,
      activeScenario: activeBtn?.textContent?.match(/0\d · [^·]+/)?.[0] ?? null,
    };
  });
  console.log(`[${label}] ${JSON.stringify(data)}`);
  return data;
}

await snap("initial load");

// Click scenario 02 Cascade (drives state away from default).
await page.locator('button:has-text("02 · Cascade")').first().click();
await page.waitForTimeout(900);
await snap("after click 02 · Cascade");

// Click reset.
await page.locator('button:has-text("Reset to default")').first().click();
await page.waitForTimeout(900);
await snap("after click Reset");

// Click another scenario, verify reset re-enables.
await page.locator('button:has-text("01 · Min flip")').first().click();
await page.waitForTimeout(900);
await snap("after click 01 · Min flip");

await page.locator('button:has-text("Reset to default")').first().click();
await page.waitForTimeout(900);
await snap("after second Reset");

if (errs.length) {
  console.log("\n--- console/page errors ---");
  for (const e of errs) console.log(e);
}
await browser.close();
