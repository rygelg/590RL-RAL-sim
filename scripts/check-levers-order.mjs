import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3200";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });

// Scroll the "YOUR FOUR LEVERS" eyebrow to ~80px from top of viewport so all
// four cards are visible (or at least the first two).
await page
  .locator("text=Your four levers")
  .first()
  .evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -80);
  });
await page.waitForTimeout(300);

const allCards = page.locator(
  "text=/Which leaderboard regime|How is the Bradley–Terry model|How is that noise distributed|How much noise do we allow/",
);
const count = await allCards.count();
console.log(`found ${count} lever questions in DOM order:`);
for (let i = 0; i < count; i++) {
  const txt = (await allCards.nth(i).innerText()).trim();
  const b = await allCards.nth(i).boundingBox();
  console.log(`  ${i}: y=${b ? Math.round(b.y) : "?"}  "${txt}"`);
}

await page.screenshot({
  path: "scripts/.shots/levers-xl.png",
  fullPage: false,
});
await browser.close();
