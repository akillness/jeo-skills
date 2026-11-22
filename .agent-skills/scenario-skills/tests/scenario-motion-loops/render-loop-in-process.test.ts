// render-loop.mjs runs everything at module top level, so each case re-imports it with its own
// process.argv and a process.exit that throws. Child processes would leave it unmeasured.
// Playwright is replaced by a fake whose page renders a uniform gray frame per time t: the
// page checks, the stills, the ffmpeg encode and the file QA all run for real on those frames.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const SCRIPT = fileURLToPath(
  new URL(
    "../../skills/scenario-motion-loops/scripts/render-loop.mjs",
    import.meta.url,
  ),
);
const tmp = mkdtempSync(path.join(tmpdir(), "motion-loops-in-process-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

class Exit extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

type Result = { code: number | undefined; out: string; err: string };

async function main(args: string[], cwd = tmp): Promise<Result> {
  const out: string[] = [];
  const err: string[] = [];
  const argv = process.argv;
  process.argv = [process.execPath, SCRIPT, ...args];
  const spies = [
    vi.spyOn(process, "exit").mockImplementation((c) => {
      throw new Exit(Number(c ?? 0));
    }),
    vi.spyOn(process, "cwd").mockReturnValue(cwd),
    vi
      .spyOn(console, "log")
      .mockImplementation((...a) => void out.push(a.join(" "))),
    vi
      .spyOn(console, "error")
      .mockImplementation((...a) => void err.push(a.join(" "))),
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      out.push(String(s));
      return true;
    }),
  ];
  vi.resetModules();
  let code: number | undefined;
  try {
    await import(SCRIPT);
  } catch (e) {
    if (!(e instanceof Exit)) throw e;
    code = e.code;
  } finally {
    for (const s of spies) s.mockRestore();
    process.argv = argv;
  }
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function gray(...vf: string[]) {
  return `color=c=gray:s=320x180:r=24,format=gray,${vf.join(",")}`;
}
const BT709 = "colorspace=bt709:color_primaries=bt709:color_trc=bt709";
// Same pattern as render-loop.test.ts: at 0.5 cycles per second, 48 frames at 24 fps close.
function clip(
  name: string,
  speed: number,
  frames: number,
  tags: string | null = BT709,
) {
  const file = path.join(tmp, name);
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      gray(
        `geq=lum='128+90*sin(2*PI*(2*X/W-${speed}*T))'`,
        ...(tags === null ? [] : [`format=yuv420p,setparams=${tags}:range=tv`]),
      ),
      "-frames:v",
      String(frames),
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "16",
      file,
    ],
    { encoding: "utf8" },
  );
  expect(r.status, r.stderr).toBe(0);
  return file;
}

