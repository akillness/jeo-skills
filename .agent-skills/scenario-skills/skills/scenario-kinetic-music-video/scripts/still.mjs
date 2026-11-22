// Render stills at given times -> PNGs (+ optional contact sheet). usage: node tools/still.mjs --t 23.5,24,30 --scale 0.5 --dir out/stills [--only id] [--sheet name] [--variant b] [--canvas portrait|landscape|square|WxH] [--safe] [--blur [on|N]] [--shutter 180]
// --safe outlines the platform-UI safe band (drawn by the HUD) for review stills; never pass it to render.mjs.
// Stills are sharp unless --blur asks for the project's motion blur.
import { chromium } from "playwright";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { serve } from "./serve.mjs";
import { blurRefusal, engineQuery, parseArgs } from "./render_lib.mjs";
const args = parseArgs(process.argv.slice(2));
const scale = +(args.scale ?? 0.5),
  dir = args.dir ?? "out/stills";
fs.mkdirSync(dir, { recursive: true });
let times = String(args.t).split(",").map(Number);
if (args.range) {
  const [a, b, st] = args.range.split(":").map(Number);
  times = [];
  for (let x = a; x <= b + 1e-6; x += st) times.push(+x.toFixed(3));
}
const { srv, port } = await serve(0);
const q = engineQuery(args, { scale, still: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("console.error:", m.text());
});
await page.goto(`http://127.0.0.1:${port}/engine/index.html?${q}`);
await page.waitForFunction(() => window.__ready || window.__error, null, {
  timeout: 180000,
});
const err =
  (await page.evaluate(() => window.__error)) ||
  blurRefusal(args, await page.evaluate(() => "blur" in window.E));
if (err) {
  console.log(err);
  process.exit(1);
}
const [w, h] = await page.evaluate(() => [window.E.W, window.E.H]);
await page.setViewportSize({ width: w, height: h });
const files = [];
for (const t of times) {
  const fps = +(args.fps ?? 60);
  const b64 = await page.evaluate(
    async ([t, fps]) => {
      await window.renderFrame(Math.round(t * fps), fps);
      const u8 = await window.grab("image/png");
      let s = "";
      for (let i = 0; i < u8.length; i += 0x8000)
        s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [t, fps],
  );
  const f = `${dir}/t_${t.toFixed(2).padStart(7, "0")}.png`;
  fs.writeFileSync(f, Buffer.from(b64, "base64"));
  files.push(f);
}
await browser.close();
srv.close();
if (args.sheet) {
  // --force: the sheet is this run's output like the stills it is built from, so a re-run replaces it instead of keeping a stale one
  const r = spawnSync(".venv/bin/python", [
    "tools/sheet.py",
    `${dir}/${args.sheet}.jpg`,
    String(args.cols ?? 4),
    ...files,
    "--force",
  ]);
  if (r.error) {
    console.error(
      `--sheet: cannot run .venv/bin/python (${r.error.code}): scaffold.sh creates the project's Python environment there. The stills are in ${dir}.`,
    );
    process.exit(1);
  }
  console.log(
    r.stdout.toString(),
    r.stderr
      .toString()
      .split("\n")
      .filter((l) => !l.includes("objc"))
      .join("\n"),
  );
  // A sheet from an earlier run with the same name would otherwise pass for this run's.
  if (r.status !== 0) {
    console.error(
      `--sheet: sheet.py failed (exit ${r.status ?? r.signal}); no new sheet. The stills are in ${dir}.`,
    );
    process.exit(1);
  }
}
console.log(files.join("\n"));
