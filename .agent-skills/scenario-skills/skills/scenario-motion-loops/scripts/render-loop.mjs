#!/usr/bin/env node
// Render a seamless loop page (loop-template.html or a copy of it) to MP4.
// Frames come out of the page already supersampled and motion-blurred, are piped as PNG into
// ffmpeg and encoded as H.264 (BT.709, limited range, 4:2:0). Before encoding, the page is
// checked for determinism and for a clean loop seam; after encoding, the file is checked again.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const USAGE = `Usage:
  node render-loop.mjs <loop.html> --out <loop.mp4> [options]   render, check, encode, check
  node render-loop.mjs <loop.html> --check [options]            page checks only, no video
  node render-loop.mjs <loop.html> --stills <dir> --at 0,3,6,9  motion-blurred PNG stills
  node render-loop.mjs --qa <file.mp4> [more.mp4 ...]           format and seam check of any MP4

Options:
  --width <px>       output width (default 1920)
  --height <px>      output height (default 1080)
  --fps <n>          frames per second (default 24)
  --samples <n>      motion-blur sub-frames per frame (default 8; 1 = no blur)
  --shutter <0-1>    shutter as a fraction of one frame (default 0.5, a 180 degree shutter)
  --ss <n>           supersampling factor, a whole number (default 2)
  --seconds <s>      length to render (default: the page's LOOP; a shorter test skips the seam QA)
  --crf <n>          x264 quality, lower is better (default 16)
  --params <query>   extra page parameters, e.g. "tone=light&overlay=subject.png"
  --psnr <seconds>   after encoding, compare that frame with its lossless render
  --channel <name>   browser channel, e.g. "chrome" for an installed Google Chrome
  --ignore-seam      pass a seam jump in both checks (a cut designed to sit at the loop point)
  --force            overwrite existing output files
  -h, --help         show this help

Needs Node 18+, ffmpeg 5.1+ and ffprobe on PATH, and Playwright installed where you run it:
  npm install playwright && npx playwright install chromium`;

const BOOL = new Set(["check", "ignore-seam", "force", "help", "qa"]);
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--") && BOOL.has(a.slice(2))) o[a.slice(2)] = true;
    else if (a.startsWith("--")) {
      if (i + 1 >= argv.length) die(`${a} needs a value`);
      o[a.slice(2)] = argv[++i];
    } else o._.push(a);
  }
  return o;
}
function die(msg) {
  console.error(msg);
  process.exit(1);
}
const opt = parseArgs(process.argv.slice(2));
if (opt.help || !opt._.length) {
  console.log(USAGE);
  process.exit(opt.help ? 0 : 1);
}
const num = (v, d) => (v === undefined ? d : Number(v));
const FPS = num(opt.fps, 24);
const SAMPLES = Math.max(1, Math.round(num(opt.samples, 8)));
const SHUTTER = num(opt.shutter, 0.5);
const SS = Math.max(1, Math.round(num(opt.ss, 2)));
const W = num(opt.width, 1920);
const H = num(opt.height, 1080);
const CRF = num(opt.crf, 16);
const SECONDS = num(opt.seconds, 1);
for (const [k, v] of Object.entries({
  FPS,
  W,
  H,
  SHUTTER,
  SAMPLES,
  SS,
  SECONDS,
}))
  if (!Number.isFinite(v) || v <= 0) die(`bad value for ${k}`);
if (!Number.isFinite(CRF) || CRF < 0) die("bad value for CRF");

for (const tool of ["ffmpeg", "ffprobe"])
  if (spawnSync(tool, ["-version"]).status !== 0)
    die(`${tool} was not found on PATH.`);

// ---------- Encoded-file QA ----------
function probe(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=width,height,r_frame_rate,nb_read_frames,pix_fmt,color_range,color_space,color_primaries,color_transfer:format=duration,bit_rate",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) die(`ffprobe could not read ${file}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  return { s: j.streams[0], f: j.format };
}
// Gray frames at 320 px wide for the given frame indices (ascending, unique).
function grayFrames(file, w, h, idx) {
  const gw = 320,
    gh = Math.max(2, Math.round((gw * h) / w / 2) * 2);
  const sel = idx.map((i) => `eq(n\\,${i})`).join("+");
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `select=${sel},scale=${gw}:${gh}`,
      "-fps_mode",
      "passthrough",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  if (r.status !== 0) die(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const size = gw * gh,
    out = {};
  idx.forEach((i, k) => (out[i] = r.stdout.subarray(k * size, (k + 1) * size)));
  return out;
}
const meanDiff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};
// The loop point is judged against the motion right around it, not the clip's average, so a
// seam inside a fast move or a hold is read correctly. Motion blur wraps time at the seam, so a
// jump shows up split over two steps (last to first, first to second): both are checked against
// the five steps on either side. A step far smaller than its neighbors means a duplicated
// frame, which stutters when an editor loops the clip.
function qa(file) {
  const { s, f } = probe(file);
  const n = Number(s.nb_read_frames);
  if (!(n >= 12)) die(`${file}: too few frames to check (${n})`);
  const ring = [];
  for (let i = -6; i <= 5; i++) ring.push((i + n) % n);
  const fr = grayFrames(
    file,
    s.width,
    s.height,
    [...new Set(ring)].sort((a, b) => a - b),
  );
  const steps = ring
    .slice(0, -1)
    .map((a, k) => meanDiff(fr[a], fr[ring[k + 1]]));
  // steps[5] is last frame -> first frame, steps[6] is first -> second.
  const seamPair = [steps[5], steps[6]];
  const around = [...steps.slice(0, 5), ...steps.slice(7)];
  const ref = Math.max(...around, 0.3);
  const jump = Math.max(...seamPair) / ref > 2;
  const sorted = [...around].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)];
  const dup = typical > 1 && steps[5] < 0.2 * typical;
  // A player guesses the colors of a file without all three BT.709 tags, and guesses vary.
  const tags = [s.color_space, s.color_primaries, s.color_transfer];
  const tagged = tags.every((v) => v === "bt709");
  // --ignore-seam covers a cut designed to sit at the loop point, here as in the page check.
  const ignored = jump && opt["ignore-seam"];
  const verdict =
    jump && !ignored
      ? "CHECK SEAM"
      : dup
        ? "DUPLICATE FRAME?"
        : !tagged
          ? "UNTAGGED COLOR"
          : ignored
            ? "ok (seam jump ignored)"
            : "ok";
  console.log(
    `${path.basename(file)}: ${s.width}x${s.height} ${s.r_frame_rate} fps, ${n} frames, ` +
      `${Number(f.duration).toFixed(2)} s, ${(Number(f.bit_rate) / 1e6).toFixed(1)} Mbps, ` +
      `${s.pix_fmt} ${tags.map((v) => v || "?").join("/")}/${s.color_range || "?"}; loop point steps ` +
      `${seamPair.map((v) => v.toFixed(2)).join(", ")} vs up to ${ref.toFixed(2)} around it -> ${verdict}`,
  );
  return verdict.startsWith("ok");
}