// An 8-bit grayscale PNG filled with one value.
function png(w: number, h: number, v: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  const raw = Buffer.alloc((w + 1) * h, v);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- The fake browser ----------
type Scene = {
  loop: number;
  value: (t: number) => number;
  // Each draw shifts the frame, like a tile that keeps state between frames.
  stateful?: boolean;
  rejectsLoopEnd?: boolean;
  error?: string;
  pageErrors?: string[];
  launchError?: string;
  fetch?: string[];
};
type Seen = {
  launch: Record<string, unknown>[];
  viewports: { width: number; height: number }[];
  urls: string[];
  frames: number[][];
  fetched: { path: string; status: number; type: string; body: string }[];
};
let scene: Scene;
let seen: Seen;
const seamless = (t: number) => 128 + 60 * Math.sin((2 * Math.PI * t) / 2);
beforeEach(() => {
  scene = { loop: 2, value: seamless };
  seen = { launch: [], viewports: [], urls: [], frames: [], fetched: [] };
});

function rawGet(url: URL, p: string) {
  return new Promise<Seen["fetched"][number]>((ok, fail) => {
    http
      .get(
        { host: url.hostname, port: url.port, path: p, agent: false },
        (res) => {
          let body = "";
          res.setEncoding("latin1");
          res.on("data", (d) => (body += d));
          res.on("end", () =>
            ok({
              path: p,
              status: res.statusCode ?? 0,
              type: String(res.headers["content-type"] ?? ""),
              body,
            }),
          );
        },
      )
      .on("error", fail);
  });
}

function newPage({
  viewport,
}: {
  viewport: { width: number; height: number };
}) {
  seen.viewports.push(viewport);
  const { width, height } = viewport;
  const handlers: Record<string, ((a: unknown) => void)[]> = {};
  let current = 0;
  let draws = 0;
  const data = () =>
    new Uint8ClampedArray(width * height * 4).fill(current & 255);
  const ctx = { getImageData: () => ({ data: data() }) };
  const win: Record<string, unknown> = {};
  const doc = {
    getElementById: (id: string) =>
      id === "out" ? { width, height, getContext: () => ctx } : null,
  };
  const inPage = <T>(fn: () => T): T => {
    const g = globalThis as Record<string, unknown>;
    g.window = win;
    g.document = doc;
    try {
      return fn();
    } finally {
      delete g.window;
      delete g.document;
    }
  };
  return {
    on(event: string, fn: (a: unknown) => void) {
      (handlers[event] ??= []).push(fn);
    },
    async goto(url: string) {
      seen.urls.push(url);
      const u = new URL(url);
      const page = await rawGet(u, u.pathname);
      expect(page.status).toBe(200);
      for (const p of scene.fetch ?? []) seen.fetched.push(await rawGet(u, p));
      for (const e of scene.pageErrors ?? []) {
        for (const h of handlers.pageerror ?? []) h(new Error(e));
        for (const h of handlers.console ?? [])
          h({ type: () => "error", text: () => e });
        for (const h of handlers.console ?? [])
          h({ type: () => "log", text: () => `log ${e}` });
      }
      if (scene.error) win.__error = scene.error;
      else {
        win.__info = { loop: scene.loop };
        win.__frame = (
          t: number,
          fps: number,
          samples: number,
          shutter: number,
          wrap = true,
        ) => {
          seen.frames.push([t, fps, samples, shutter]);
          if (!wrap && t >= scene.loop && scene.rejectsLoopEnd)
            throw new Error("t out of range");
          const tt = wrap ? ((t % scene.loop) + scene.loop) % scene.loop : t;
          current = Math.round(
            scene.value(tt) + (scene.stateful ? (draws++ * 7) % 50 : 0),
          );
        };
        win.__ready = true;
      }
    },
    async waitForFunction(fn: () => unknown) {
      if (!inPage(fn)) throw new Error("timed out");
    },
    async evaluate<A, T>(fn: (a: A) => T, arg: A) {
      return inPage(() => fn(arg));
    },
    locator: (sel: string) => ({
      async screenshot(o: { path?: string }) {
        expect(sel).toBe("#out");
        const buf = png(width, height, current & 255);
        if (o.path) writeFileSync(o.path, buf);
        return buf;
      },
    }),
    async close() {},
  };
}

(globalThis as Record<string, unknown>).__motionLoopsFake = {
  chromium: {
    async launch(o: Record<string, unknown>) {
      seen.launch.push(o);
      if (scene.launchError) throw new Error(scene.launchError);
      return { newPage: async (p: never) => newPage(p), close: async () => {} };
    },
  },
};
const pwDir = path.join(tmp, "with-playwright");
const pkg = path.join(pwDir, "node_modules", "playwright");
mkdirSync(pkg, { recursive: true });
writeFileSync(path.join(pkg, "package.json"), '{"type":"commonjs"}');
writeFileSync(
  path.join(pkg, "index.js"),
  "module.exports = globalThis.__motionLoopsFake;\n",
);

function loopPage(name = "loop.html") {
  const file = path.join(pwDir, name);
  writeFileSync(file, "<!doctype html><canvas id=out></canvas>");
  return file;
}
const pw = (args: string[]) => main(args, pwDir);
const ffprobe = (file: string) =>
  JSON.parse(
    spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=width,height,nb_read_frames,r_frame_rate,pix_fmt",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ).stdout,
  ).streams[0];

// ---------- Arguments ----------
describe("arguments", () => {
  it("prints usage with exit 0 for -h and --help", async () => {
    for (const flag of ["-h", "--help"]) {
      const r = await main([flag]);
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/^Usage:/);
    }
  });

  it("prints usage with exit 1 when nothing is given", async () => {
    const r = await main([]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^Usage:/);
  });

  it("names a flag that is missing its value", async () => {
    const r = await main([loopPage(), "--out"]);
    expect(r).toMatchObject({ code: 1, err: "--out needs a value" });
  });

  it("names each numeric setting it rejects", async () => {
    const cases: [string[], string][] = [
      [["--fps", "0"], "bad value for FPS"],
      [["--width", "-4"], "bad value for W"],
      [["--height", "x"], "bad value for H"],
      [["--shutter", "0"], "bad value for SHUTTER"],
      [["--seconds", "-1"], "bad value for SECONDS"],
      [["--samples", "NaN"], "bad value for SAMPLES"],
      [["--ss", "Infinity"], "bad value for SS"],
      [["--crf", "-1"], "bad value for CRF"],
    ];
    for (const [flags, msg] of cases) {
      const r = await main([loopPage(), "--check", ...flags]);
      expect(r, flags.join(" ")).toMatchObject({ code: 1, err: msg });
    }
  });

  it("stops when ffmpeg is not on PATH", async () => {
    const saved = process.env.PATH;
    process.env.PATH = path.join(tmp, "no-tools-here");
    try {
      const r = await main([loopPage(), "--check"]);
      expect(r).toMatchObject({
        code: 1,
        err: "ffmpeg was not found on PATH.",
      });
    } finally {
      process.env.PATH = saved;
    }
  });

  it("stops on a page that does not exist", async () => {
    const missing = path.join(tmp, "missing.html");
    const r = await main([missing, "--check"]);
    expect(r).toMatchObject({ code: 1, err: `No such file: ${missing}` });
  });

  it("resolves a relative page against the working folder", async () => {
    loopPage("relative.html");
    const r = await pw(["relative.html", "--check"]);
    expect(r.code).toBe(0);
    expect(seen.urls[0]).toMatch(/\/relative\.html\?render=1&/);
  });

  it("asks for an action and shows the usage", async () => {
    const r = await main([loopPage()]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(
      /^Pass --out <file\.mp4>, --check or --stills <dir>\.\n\nUsage:/,
    );
  });

  it("refuses an output path equal to the page", async () => {
    const page = loopPage();
    const r = await main([page, "--out", page, "--force"]);
    expect(r).toMatchObject({
      code: 1,
      err: "--out must not be the loop page itself.",
    });
  });

  it("keeps an existing output unless --force is given", async () => {
    const out = path.join(tmp, "taken.mp4");
    writeFileSync(out, "keep");
    const r = await main([loopPage(), "--out", out]);
    expect(r).toMatchObject({
      code: 1,
      err: `Refusing to overwrite ${out} (use --force).`,
    });
    expect(readFileSync(out, "utf8")).toBe("keep");
  });
});

// ---------- Encoded-file QA ----------
describe("--qa", () => {
  it("reports format, color tags and loop point steps of a clean loop", async () => {
    const r = await main(["--qa", clip("seamless.mp4", 0.5, 48)]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /^seamless\.mp4: 320x180 24\/1 fps, 48 frames, 2\.00 s, [0-9.]+ Mbps, yuv420p bt709\/bt709\/bt709\/tv; loop point steps [0-9.]+, [0-9.]+ vs up to [0-9.]+ around it -> ok$/,
    );
  }, 30000);

  it("gives each failure its own verdict", async () => {
    const cases: [string, string[], string, number][] = [
      ["jump.mp4", [], "CHECK SEAM", 1],
      ["jump.mp4", ["--ignore-seam"], "ok (seam jump ignored)", 0],
      ["dup.mp4", [], "DUPLICATE FRAME?", 1],
      ["untagged.mp4", [], "UNTAGGED COLOR", 1],
      // Only the matrix is tagged: primaries and transfer are still a guess.
      ["matrix-only.mp4", [], "UNTAGGED COLOR", 1],
      // A seam step about three times the motion around it: a jump.
      ["near-jump.mp4", [], "CHECK SEAM", 1],
      // A seam step about one and a half times the motion around it: no jump.
      ["near-close.mp4", [], "ok", 0],
    ];
    clip("jump.mp4", 1 / 3, 48);
    clip("dup.mp4", 0.5, 49);
    clip("untagged.mp4", 0.5, 48, null);
    clip("matrix-only.mp4", 0.5, 48, "colorspace=bt709");
    clip("near-jump.mp4", 0.48, 48);
    clip("near-close.mp4", 0.495, 48);
    const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [name, flags, verdict, code] of cases) {
      const r = await main(["--qa", ...flags, path.join(tmp, name)]);
      expect(r.out, name).toMatch(
        new RegExp(`^${literal(name)}: .* -> ${literal(verdict)}$`),
      );
      expect(r.code, name).toBe(code);
    }
  }, 60000);

  it("checks every file even after one fails", async () => {
    const bad = path.join(tmp, "jump.mp4");
    if (!existsSync(bad)) clip("jump.mp4", 1 / 3, 48);
    const good = path.join(tmp, "seamless.mp4");
    if (!existsSync(good)) clip("seamless.mp4", 0.5, 48);
    const r = await main(["--qa", bad, good]);
    expect(r.code).toBe(1);
    expect(r.out.split("\n")).toEqual([
      expect.stringMatching(/^jump\.mp4: .*-> CHECK SEAM$/),
      expect.stringMatching(/^seamless\.mp4: .*-> ok$/),
    ]);
  }, 30000);

  it("refuses a clip too short to judge", async () => {
    const r = await main(["--qa", clip("short.mp4", 0.5, 10)]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/short\.mp4: too few frames to check \(10\)$/);
  }, 30000);

  it("reports a file ffprobe cannot read", async () => {
    const bad = path.join(tmp, "not-a-video.mp4");
    writeFileSync(bad, "text");
    const r = await main(["--qa", bad]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^ffprobe could not read .*not-a-video\.mp4: /);
  });
});

