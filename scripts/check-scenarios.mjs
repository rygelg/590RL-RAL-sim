// Headless smoke test of the four one-click scenarios. For each, click the
// button and snapshot:
//   - leaderboard rank #1 model name + Δ rank
//   - whether the "Top rank flipped" pill is rendered
//   - the move-summary pill text (counts up/down/maxJump)
//
// Run against either the local prod build (PORT=3100, default) or the live
// deploy: URL=https://590-rl-ral-sim.vercel.app/ node scripts/check-scenarios.mjs
//
// Requires `playwright` and `chromium` installed locally; this script is not
// shipped with the app and uses no project deps.

import { chromium } from "playwright";

const URL = process.env.URL || "http://127.0.0.1:3100/";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1800 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const eyebrows = [
  "01 · Min flip",
  "02 · Cascade",
  "03 · CI blindspot",
  "04 · Defense holds",
];

for (const eyebrow of eyebrows) {
  const btn = page.locator(`button:has-text("${eyebrow}")`).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    function findCardWith(text) {
      const all = Array.from(document.querySelectorAll("div"));
      const hit = all.find(
        (d) => d.children.length === 0 && d.textContent?.trim() === text,
      );
      let p = hit;
      while (p && !p.classList.contains("rounded-2xl")) p = p.parentElement;
      return p;
    }

    const lbCard = findCardWith("Robustness-Aware Leaderboard");
    const grids = lbCard
      ? Array.from(lbCard.querySelectorAll('[class*="grid-cols-[28px_88px_1fr"]'))
      : [];
    const rowCells = grids.filter((g) => g.children.length >= 6);
    const headerRow = rowCells.find((g) =>
      /^\s*#\s*$/.test(g.children[0]?.textContent ?? ""),
    );
    const headerIdx = headerRow ? rowCells.indexOf(headerRow) : -1;
    const firstData = rowCells[headerIdx + 1];
    const row1 = firstData
      ? {
          numCell: firstData.children[0]?.textContent?.trim(),
          deltaCell: firstData.children[1]?.textContent?.trim(),
          modelCell: firstData.children[2]?.textContent?.trim(),
        }
      : null;

    const topFlipPill = lbCard?.textContent?.includes("Top rank flipped") ?? false;

    let moveSummary = null;
    if (lbCard) {
      const span = Array.from(lbCard.querySelectorAll("span,div")).find(
        (el) =>
          /\d+ of \d+ moved/.test(el.textContent ?? "") ||
          (el.textContent ?? "").includes("all ranks held"),
      );
      moveSummary = span?.textContent?.trim() ?? null;
    }

    // Pull the active scenario card's outcome pill text for cross-check.
    const activeBtn = document.querySelector(
      'button[aria-pressed="true"]',
    );
    const activeOutcomePill = activeBtn
      ? activeBtn.querySelector('div[class*="rounded-md"]')?.textContent?.trim()
      : null;

    return { row1, topFlipPill, moveSummary, activeOutcomePill };
  });

  console.log(`\n[${eyebrow}]`);
  console.log(JSON.stringify(data, null, 2));
}

if (errors.length) {
  console.log("\n--- console/page errors ---");
  for (const e of errors) console.log(e);
}
await browser.close();