if (opt.qa) {
  let all = true;
  for (const file of opt._) all = qa(path.resolve(file)) && all;
  process.exit(all ? 0 : 1);
}

// ---------- Browser and page ----------
function loadPlaywright() {
  for (const base of [path.join(process.cwd(), "noop.js"), import.meta.url]) {
    try {
      return createRequire(base)("playwright");
    } catch {
      /* try the next location */
    }
  }
  die(
    "Playwright was not found. In the folder you run this from: npm install playwright && npx playwright install chromium\n(or add --channel chrome to use an installed Google Chrome).",
  );
}

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
// A local server for the page's folder only: images loaded over file:// would taint the canvas
// and break the motion-blur readback.
function serve(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, {
        "content-type":
          TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      });
      res.end(data);
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const input = path.resolve(opt._[0]);
if (!fs.existsSync(input)) die(`No such file: ${input}`);
if (!opt.check && !opt.stills && !opt.out)
  die("Pass --out <file.mp4>, --check or --stills <dir>.\n\n" + USAGE);
const outFile = opt.out ? path.resolve(opt.out) : null;
if (outFile === input) die("--out must not be the loop page itself.");
if (outFile && fs.existsSync(outFile) && !opt.force)
  die(`Refusing to overwrite ${outFile} (use --force).`);

