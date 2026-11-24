#!/usr/bin/env node
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The smoke test of a built playground (npm run build first):
//
//   node scripts/smoke.mjs [--port 5188] [--no-browser]
//
// It serves apps/playground/dist and checks that the page and every script
// and stylesheet it names load. With Playwright installed (npm i -D
// playwright && npx playwright install chromium) it then opens the page in
// Chromium and, for each editor that makes new files, creates one, types
// into it where the editor takes text, saves it (the download) and opens
// the saved file again; any page error fails the run.

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DIST = join(ROOT, "apps/playground/dist");
const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1]) || 5188;

if (!existsSync(join(DIST, "index.html"))) {
  console.error("apps/playground/dist/index.html is missing: run npm run build first");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".map": "application/json", ".bcmap": "application/octet-stream" };

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) {
    response.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, "index.html")) ? join(file, "index.html") : join(DIST, "index.html");
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((done) => server.listen(port, "127.0.0.1", done));
const base = `http://localhost:${port}`;
const failures = [];

try {
  // 1. the page and everything it names
  const page = await fetch(`${base}/`);
  if (!page.ok) failures.push(`GET / answered ${page.status}`);
  const html = await page.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  if (!assets.length) failures.push("index.html names no script");
  for (const asset of assets) {
    const answer = await fetch(`${base}${asset}`);
    if (!answer.ok) failures.push(`GET ${asset} answered ${answer.status}`);
  }
  console.log(`page: ${assets.length} assets load`);

  // 2. the editors, in a browser
  let playwright = null;
  if (!argv.includes("--no-browser")) {
    try {
      playwright = await import("playwright");
    } catch {
      console.log("browser: skipped (playwright is not installed)");
    }
  }
  if (playwright) {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
    const tab = await context.newPage();
    const errors = [];
    tab.on("pageerror", (error) => errors.push(String(error?.stack ?? error).slice(0, 400)));
    await tab.goto(`${base}/`, { waitUntil: "load" });
    await tab.getByRole("button", { name: /^Open/ }).waitFor({ timeout: 60_000 });
    const creators = await tab.getByRole("button", { name: /^New / }).allTextContents();
    console.log(`browser: editors that make new files: ${creators.join(", ") || "none"}`);
    if (!creators.length) failures.push("the playground offers no editor to create a file with");
    const downloads = mkdtempSync(join(tmpdir(), "mrnote-smoke-"));
    for (const label of creators) {
      const before = errors.length;
      await tab.getByRole("button", { name: label, exact: true }).click();
      const editor = tab.locator(".pg-editor:not([hidden])");
      await editor.waitFor({ timeout: 60_000 });
      // wait for the editor to draw (its loading line goes)
      await tab.waitForFunction(() => !document.querySelector(".pg-editor:not([hidden]) .pg-loading"), null, { timeout: 120_000 });
      await tab.waitForTimeout(1500);
      if (/Spreadsheet/.test(label)) {
        // a formula is calculated in the browser: 6 * 7 in A3
        const cell = editor.locator('[role="gridcell"], .spreadsheet-grid, canvas').first();
        const box = await cell.boundingBox().catch(() => null);
        if (box) await tab.mouse.click(box.x + 40, box.y + 10);
        for (const entry of ["6", "7", "=A1*A2"]) {
          await tab.keyboard.type(entry);
          await tab.keyboard.press("Enter");
        }
        await tab.waitForTimeout(1500);
        if (!(await editor.innerText()).split(/\s+/).includes("42")) failures.push(`${label}: =A1*A2 over 6 and 7 did not show 42`);
        else console.log(`browser: ${label}: arithmetic between cells calculated (=A1*A2 over 6 and 7 is 42)`);
      } else {
        const text = editor.locator("[contenteditable=true], textarea, .cm-content").first();
        if (await text.count()) {
          await text.click({ timeout: 10_000 }).catch(() => {});
          await tab.keyboard.type("Smoke test 123", { delay: 5 });
        }
      }
      // the playground's own Save (the editor may hold focus in a field)
      await tab.locator("body").press("Escape").catch(() => {});
      // an editor hands the playground its saver once it has loaded: ask again
      // while it says it has nothing to save yet
      let download = null;
      for (let attempt = 0; attempt < 15 && !download; attempt += 1) {
        const waiting = tab.waitForEvent("download", { timeout: attempt < 14 ? 4_000 : 60_000 }).catch(() => null);
        await tab.locator(".pg-bar").getByRole("button", { name: "Save", exact: true }).click();
        download = await waiting;
        if (!download && !/nothing to save yet/.test((await tab.locator(".pg-notice").allTextContents()).join(" "))) break;
      }
      if (!download) {
        failures.push(`${label}: Save gave no file (${(await tab.locator(".pg-notice").allTextContents()).join(" ") || "no notice"})`);
        continue;
      }
      const saved = join(downloads, download.suggestedFilename());
      await download.saveAs(saved);
      const size = statSync(saved).size;
      if (!size) failures.push(`${label}: the saved file is empty`);
      // open what was saved
      await tab.locator('.pg-bar input[type="file"]').setInputFiles(saved);
      await tab.waitForTimeout(2000);
      const notice = (await tab.locator(".pg-notice").allTextContents()).join(" ");
      if (/No editor here opens|not an MR Note|error/i.test(notice)) failures.push(`${label}: reopening ${download.suggestedFilename()}: ${notice}`);
      console.log(`browser: ${label}: saved ${download.suggestedFilename()} (${size} bytes) and opened it again`);
      if (errors.length > before) failures.push(`${label}: page errors:\n    ${errors.slice(before).join("\n    ")}`);
    }
    // an HTML file opens in the document editor (the code editor takes it too)
    const page = join(downloads, "page.html");
    writeFileSync(page, "<h1>Smoke</h1><p>An HTML page.</p>");
    await tab.locator('.pg-bar input[type="file"]').setInputFiles(page);
    await tab.locator(".pg-editor:not([hidden]) .ProseMirror").first().waitFor({ timeout: 60_000 }).then(
      () => console.log("browser: page.html opened in the document editor"),
      () => failures.push("page.html did not open in the document editor"),
    );
    writeFileSync(join(downloads, "errors.txt"), errors.join("\n"));
    await browser.close();
  }
} finally {
  server.close();
}

if (failures.length) {
  console.error(`smoke failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("smoke passed");
