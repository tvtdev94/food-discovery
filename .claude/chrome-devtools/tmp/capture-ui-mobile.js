// Capture all UI pages at mobile viewport (iPhone-sized), save to reports dir.
import { getBrowser, disconnectBrowser, outputJSON } from "file:///C:/Users/admin/.claude/skills/chrome-devtools/scripts/lib/browser.js";

const OUT_DIR = "C:/w/_me/food-discovery/plans/reports/ui-review-260421-2132";
const BASE = "http://localhost:3000";
const VIEWPORT = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function run() {
  const browser = await getBrowser({ viewport: VIEWPORT });
  const results = [];

  const scenarios = [
    { name: "01-home-empty", path: "/", clearStorage: true, waitMs: 800 },
    { name: "02-home-onboarding", path: "/", clearStorage: true, waitMs: 600 },
    { name: "03-favorites", path: "/favorites", clearStorage: false, waitMs: 600 },
    { name: "04-history", path: "/history", clearStorage: false, waitMs: 600 },
    { name: "05-login", path: "/login", clearStorage: false, waitMs: 600 },
  ];

  for (const s of scenarios) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

    if (s.clearStorage) {
      // clear storage for a specific origin via a first navigation
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      // for scenario without onboarding, set the flag
      if (s.name !== "02-home-onboarding") {
        await page.evaluate(() => localStorage.setItem("onboarded", "1"));
      }
    }

    await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
      results.push({ name: s.name, error: `nav: ${e.message}` });
    });

    await new Promise((r) => setTimeout(r, s.waitMs));

    const output = `${OUT_DIR}/${s.name}.png`;
    try {
      await page.screenshot({ path: output, fullPage: true });
      results.push({ name: s.name, path: output, ok: true });
    } catch (e) {
      results.push({ name: s.name, error: e.message });
    }
    await page.close();
  }

  outputJSON({ results });
  await disconnectBrowser();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