// ---------- Browser start ----------
const pwVisibleToScript = (() => {
  try {
    createRequire(SCRIPT).resolve("playwright");
    return true;
  } catch {
    return false;
  }
})();

describe("browser start", () => {
  it.skipIf(pwVisibleToScript)(
    "explains how to install Playwright when it is missing",
    async () => {
      const r = await main([loopPage(), "--check"], tmp);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(
        /^Playwright was not found\. In the folder you run this from: npm install playwright/,
      );
    },
  );

  it("passes --channel to the launch and launches headless", async () => {
    await pw([loopPage(), "--check"]);
    await pw([loopPage(), "--check", "--channel", "chrome"]);
    expect(seen.launch).toEqual([
      { headless: true },
      { headless: true, channel: "chrome" },
    ]);
  });

  it("reports only the first line of a launch failure", async () => {
    scene.launchError = "Executable doesn't exist\nlong install banner";
    const r = await pw([loopPage(), "--check"]);
    expect(r.code).toBe(1);
    expect(r.err).toBe(
      "The browser did not start: Executable doesn't exist\n" +
        "Run npx playwright install chromium in this folder, or add --channel chrome to use an installed Google Chrome.",
    );
  });
});

// ---------- Page check ----------
describe("--check", () => {
  it("passes a deterministic page whose loop closes", async () => {
    const r = await pw([loopPage(), "--check"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /^checks: loop 2 s; determinism ok; frame at 2 s vs 0 s: 0\.00 ok; seam step [0-9.]+ \(neighbors [0-9.]+, [0-9.]+; largest cycle-boundary step [0-9.]+\) ok; motion ok -> PASS$/,
    );
    // The check page is 320 px wide at the output aspect, without supersampling.
    expect(seen.viewports).toEqual([{ width: 320, height: 180 }]);
    expect(seen.urls[0]).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/loop\.html\?render=1&w=320&h=180&ss=1$/,
    );
  });

  it("keeps the output aspect for the check page", async () => {
    await pw([loopPage(), "--check", "--width", "640", "--height", "480"]);
    expect(seen.viewports).toEqual([{ width: 320, height: 240 }]);
  });

  it("samples the check frames at the requested frame rate", async () => {
    await pw([loopPage(), "--check", "--fps", "10"]);
    expect(seen.frames.every((f) => f[1] === 10 && f[2] === 1)).toBe(true);
    // The step test pairs t with t + 1/fps.
    const ts = seen.frames.map((f) => f[0]);
    expect(ts).toContainEqual(1.9);
    expect(ts).toContainEqual(0.1);
  });

  it("reports a loop whose end does not match its start", async () => {
    scene.value = (t) => 40 + 50 * t;
    const r = await pw([loopPage(), "--check"]);
    expect(r.code).toBe(1);
    const [line, hint] = r.out.split("\n");
    expect(line).toMatch(
      /determinism ok; frame at 2 s vs 0 s: 300\.00 FAIL; .* FAIL; motion ok -> SEAM JUMP$/,
    );
    expect(hint).toMatch(/^ {2}The last frame does not lead into the first\./);
  });

  it("passes a seam jump with --ignore-seam but still reports it", async () => {
    scene.value = (t) => 40 + 50 * t;
    const r = await pw([loopPage(), "--check", "--ignore-seam"]);
    expect(r.out).toMatch(/-> SEAM JUMP/);
    expect(r.code).toBe(0);
  });

  it("falls back to the step test when the tile rejects t = LOOP", async () => {
    scene.rejectsLoopEnd = true;
    const r = await pw([loopPage(), "--check"]);
    expect(r.out).toMatch(/frame at 2 s vs 0 s: n\/a; .* -> PASS$/);
    expect(r.code).toBe(0);
  });

  it("accepts a seam step no larger than an event on a cycle boundary", async () => {
    // A designed cut at 1 s is as large as the cut at the seam, so the seam is no outlier.
    scene.value = (t) => (t < 1 ? 60 : 200);
    scene.rejectsLoopEnd = true;
    const r = await pw([loopPage(), "--check"]);
    expect(r.out).toMatch(/largest cycle-boundary step 420\.00\) ok/);
    expect(r.code).toBe(0);
  });

  it("fails a seam step past twice its largest neighbor, not one below", async () => {
    // A rise and fall of 2 levels per frame, with a cut of `cut` levels at 1.2 s (not on a cycle
    // boundary) that is still there at the seam. The tile rejects t = LOOP, so only the step test
    // judges: neighbors and boundary steps are 6.00, the seam step is (2 + cut) * 3.
    scene.rejectsLoopEnd = true;
    const cases: [number, string, string, number][] = [
      [1, "9.00", "ok; motion ok -> PASS", 0],
      [3, "15.00", "FAIL; motion ok -> SEAM JUMP", 1],
    ];
    for (const [cut, seam, tail, code] of cases) {
      scene.value = (t) =>
        t < 1.2 ? 100 + 48 * Math.min(t, 2 - t) : 100 + cut + 48 * (2 - t);
      const r = await pw([loopPage(), "--check"]);
      expect(r.out.split("\n")[0], `cut ${cut}`).toBe(
        `checks: loop 2 s; determinism ok; frame at 2 s vs 0 s: n/a; seam step ${seam} ` +
          `(neighbors 6.00, 6.00; largest cycle-boundary step 6.00) ${tail}`,
      );
      expect(r.code, `cut ${cut}`).toBe(code);
    }
  });

  it("flags a page that draws a different frame for the same t", async () => {
    scene.stateful = true;
    const r = await pw([loopPage(), "--check"]);
    expect(r.code).toBe(1);
    const lines = r.out.split("\n");
    expect(lines[0]).toMatch(/determinism FAIL; .*-> NOT DETERMINISTIC$/);
    expect(lines[1]).toMatch(/^ {2}The same t gave two different frames/);
    expect(r.out).not.toMatch(/last frame does not lead/);
  });

  it("calls a page that never changes static", async () => {
    scene.value = () => 90;
    const r = await pw([loopPage(), "--check"]);
    expect(r.out).toMatch(/motion STATIC\? -> PASS$/);
    expect(r.code).toBe(0);
  });

  it("reports the page's own error and fails", async () => {
    scene.error = "no tile registered with id nope";
    const r = await pw([loopPage(), "--check"]);
    expect(r).toMatchObject({
      code: 1,
      err: "no tile registered with id nope",
    });
  });

  it("lists page and console errors once each", async () => {
    scene.pageErrors = ["boom", "boom"];
    const r = await pw([loopPage(), "--check"]);
    expect(r.out.split("page errors:\n")[1]).toBe("Error: boom\nboom");
  });

  it("appends --params to the page URL and encodes the page name", async () => {
    await pw([
      loopPage("my loop.html"),
      "--check",
      "--params",
      "?tone=light&overlay=subject.png",
    ]);
    expect(seen.urls[0]).toMatch(
      /\/my%20loop\.html\?render=1&w=320&h=180&ss=1&tone=light&overlay=subject\.png$/,
    );
  });
});

