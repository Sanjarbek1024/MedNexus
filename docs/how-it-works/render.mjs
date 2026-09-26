// Renders an SVG slide to a 2x PNG with the Playwright browser from frontend/node_modules.
// usage: node docs/how-it-works/render.mjs <file.svg>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const svgPath = process.argv[2];
const svg = readFileSync(svgPath, "utf8");
const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.locator("svg").first().screenshot({ path: svgPath.replace(/\.svg$/, ".png"), omitBackground: false });
await browser.close();
console.log("rendered", svgPath.replace(/\.svg$/, ".png"));
