// End-to-end + layout QA in real Chromium. Usage: E2E_BASE=http://localhost:3000 node e2e/run.mjs
// Needs the app running (mock mode is fine) with a migrated, seeded database. Writes screenshots to test-results/e2e/.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const OUT = "test-results/e2e";
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!cond) failures.push(name); };

const browser = await chromium.launch();

async function pageErrors(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*404/.test(m.text())) errs.push("console: " + m.text()); });
  return errs;
}

// ---- 1. core loop on a phone ------------------------------------------------
{
  await fetch(`${BASE}/api/demo/reset`, { method: "POST", headers: process.env.E2E_DEMO_KEY ? { "x-demo-key": process.env.E2E_DEMO_KEY } : {} }); // production needs E2E_DEMO_KEY
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = await pageErrors(p);
  const t0 = Date.now();
  await p.goto(`${BASE}/check`);
  await p.getByRole("button", { name: "fastkicks-shop" }).click();
  await p.getByText("Verdict ready").waitFor({ timeout: 30000 });
  ok("check: scam verdict shown", await p.getByRole("heading", { name: "Likely scam" }).isVisible());
  ok("check: score dial is accessible", (await p.getByRole("img", { name: /Trust score \d+ out of 100/ }).count()) === 1);
  await p.getByRole("button", { name: "Continue and watch my charges" }).click();
  await p.getByRole("button", { name: "Simulate a charge from this store" }).click();
  await p.waitForURL(/\/charges\/.+/, { waitUntil: "commit", timeout: 30000 });
  await p.getByRole("heading", { name: "Linked to a site where you entered info" }).waitFor({ timeout: 30000 });
  ok("charge: linked to the exposure", await p.getByText("fastkicks-shop", { exact: true }).first().isVisible());
  ok("charge: reasons mention timing", await p.getByText(/charged 3 days after exposure/).first().isVisible());
  await p.getByRole("button", { name: "Build dispute" }).click();
  await p.getByLabel(/Letter/).waitFor({ timeout: 15000 });
  const letter = await p.getByLabel(/Letter/).inputValue();
  ok("dispute: letter has amount and merchant", /\$49\.99/.test(letter) && /FKSHP\*LLC/.test(letter));
  ok("dispute: banner says drafts only", await p.getByText("Bluff drafts. You decide. Not legal or financial advice.").isVisible());
  await p.screenshot({ path: `${OUT}/core-loop-dispute.png`, fullPage: true });
  // the phone preview shows the alerts that were sent
  await p.getByRole("button", { name: /Phone preview/ }).click();
  await p.getByText(/You just entered your card/).waitFor({ timeout: 8000 });
  ok("phone preview: exposure alert text delivered", true);
  ok("core loop finished in a reasonable time", Date.now() - t0 < 90000, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  ok("core loop: no console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---- 2. every route, phone + desktop: renders, no errors, no horizontal scroll -------------
const ROUTES = ["/", "/check", "/charges", "/charges?demo=1", "/exposure", "/play", "/eval", "/privacy"];
for (const [label, vp] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errs = await pageErrors(p);
  for (const r of ROUTES) {
    const res = await p.goto(BASE + r, { waitUntil: "networkidle" });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const nav = await p.locator("nav[aria-label=Primary]").count();
    ok(`${label} ${r}: 200`, res.status() === 200);
    ok(`${label} ${r}: no horizontal scroll`, overflow <= 1, `overflow ${overflow}px`);
    ok(`${label} ${r}: primary navigation present`, nav === 2);
    await p.screenshot({ path: `${OUT}/${label}-${r.replace(/[^a-z]/gi, "_") || "home"}.png` });
  }
  ok(`${label}: no console errors across routes`, errs.length === 0, errs.slice(0, 3).join(" | "));
  await ctx.close();
}

// ---- 3. game, 5 cards, share -----------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/play`);
  await p.getByText("Card 1 of 5").waitFor();
  for (let i = 0; i < 5; i++) {
    await p.getByRole("button", { name: "Bluff!" }).click();
    await p.getByText(/Correct|Not quite/).waitFor();
    await p.getByRole("button", { name: i === 4 ? "See my score" : "Next card" }).click();
  }
  await p.getByLabel("Share preview").waitFor();
  ok("play: share text has the grid and no answers", /Call the Bluff #\d+ [🟩🟥]{5} \d\/5/u.test(await p.getByLabel("Share preview").innerText()));
  await ctx.close();
}

// ---- 4. keyboard + focus ---------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/check`);
  await p.keyboard.press("Tab");
  const focused = await p.evaluate(() => document.activeElement?.tagName);
  ok("keyboard: Tab moves focus to an interactive element", ["A", "BUTTON", "INPUT"].includes(focused), focused);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED:\n - ${failures.join("\n - ")}` : "\nall e2e checks passed");
process.exit(failures.length ? 1 : 0);