const { chromium } = loadPlaywright();
const server = await serve(path.dirname(input));
const base = `http://127.0.0.1:${server.address().port}/${encodeURIComponent(path.basename(input))}`;
const extra = opt.params ? "&" + opt.params.replace(/^[?&]/, "") : "";
// A Playwright release that has not downloaded its own browser yet fails here.
const browser = await chromium
  .launch({ headless: true, ...(opt.channel ? { channel: opt.channel } : {}) })
  .catch((e) => {
    server.close();
    die(
      `The browser did not start: ${String(e.message).split("\n")[0]}\n` +
        "Run npx playwright install chromium in this folder, or add --channel chrome to use an installed Google Chrome.",
    );
  });
const errors = [];

async function open(w, h, ss) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}?render=1&w=${w}&h=${h}&ss=${ss}${extra}`);
  await page.waitForFunction(
    () => window.__ready === true || window.__error,
    null,
    {
      timeout: 60000,
    },
  );
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return page;
}

// Determinism and loop seam, measured on small frames without blur.
async function checkPage() {
  const page = await open(320, Math.max(2, Math.round((320 * H) / W)), 1);
  const r = await page.evaluate((fps) => {
    const loop = window.__info.loop,
      dt = 1 / fps;
    const c = document.getElementById("out");
    const x = c.getContext("2d", { willReadFrequently: true });
    const grab = (t) => {
      window.__frame(t, fps, 1);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const diff = (a, b) => {
      let s = 0;
      for (let i = 0; i < a.length; i += 4)
        s +=
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
      return s / (a.length / 4);
    };
    const t1 = loop * 0.137;
    const first = grab(t1);
    grab(loop * 0.71);
    const determinism = diff(first, grab(t1));
    // Unwrapped time: the frame at exactly t = LOOP must be the frame at 0. A period that does
    // not divide the loop fails here even when the motion is too fast for the step test to see.
    let closes = null;
    try {
      window.__frame(loop, fps, 1, 0.5, false);
      const end = x.getImageData(0, 0, c.width, c.height).data;
      closes = diff(end, grab(0));
    } catch {
      closes = null; // the tile only accepts t in [0, LOOP); rely on the step test
    }
    const steps = [];
    for (let i = 0; i < 12; i++) {
      const t = (loop * (i + 0.5)) / 12;
      steps.push(diff(grab(t), grab(t + dt)));
    }
    const before = diff(grab(loop - 2 * dt), grab(loop - dt));
    const seam = diff(grab(loop - dt), grab(0));
    const after = diff(grab(0), grab(dt));
    // Every allowed period restarts on a half-second grid, so a designed event at the start of a
    // cycle (a flash, a pop) also happens at one of these boundaries inside the loop.
    let cycle = 0;
    for (let b = 0.5; b < loop - 1e-9; b += 0.5)
      cycle = Math.max(cycle, diff(grab(b - dt), grab(b)));
    return {
      loop,
      determinism,
      closes,
      motion: Math.max(...steps),
      before,
      seam,
      after,
      cycle,
    };
  }, FPS);
  await page.close();
  // 0.5 is about the size of an anti-aliasing difference along one shape's edge: not visible.
  const closesOk = r.closes === null || r.closes < 0.5;
  const stepOk = r.seam / Math.max(r.before, r.after, r.cycle, 0.5) < 2;
  const seamOk = closesOk && stepOk;
  const closesText =
    r.closes === null
      ? "n/a"
      : `${r.closes.toFixed(2)} ${closesOk ? "ok" : "FAIL"}`;
  console.log(
    `checks: loop ${r.loop} s; determinism ${r.determinism === 0 ? "ok" : "FAIL"}; ` +
      `frame at ${r.loop} s vs 0 s: ${closesText}; seam step ${r.seam.toFixed(2)} ` +
      `(neighbors ${r.before.toFixed(2)}, ${r.after.toFixed(2)}; largest cycle-boundary step ` +
      `${r.cycle.toFixed(2)}) ${stepOk ? "ok" : "FAIL"}; motion ${r.motion < 0.05 ? "STATIC?" : "ok"} ` +
      `-> ${r.determinism !== 0 ? "NOT DETERMINISTIC" : seamOk ? "PASS" : "SEAM JUMP"}`,
  );
  if (r.determinism !== 0)
    console.log(
      "  The same t gave two different frames: the tile keeps state between frames or reads Math.random, Date or performance.now. Compute everything from t and M.rand.",
    );
  if (!seamOk && r.determinism === 0)
    console.log(
      "  The last frame does not lead into the first. Check that every period divides LOOP and that scrolls move a whole number of repeats per period. Look at stills just before and after the loop point.",
    );
  return { ...r, pass: r.determinism === 0 && (seamOk || opt["ignore-seam"]) };
}

async function shoot(page, t, file) {
  await page.evaluate(
    ([t, fps, s, sh]) => window.__frame(t, fps, s, sh),
    [t, FPS, SAMPLES, SHUTTER],
  );
  return page
    .locator("#out")
    .screenshot(file ? { path: file } : { type: "png" });
}

function ffmpegPsnr(a, b) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-i",
      a,
      "-i",
      b,
      "-lavfi",
      "[0]format=rgb24[a];[1]format=rgb24[b];[a][b]psnr",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const m = /average:([0-9.]+|inf)/.exec(r.stderr || "");
  return m ? m[1] : "?";
}

let exitCode = 0;
try {
  const checks = await checkPage();
  if (!checks.pass) exitCode = 1;

  if (opt.stills) {
    const dir = path.resolve(opt.stills);
    fs.mkdirSync(dir, { recursive: true });
    const times = String(opt.at || "0,3,6,9")
      .split(",")
      .map(Number)
      .filter(Number.isFinite);
    const page = await open(W, H, SS);
    for (const t of times) {
      const file = path.join(dir, `still-${t.toFixed(2)}s.png`);
      if (fs.existsSync(file) && !opt.force) {
        console.error(`Refusing to overwrite ${file} (use --force).`);
        exitCode = 1;
        continue;
      }
      await shoot(page, t, file);
      console.log(`wrote ${file}`);
    }
    await page.close();
  }

  if (outFile && exitCode !== 0)
    console.error(
      `not encoding ${path.basename(outFile)}: ${checks.pass ? "a still was refused" : "the page check failed"}`,
    );
  else if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const seconds = num(opt.seconds, checks.loop);
    const N = Math.round(seconds * FPS);
    const page = await open(W, H, SS);
    const ff = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-i",
        "-",
        "-vf",
        // The -color_* flags below alone leave primaries and transfer untagged: the filtered
        // frames carry "unspecified", and the encoder keeps the frames' values.
        "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        String(CRF),
        "-profile:v",
        "high",
        "-tune",
        "animation",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-movflags",
        "+faststart",
        outFile,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise((res, rej) =>
      ff.on("close", (code) =>
        code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)),
      ),
    );
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const buf = await shoot(page, i / FPS);
      if (!ff.stdin.write(buf))
        await new Promise((r) => ff.stdin.once("drain", r));
      if (i % 24 === 0)
        process.stdout.write(
          `\r${path.basename(outFile)} ${i}/${N} frames, ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s/frame   `,
        );
    }
    ff.stdin.end();
    await done;
    console.log(
      `\r${path.basename(outFile)}: ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s                `,
    );

    if (opt.psnr !== undefined) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loop-psnr-"));
      const k = Math.min(
        N - 1,
        Math.max(0, Math.round(num(opt.psnr, 0) * FPS)),
      );
      const src = path.join(tmp, "src.png"),
        enc = path.join(tmp, "enc.png"),
        rt = path.join(tmp, "rt.png");
      await shoot(page, k / FPS, src);
      spawnSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        outFile,
        "-vf",
        `select=eq(n\\,${k})`,
        "-fps_mode",
        "passthrough",
        "-frames:v",
        "1",
        enc,
      ]);
      spawnSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        src,
        "-vf",
        "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,scale=in_color_matrix=bt709:in_range=tv,format=rgb24",
        "-frames:v",
        "1",
        rt,
      ]);
      console.log(
        `psnr at frame ${k}: encoded file ${ffmpegPsnr(enc, src)} dB, 4:2:0 conversion alone ${ffmpegPsnr(rt, src)} dB ` +
          "(close numbers mean the encoder adds almost nothing; the gap to lossless is chroma subsampling)",
      );
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    await page.close();
    if (Math.abs(seconds - checks.loop) < 1e-6) {
      if (!qa(outFile)) exitCode = 1;
    } else console.log("seam QA skipped: the render is not one full loop");
  }
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  exitCode = 1;
} finally {
  if (errors.length)
    console.log("page errors:\n" + [...new Set(errors)].join("\n"));
  await browser.close();
  server.close();
}
process.exit(exitCode);