// ---------- Local server ----------
describe("page server", () => {
  it("serves the page folder only, with content types", async () => {
    mkdirSync(path.join(pwDir, "assets"), { recursive: true });
    writeFileSync(path.join(pwDir, "assets", "Logo.PNG"), "png");
    writeFileSync(path.join(pwDir, "assets", "data.bin"), "bin");
    writeFileSync(path.join(pwDir, "assets", "font.woff2"), "font");
    writeFileSync(path.join(tmp, "secret.txt"), "secret");
    scene.fetch = [
      "/favicon.ico",
      "/assets/Logo.PNG",
      "/assets/data.bin",
      "/assets/font.woff2",
      "/assets/missing.css",
      "/..%2Fsecret.txt",
    ];
    await pw([loopPage(), "--check"]);
    expect(
      seen.fetched.map(({ status, type, body }) => [status, type, body]),
    ).toEqual([
      [204, "", ""],
      [200, "image/png", "png"],
      [200, "application/octet-stream", "bin"],
      [200, "font/woff2", "font"],
      [404, "", "not found"],
      [403, "", ""],
    ]);
  });
});

// ---------- Stills ----------
describe("--stills", () => {
  it("writes one motion-blurred PNG per finite --at time", async () => {
    const dir = path.join(tmp, "stills-a", "nested");
    const r = await pw([
      loopPage(),
      "--stills",
      dir,
      "--at",
      "0,0.5,soon,1",
      "--width",
      "64",
      "--height",
      "36",
      "--samples",
      "4",
      "--shutter",
      "0.25",
      "--ss",
      "3",
    ]);
    expect(r.code).toBe(0);
    const names = ["still-0.00s.png", "still-0.50s.png", "still-1.00s.png"];
    expect(r.out).toContain(
      names.map((n) => `wrote ${path.join(dir, n)}`).join("\n"),
    );
    for (const [n, t] of [
      [names[0], 0],
      [names[1], 0.5],
      [names[2], 1],
    ] as const)
      expect(readFileSync(path.join(dir, n))).toEqual(
        png(64, 36, Math.round(seamless(t))),
      );
    expect(seen.viewports[1]).toEqual({ width: 64, height: 36 });
    expect(seen.urls[1]).toMatch(/\?render=1&w=64&h=36&ss=3$/);
    expect(seen.frames.slice(-3)).toEqual([
      [0, 24, 4, 0.25],
      [0.5, 24, 4, 0.25],
      [1, 24, 4, 0.25],
    ]);
  });

  it("defaults to stills at 0, 3, 6 and 9 seconds", async () => {
    const dir = path.join(tmp, "stills-default");
    await pw([loopPage(), "--stills", dir, "--width", "32", "--height", "18"]);
    expect(
      ["0.00", "3.00", "6.00", "9.00"].map((t) =>
        existsSync(path.join(dir, `still-${t}s.png`)),
      ),
    ).toEqual([true, true, true, true]);
  });

  it("clamps --ss below 1 to 1 rather than rejecting it", async () => {
    const dir = path.join(tmp, "stills-ss");
    const r = await pw([
      loopPage(),
      "--stills",
      dir,
      "--at",
      "0",
      "--ss",
      "0.2",
      "--width",
      "32",
      "--height",
      "18",
    ]);
    expect(r.code).toBe(0);
    expect(seen.urls[1]).toMatch(/&ss=1$/);
  });

  it("skips an existing still, writes the rest, and then refuses to encode", async () => {
    const dir = path.join(tmp, "stills-b");
    mkdirSync(dir, { recursive: true });
    const kept = path.join(dir, "still-0.00s.png");
    writeFileSync(kept, "mine");
    const out = path.join(tmp, "after-stills.mp4");
    const r = await pw([
      loopPage(),
      "--stills",
      dir,
      "--at",
      "0,1",
      "--width",
      "32",
      "--height",
      "18",
      "--out",
      out,
    ]);
    expect(r.code).toBe(1);
    expect(r.err.split("\n")).toEqual([
      `Refusing to overwrite ${kept} (use --force).`,
      "not encoding after-stills.mp4: a still was refused",
    ]);
    expect(readFileSync(kept, "utf8")).toBe("mine");
    expect(existsSync(path.join(dir, "still-1.00s.png"))).toBe(true);
    expect(existsSync(out)).toBe(false);
  });

  it("overwrites an existing still with --force", async () => {
    const dir = path.join(tmp, "stills-c");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "still-0.00s.png"), "mine");
    const r = await pw([
      loopPage(),
      "--stills",
      dir,
      "--at",
      "0",
      "--width",
      "32",
      "--height",
      "18",
      "--force",
    ]);
    expect(r.code).toBe(0);
    expect(readFileSync(path.join(dir, "still-0.00s.png"))).toEqual(
      png(32, 18, Math.round(seamless(0))),
    );
  });
});

