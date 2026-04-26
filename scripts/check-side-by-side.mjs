// Verifies the playground's xl+ layout: at ≥1280px, the levers and the
// live readout sit side-by-side, and the readout stays in view while the
// user interacts with the levers (no scrolling required).
//
// Requires: `npm i -D playwright` and a local prod server on $URL.
//
// Run: node scripts/check-side-by-side.mjs [http://localhost:3200]

import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3200";

async function check(label, viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });

  // Scroll the playground header into view.
  await page.locator("#playground").scrollIntoViewIfNeeded();
  // Wait for the live readout to render.
  await page.locator("text=Live readout").first().waitFor();

  // Find the lever section ("Your four levers") and the live readout.
  const leversBox = await page
    .locator("text=Your four levers")
    .first()
    .boundingBox();
  const readoutBox = await page
    .locator("text=Live readout")
    .first()
    .boundingBox();
  // Find the leaderboard root (the "Robustness-Aware Leaderboard" panel).
  const leaderboardBox = await page
    .locator("text=Robustness-Aware Leaderboard")
    .first()
    .boundingBox();

  if (!leversBox || !readoutBox || !leaderboardBox) {
    console.log(`[${label}] could not find one of the panels`);
    await browser.close();
    return;
  }

  // Side-by-side iff readout's left edge is to the right of levers' left edge
  // by a meaningful margin (i.e. not stacked).
  const sideBySide = readoutBox.x > leversBox.x + 150;
  console.log(
    `[${label}] viewport=${viewport.width}x${viewport.height} ` +
      `levers.x=${Math.round(leversBox.x)} readout.x=${Math.round(readoutBox.x)} ` +
      `→ side-by-side: ${sideBySide ? "YES" : "no"}`,
  );

  // Sanity: at xl+ the readout should be sticky to the top of viewport when
  // we scroll the controls past it. Scroll within the page so the levers
  // section is near the top; readout should still be visible.
  if (sideBySide) {
    await page.evaluate(() => {
      const el = document.querySelector("#playground");
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + 200, behavior: "instant" });
    });
    await page.waitForTimeout(300);
    const afterScrollLeaderboard = await page
      .locator("text=Robustness-Aware Leaderboard")
      .first()
      .boundingBox();
    if (afterScrollLeaderboard) {
      const inView =
        afterScrollLeaderboard.y >= 0 &&
        afterScrollLeaderboard.y < viewport.height;
      console.log(
        `  after scroll: leaderboard.y=${Math.round(afterScrollLeaderboard.y)} → in view: ${inView ? "YES" : "no"}`,
      );
    }

    // Click scenario 02 (Cascade) and verify the leaderboard updates while
    // remaining visible.
    await page.locator('button:has-text("02 · Cascade")').first().click();
    await page.waitForTimeout(500);
    const afterClickLeaderboard = await page
      .locator("text=Robustness-Aware Leaderboard")
      .first()
      .boundingBox();
    if (afterClickLeaderboard) {
      const inView =
        afterClickLeaderboard.y >= 0 &&
        afterClickLeaderboard.y < viewport.height;
      console.log(
        `  after scenario click: leaderboard.y=${Math.round(afterClickLeaderboard.y)} → in view: ${inView ? "YES" : "no"}`,
      );
    }
  }

  await page.screenshot({
    path: `scripts/.shots/playground-${label}.png`,
    fullPage: false,
  });
  // Scroll to top of playground so we can see lever cards too.
  await page.evaluate(() => {
    const el = document.querySelector("#playground");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: "instant" });
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `scripts/.shots/playground-${label}-top.png`,
    fullPage: false,
  });
  await browser.close();
}

const fs = await import("node:fs/promises");
await fs.mkdir("scripts/.shots", { recursive: true });

await check("md", { width: 900, height: 900 });
await check("lg", { width: 1200, height: 900 });
await check("xl", { width: 1440, height: 900 });
await check("2xl", { width: 1680, height: 1000 });
