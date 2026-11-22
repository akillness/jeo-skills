// Deterministic renderer: steps the engine frame by frame in headless Chrome, pipes JPEGs to ffmpeg.
// usage: node tools/render.mjs --from 22 --to 30 --fps 30 --scale 0.5 --out out/preview.mp4 [--only a,b] [--workers 3] [--noaudio] [--crf 16] [--variant b] [--canvas portrait|landscape|square|WxH] [--blur [on|off|N]] [--shutter 180] [--blur-max 24] [--force]  (--blur overrides BLUR in engine/timeline.js; --to defaults to the song length; --canvas defaults to CANVAS in engine/timeline.js; an existing --out is kept unless --force; --scale 2 renders the 4K master and fits --workers to memory)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "./serve.mjs";
import {
  blurRefusal,
  describeBlur,
  engineQuery,
  levelProblem,
  parseArgs,
  workerCap,
  workerGB,
  x264Args,
} from "./render_lib.mjs";
const args = parseArgs(process.argv.slice(2));
const fps = +(args.fps ?? 30),
  scale = +(args.scale ?? 1),
  from = +(args.from ?? 0),
  to = +(
    args.to ??
    JSON.parse(fs.readFileSync("engine/data/audio.json", "utf8")).duration
  ),
  workers = +(args.workers ?? 1);
const out = args.out ?? "out/render.mp4";
if (fs.existsSync(out) && !args.force) {
  console.error(`${out} exists; pass --force to replace it`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
const f0 = Math.round(from * fps),
  f1 = Math.round(to * fps);
const { srv, port } = await serve(0);
const q = engineQuery(args, { scale });
const launch = () =>
  chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-angle=metal",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader=false",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
async function renderChunk(a, b, file, wi) {
  const browser = await launch();
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(`[w${wi}] ${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => console.log(`[w${wi}] pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/engine/index.html?${q}`);
  await page.waitForFunction(() => window.__ready || window.__error, null, {
    timeout: 180000,
  });
  const err =
    (await page.evaluate(() => window.__error)) ||
    blurRefusal(args, await page.evaluate(() => "blur" in window.E));
  if (err) throw new Error(err);
  // the engine resolved the canvas (timeline.js CANVAS or --canvas); match the page to it
  const [w, h] = await page.evaluate(() => [window.E.W, window.E.H]);
  await page.setViewportSize({ width: w, height: h });
  const enc = x264Args({ w, h, fps, crf: args.crf ?? 16, scale });
  if (wi === 0) {
    const b = describeBlur(await page.evaluate(() => window.E.blur));
    if (b) console.log(b);
    if (!enc.includes("-level") && enc.includes("-threads"))
      console.log(`note: ${levelProblem(w, h, fps)}; rendering anyway`);
    if (scale > 1) fitWorkers(w, h);
  }
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "mjpeg",
      "-i",
      "-",
      ...enc,
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    const buf = await page.evaluate(
      async ([f, fps]) => {
        await window.renderFrame(f, fps);
        const u8 = await window.grab("image/jpeg", 0.94);
        let s = "";
        for (let i = 0; i < u8.length; i += 0x8000)
          s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      },
      [f, fps],
    );
    if (!ff.stdin.write(Buffer.from(buf, "base64")))
      await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - a) % 60 === 0)
      process.stdout.write(
        `[w${wi}] frame ${f}/${b} ${((f - a + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} fps\n`,
      );
  }
  sharpFrames.push(
    ...((await page.evaluate(() => window.__blurFallbacks)) ?? []),
  );
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  await browser.close();
  if (code !== 0)
    throw new Error(`ffmpeg chunk encode failed (exit ${code}): ${file}`);
}
// Above scale 1, chunk 0 renders alone until its page reports the frame size; then as many chunks run at once as fit in
// memory. The chunks stay those of --workers, so the file does not depend on the machine.
let slots = scale > 1 ? 1 : Infinity,
  running = 0;
const waiting = [],
  sharpFrames = [];
const pump = () => {
  while (running < slots && waiting.length) {
    running++;
    waiting.shift()();
  }
};
function fitWorkers(w, h) {
  const cap = workerCap(workers, w, h, os.totalmem());
  if (cap < workers)
    console.log(
      `--scale ${scale}: ${workers} workers lowered to ${cap} at once (${Math.round(os.totalmem() / 2 ** 30)} GB RAM, about ${workerGB(w, h).toFixed(1)} GB per worker)`,
    );
  slots = cap;
  pump();
}
async function inSlot(job) {
  await new Promise((r) => {
    waiting.push(r);
    pump();
  });
  try {
    return await job();
  } finally {
    running--;
    pump();
  }
}
const n = f1 - f0,
  per = Math.ceil(n / workers),
  parts = [];
await Promise.all(
  Array.from({ length: workers }, (_, i) => {
    const a = f0 + i * per,
      b = Math.min(f1, a + per);
    if (a >= b) return;
    // Built from the stem, so no --out extension can make a chunk overwrite the output.
    const file = `${out.slice(0, out.length - path.extname(out).length)}.part${i}.mp4`;
    parts.push([i, file]);
    return inSlot(() => renderChunk(a, b, file, i));
  }),
);
parts.sort((x, y) => x[0] - y[0]);
const list = out + ".txt";
fs.writeFileSync(
  list,
  parts.map(([, f]) => `file '${path.resolve(f)}'`).join("\n"),
);
const muxArgs = [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  list,
];
if (!args.noaudio)
  muxArgs.push(
    "-ss",
    String(f0 / fps),
    "-t",
    String(n / fps),
    "-i",
    JSON.parse(fs.readFileSync("engine/data/audio.json", "utf8")).master,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-af",
    "apad",
    "-shortest",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
  ); // apad: silence after the song ends (extended end card)
muxArgs.push("-c:v", "copy", "-movflags", "+faststart", out);
const muxCode = await new Promise((r) =>
  spawn("ffmpeg", muxArgs, { stdio: "inherit" }).on("close", r),
);
if (muxCode !== 0) {
  console.error(
    `ffmpeg mux failed (exit ${muxCode}); chunk files kept for inspection`,
  );
  process.exit(1);
}
parts.forEach(([, f]) => fs.unlinkSync(f));
fs.unlinkSync(list);
srv.close();
if (sharpFrames.length)
  console.log(
    `motion blur: ${sharpFrames.length} frame${sharpFrames.length === 1 ? "" : "s"} rendered sharp, because a sample drew a clip prepare() had not advanced (a cut inside a scene): ${sharpFrames
      .sort((x, y) => x[0] - y[0])
      .map(([f, c]) => `${f} (${c})`)
      .join(", ")}. Register those cuts with E.cut(t) in load().`,
  );
console.log("wrote", out, `(${n} frames)`); // the count delivery_check.py --frames takes
