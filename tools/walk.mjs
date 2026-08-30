// Screenshot the page at fixed scroll steps. The scrollcraft harness walks
// engine acts; this page has none, so this walks the document instead.
// node tools/walk.mjs --url http://localhost:4500 --out lab/walk [--width 1440 --height 900] [--step 0.5]
import { chromium } from "playwright-core";
import fs from "node:fs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const url = arg("--url", "http://localhost:4500"), out = arg("--out", "lab/walk");
const width = +arg("--width", 1440), height = +arg("--height", 900), step = +arg("--step", 0.5);
fs.mkdirSync(out, { recursive: true });
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("#map.is-ready", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
const docH = await page.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y <= docH - height + 1; y += height * step) {
  await page.evaluate((yy) => window.scrollTo(0, yy), Math.round(y));
  await page.waitForTimeout(700);
  const file = `${out}/${String(i).padStart(2, "0")}.png`;
  await page.screenshot({ path: file });
  console.log(file, "y=" + Math.round(y), "(" + (y / height).toFixed(2) + "vh)");
  i++;
}
console.log("errors:", JSON.stringify(errors), "docH:", docH);
await browser.close();
