import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3200";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

// Find the lever grid and walk all stylesheets to find matching rules.
const result = await page.evaluate(() => {
  const m = [...document.querySelectorAll("div")].find((d) =>
    d.className && d.className.toString().includes("xl:grid-cols-1"),
  );
  if (!m) return { found: false };
  const cs = window.getComputedStyle(m);
  // Walk all stylesheets to find rules that match m and contain grid-template-columns.
  const matching = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (_) {
      continue;
    }
    function visit(rs, mediaText) {
      for (const r of rs) {
        if (r.constructor.name === "CSSMediaRule") {
          visit(r.cssRules, r.conditionText || r.media.mediaText);
        } else if (r.style && r.style.gridTemplateColumns) {
          try {
            if (m.matches(r.selectorText)) {
              matching.push({
                media: mediaText || "all",
                selector: r.selectorText,
                grid: r.style.gridTemplateColumns,
              });
            }
          } catch (_) {}
        }
      }
    }
    visit(sheet.cssRules, "");
  }
  return {
    found: true,
    width: m.getBoundingClientRect().width,
    computed: cs.gridTemplateColumns,
    matching,
  };
});

console.log(JSON.stringify(result, null, 2));

await browser.close();
