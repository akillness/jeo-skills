#!/usr/bin/env node
/* Objective scorecard for a lit 3D wood scene. Captures the page headless, runs metrics.js on the frame,
   ablates each quality layer, and writes a JSON scorecard. Exit code 1 if any item is under --target.

   node scorecard.mjs                       # scores ./../demo.html served at http://localhost:8099/skills/3d-wood-lighting-scorecard/demo.html
   node scorecard.mjs --url URL --target 8 --size 1440x900 --dpr 1 --out scorecard.json
   node scorecard.mjs --sync                # copy references/metrics.js into demo.html between its markers
   node scorecard.mjs --url URL --generic --selector canvas --regions regions.json   # any page: you supply the regions

   Needs: npm i playwright-core (or playwright) and a Chromium (Chrome for Testing works). headless:true always: the
   in-app pane shares the GPU and backgrounds itself, so it is for looking, not for measuring. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Metrics = require(path.join(here, 'metrics.js'));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), (all[i + 1] && !all[i + 1].startsWith('--')) ? all[i + 1] : true] : []).filter(x => x.length));

if (args.sync) {                                             /* keep the page's inlined metrics identical to metrics.js */
  const demo = path.join(here, '..', 'demo.html');
  const S = '/* ==== metrics.js, inlined verbatim (scorecard.mjs --sync keeps it identical) ==== */\n', E = '\n/* ==== end metrics.js ==== */';
  let h = fs.readFileSync(demo, 'utf8'); const i = h.indexOf(S) + S.length, j = h.indexOf(E);
  h = h.slice(0, i) + fs.readFileSync(path.join(here, 'metrics.js'), 'utf8').trimEnd() + h.slice(j); fs.writeFileSync(demo, h);
  console.log('demo.html metrics block synced'); process.exit(0);
}

const URL_ = args.url || 'http://localhost:8099/skills/3d-wood-lighting-scorecard/demo.html';
const [W, H] = String(args.size || '1440x900').split('x').map(Number);
const DPR = +(args.dpr || 1), TARGET = +(args.target || 8), OUT = args.out || path.join(process.cwd(), 'scorecard.json');
const generic = !!args.generic;

async function loadPlaywright() {                           /* resolve from the cwd, $PW_DIR, or next to this file */
  for (const n of ['playwright-core', 'playwright']) {
    try { const m = require(require.resolve(n, { paths: [process.cwd(), process.env.PW_DIR, here].filter(Boolean) })); return m; } catch {}
  }
  throw new Error('playwright not found: run `npm i playwright-core` in the cwd, or set PW_DIR to a folder that has it');
}
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) { const p = path.join(root, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'); if (fs.existsSync(p)) return p; }
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const logs = []; page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); }); page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto(URL_, { waitUntil: 'load' });

/* ------------------------------------------------------------ capture */
async function grab(nx = 0, ny = 0) {                       /* one frame as RGBA; rendered and read in ONE task, the drawing buffer is gone after it */
  if (!generic) return page.evaluate(([nx, ny]) => {
    KiboriScore.render(nx, ny);
    const c = document.getElementById('gl'), w = c.width, h = c.height, t = document.createElement('canvas'); t.width = w; t.height = h;
    const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0);       /* same task as KiboriScore.render(): no preserveDrawingBuffer needed */
    const d = x.getImageData(0, 0, w, h).data; let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w, h, b64: btoa(s) };
  }, [nx, ny]);
  const png = await page.locator(args.selector || 'canvas').first().screenshot();
  const p2 = await browser.newPage();
  const r = await p2.evaluate(async b64 => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const t = new OffscreenCanvas(bm.width, bm.height), x = t.getContext('2d'); x.drawImage(bm, 0, 0);
    const d = x.getImageData(0, 0, bm.width, bm.height).data; let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000)); return { w: bm.width, h: bm.height, b64: btoa(s) }; }, png.toString('base64'));
  await p2.close(); return r;
}
const rgba = f => new Uint8ClampedArray(Buffer.from(f.b64, 'base64'));

let regions, layers = {};
if (generic) { regions = JSON.parse(fs.readFileSync(args.regions, 'utf8')); }
else {
  await page.waitForFunction(() => window.KiboriScore && KiboriScore.ready, null, { timeout: 90000 });
  await page.evaluate(() => KiboriScore.freeze(true)); await page.waitForTimeout(500);
  regions = await page.evaluate(() => KiboriScore.regions()); layers = await page.evaluate(() => KiboriScore.layers());
}