// ---------- Render and encode ----------
describe("--out", () => {
  const small = ["--width", "64", "--height", "36", "--samples", "2"];

  it("encodes one full loop as tagged H.264 and checks the file", async () => {
    const out = path.join(tmp, "render", "deep", "loop.mp4");
    const r = await pw([loopPage(), "--out", out, ...small]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\rloop\.mp4 0\/48 frames, [0-9.]+ s\/frame/);
    expect(r.out).toMatch(/\rloop\.mp4: 48 frames in \d+ s/);
    expect(r.out).toMatch(
      /loop\.mp4: 64x36 24\/1 fps, 48 frames, 2\.00 s, .* yuv420p bt709\/bt709\/bt709\/tv; .* -> ok$/,
    );
    expect(ffprobe(out)).toMatchObject({
      width: 64,
      height: 36,
      nb_read_frames: "48",
      pix_fmt: "yuv420p",
    });
    expect(seen.urls[1]).toMatch(/\?render=1&w=64&h=36&ss=2$/);
    // Frame i is shot at i / fps with the requested blur.
    expect(seen.frames.slice(-48).map((f) => f[0])).toEqual(
      Array.from({ length: 48 }, (_, i) => i / 24),
    );
    expect(seen.frames.at(-1)?.slice(1)).toEqual([24, 2, 0.5]);
  }, 60000);

  it("renders --seconds at --fps and skips the seam check for a partial loop", async () => {
    const out = path.join(tmp, "partial.mp4");
    const r = await pw([
      loopPage(),
      "--out",
      out,
      ...small,
      "--fps",
      "12",
      "--seconds",
      "1.5",
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/partial\.mp4: 18 frames in/);
    expect(r.out).toMatch(/seam QA skipped: the render is not one full loop$/);
    expect(ffprobe(out)).toMatchObject({
      nb_read_frames: "18",
      r_frame_rate: "12/1",
    });
  }, 60000);

  it("carries --ignore-seam from the page check into the file check", async () => {
    scene.value = (t) => 40 + 50 * t;
    const out = path.join(tmp, "ramp.mp4");
    const r = await pw([loopPage(), "--out", out, ...small, "--ignore-seam"]);
    expect(r.out).toMatch(/-> SEAM JUMP\n/);
    expect(r.out).toMatch(/ramp\.mp4: .* -> ok \(seam jump ignored\)$/);
    expect(r.code).toBe(0);
  }, 60000);

  it("does not encode when the page check fails", async () => {
    scene.stateful = true;
    const out = path.join(tmp, "stateful.mp4");
    const r = await pw([loopPage(), "--out", out, ...small]);
    expect(r.code).toBe(1);
    expect(r.err).toBe("not encoding stateful.mp4: the page check failed");
    expect(existsSync(out)).toBe(false);
  });

  it("fails when ffmpeg cannot write the output", async () => {
    const out = path.join(tmp, "loop.bogus");
    const r = await pw([loopPage(), "--out", out, ...small]);
    expect(r.err).toMatch(/^ffmpeg exited [1-9]\d*$/);
    expect(r.out).not.toMatch(/frames in/);
    expect(r.code).toBe(1);
  }, 60000);

  it("replaces an existing output with --force", async () => {
    const out = path.join(tmp, "forced.mp4");
    writeFileSync(out, "old");
    const r = await pw([loopPage(), "--out", out, ...small, "--force"]);
    expect(r.code).toBe(0);
    expect(ffprobe(out)).toMatchObject({ nb_read_frames: "48" });
  }, 60000);

  it("compares a chosen frame with its lossless render, clamped to the clip", async () => {
    const out = path.join(tmp, "psnr.mp4");
    const r = await pw([loopPage(), "--out", out, ...small, "--psnr", "0.5"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /psnr at frame 12: encoded file ([0-9.]+|inf) dB, 4:2:0 conversion alone ([0-9.]+|inf) dB \(close numbers/,
    );
    const late = await pw([
      loopPage(),
      "--out",
      out,
      ...small,
      "--force",
      "--psnr",
      "99",
    ]);
    expect(late.out).toMatch(/psnr at frame 47: /);
  }, 90000);
});