/* minification shimmer: shift the view by half a pixel; a properly prefiltered surface changes by ~ |gradient| * 0.5,
   an aliased one changes by much more. ratio = mean|A-B| / (0.5 * mean|dA/dx|) over the grain region. */
function shimmerRatio(A, B, w, h, rect) {
  const x0 = Math.round(rect[0] * w), y0 = Math.round(rect[1] * h), x1 = Math.round(rect[2] * w), y1 = Math.round(rect[3] * h);
  const Y = (d, i) => 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; let dif = 0, grad = 0, n = 0;
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) { const i = y * w + x; dif += Math.abs(Y(A, i) - Y(B, i)); grad += Math.abs(Y(A, i + 1) - Y(A, i - 1)) / 2; n++; }
  return (dif / n) / Math.max(0.5 * grad / n, 0.05);
}
async function score(label) {
  const A = await grab(); const opt = { texelPerPx: generic ? undefined : await page.evaluate(() => KiboriScore.texelPerPx()) };
  if (!generic) {
    const B = await grab(0.5, 0);
    const gr = regions.grain && regions.grain.rect; if (gr) opt.shimmer = shimmerRatio(rgba(A), rgba(B), A.w, A.h, gr);
  }
  const r = Metrics.measure(rgba(A), A.w, A.h, regions, opt); r.label = label; return r;
}
const summary = r => Object.fromEntries(r.items.map(i => [i.id, i.score]));

/* ------------------------------------------------------------ run */
const out = { url: URL_, size: [W, H], dpr: DPR, target: TARGET, date: new Date().toISOString().slice(0, 10) };
if (!generic) out.three_revision = await page.evaluate(() => KiboriScore.THREE_REV);
if (!generic) await page.evaluate(() => KiboriScore.setAll(true));
const on = await score('all layers on'); out.all_on = { total: on.total, min: on.min, items: on.items, metrics: on.metrics };
if (!generic && !args['no-ablate']) {
  await page.evaluate(() => KiboriScore.setAll(false)); const off = await score('flat baseline'); out.baseline = { total: off.total, min: off.min, scores: summary(off) };
  out.ablation = {};
  for (const id of Object.keys(layers)) {
    await page.evaluate(id => { KiboriScore.setAll(true); KiboriScore.set(id, false); }, id);
    const r = await score('without ' + id); const s = summary(r), base = summary(on);
    out.ablation[id] = { total: r.total, drop: +(on.total - r.total).toFixed(2), items_hurt: Object.keys(s).filter(k => (base[k] ?? 0) - (s[k] ?? 0) >= 0.5).map(k => `${k} ${base[k]} -> ${s[k]}`) };
  }
  await page.evaluate(() => KiboriScore.setAll(true));
  /* cost: CPU submit + GPU completion of the full pipeline, 1 px readback forces the wait */
  out.cost = await page.evaluate(() => { const gl = document.getElementById('gl').getContext('webgl2'); const px = new Uint8Array(4); const ts = [];
    for (let i = 0; i < 60; i++) { const t = performance.now(); KiboriScore.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); }
    ts.sort((a, b) => a - b); return { frames: 60, median_ms: +ts[30].toFixed(2), p90_ms: +ts[54].toFixed(2), note: 'headless, one frame at a time, incl. 4096 shadow map re-render off (static) and 1 px readback' }; });
}
out.short = on.items.filter(i => i.score == null || i.score < TARGET).map(i => ({ id: i.id, score: i.score, worst: i.parts.filter(p => p.score != null).sort((a, b) => a.score - b.score).slice(0, 2).map(p => `${p.k}=${p.v} -> ${p.score}`) }));
out.pass = out.short.length === 0; out.console = logs;
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`${out.pass ? 'PASS' : 'SHORT'}  total ${on.total}  min ${on.min}  target ${TARGET}   (${OUT})`);
for (const i of on.items) console.log(`  ${String(i.score).padStart(5)}  ${i.name}${i.score != null && i.score < TARGET ? '   <- short: ' + out.short.find(s => s.id === i.id).worst.join('; ') : ''}`);
if (out.baseline) console.log(`  baseline (all layers off): ${out.baseline.total}`);
if (logs.length) console.log('console:', logs);
await browser.close(); process.exit(out.pass ? 0 : 1);
