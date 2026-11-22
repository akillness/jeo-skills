import childProcess, { type ChildProcess, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { syncBuiltinESMExports } from "node:module";
import os, { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// render.mjs and still.mjs run at import time and need playwright, which CI lacks. The fake below
// stands in for the browser: each page owns a fake `window`, and the scripts' in-page callbacks run
// in Node against it, one call at a time, as each real page would run them in isolation.
const pw = vi.hoisted(() => {
  const state = {
    launches: [] as unknown[],
    urls: [] as string[],
    viewports: [] as unknown[],
    // launch, viewport and close in the order they happen, to see how many chunks run at once
    events: [] as string[],
    emit: [] as [string, unknown][],
    makeWin: (): Record<string, unknown> => ({}),
    queue: Promise.resolve() as Promise<unknown>,
    reset() {
      state.launches = [];
      state.urls = [];
      state.viewports = [];
      state.events = [];
      state.emit = [];
      state.queue = Promise.resolve();
    },
  };
  const g = globalThis as Record<string, unknown>;
  const newPage = () => {
    const handlers: Record<string, (x: unknown) => void> = {};
    const win = state.makeWin();
    const serial = (fn: () => unknown) => {
      const run = state.queue.then(() => {
        g.window = win;
        return fn();
      });
      state.queue = run.catch(() => undefined);
      return run;
    };
    return {
      on: (evt: string, cb: (x: unknown) => void) => (handlers[evt] = cb),
      goto: async (u: string) => {
        state.urls.push(u);
        for (const [evt, payload] of state.emit) handlers[evt]?.(payload);
      },
      waitForFunction: (fn: () => unknown) =>
        serial(() => {
          if (!fn()) throw new Error("page never became ready");
        }),
      evaluate: (fn: (a: unknown) => unknown, arg: unknown) =>
        serial(() => fn(arg)),
      setViewportSize: async (v: unknown) => {
        state.viewports.push(v);
        state.events.push("viewport");
      },
    };
  };
  const chromium = {
    launch: async (opts: unknown) => {
      state.launches.push(opts);
      state.events.push("launch");
      return {
        newPage: async () => newPage(),
        close: async () => void state.events.push("close"),
      };
    },
  };
  return { state, chromium };
});
vi.mock("playwright", () => ({ chromium: pw.chromium }));

const SKILL = fileURLToPath(
  new URL("../../skills/scenario-kinetic-music-video/", import.meta.url),
);
const SCRIPTS = path.join(SKILL, "scripts");
const loaders = {
  "render.mjs": () =>
    import("../../skills/scenario-kinetic-music-video/scripts/render.mjs"),
  "still.mjs": () =>
    import("../../skills/scenario-kinetic-music-video/scripts/still.mjs"),
  "serve.mjs": () =>
    import("../../skills/scenario-kinetic-music-video/scripts/serve.mjs"),
};
const hasFfmpeg = ["ffmpeg", "ffprobe"].every(
  (t) => spawnSync(t, ["-version"]).status === 0,
);

class Exit extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

let servers: http.Server[] = [];
// The scripts' ffmpeg children inherit the worker's stdio, so one left running (a timed-out test)
// keeps the whole vitest run open until CI's job timeout. afterEach kills any still alive.
const children: ChildProcess[] = [];
const realSpawn = childProcess.spawn;
let logs: string[] = [];
let errors: string[] = [];
const scratch: string[] = [];
const mkProject = () => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), "kinetic-node-")));
  scratch.push(d);
  return d;
};
afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true });
});

beforeEach(() => {
  pw.state.reset();
  servers = [];
  logs = [];
  errors = [];
  const create = http.createServer.bind(http);
  vi.spyOn(http, "createServer").mockImplementation(((...a: unknown[]) => {
    const s = (create as (...b: unknown[]) => http.Server)(...a);
    servers.push(s);
    return s;
  }) as typeof http.createServer);
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Exit(code);
  }) as typeof process.exit);
  childProcess.spawn = ((...a: Parameters<typeof realSpawn>) => {
    const c = realSpawn(...a);
    children.push(c);
    return c;
  }) as typeof realSpawn;
  syncBuiltinESMExports();
});
afterEach(async () => {
  childProcess.spawn = realSpawn;
  syncBuiltinESMExports();
  for (const c of children.splice(0))
    if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  vi.restoreAllMocks();
  await Promise.all(
    servers.map(
      (s) =>
        new Promise((r) => {
          s.close(() => r(undefined));
          s.closeAllConnections();
        }),
    ),
  );
  delete (globalThis as Record<string, unknown>).window;
});

// Runs a script the way `node tools/<name> ...args` would, from the project directory `cwd`.
async function runScript(
  name: keyof typeof loaders,
  args: string[],
  cwd: string,
) {
  vi.resetModules();
  const argv = process.argv;
  const prev = process.cwd();
  process.argv = [process.execPath, path.join(SCRIPTS, name), ...args];
  process.chdir(cwd);
  try {
    return await loaders[name]();
  } finally {
    process.argv = argv;
    process.chdir(prev);
  }
}

function get(port: number, rawPath: string) {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: rawPath }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      })
      .on("error", reject);
  });
}

describe("serve.mjs", () => {
  let port = 0;
  beforeEach(async () => {
    const { serve } = await loaders["serve.mjs"]();
    ({ port } = await serve(0));
  });

  it("listens on an ephemeral loopback port when asked for port 0", () => {
    expect(port).toBeGreaterThan(0);
    const addr = servers[0].address() as { address: string; port: number };
    expect(addr).toMatchObject({ address: "127.0.0.1", port });
  });

  it("serves files under the skill root with their type, size and no caching", async () => {
    const file = path.join(SKILL, "assets/engine/index.html");
    const r = await get(port, "/assets/engine/index.html?scale=0.5");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("text/html");
    expect(r.headers["content-length"]).toBe(String(statSync(file).size));
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body.equals(readFileSync(file))).toBe(true);
  });

  it("serves an engine page with an inline icon, so Chromium requests no /favicon.ico", async () => {
    const r = await get(port, "/assets/engine/index.html");
    expect(r.body.toString()).toMatch(/<link rel="icon" href="data:,"/);
  });

  it("maps extensions to MIME types and falls back to octet-stream", async () => {
    const cases: [string, string][] = [
      ["/assets/engine/core.js", "text/javascript"],
      ["/scripts/serve.mjs", "text/javascript"],
      ["/assets/npm/package.json", "application/json"],
      ["/SKILL.md", "application/octet-stream"],
    ];
    for (const [p, type] of cases)
      expect((await get(port, p)).headers["content-type"], p).toBe(type);
  });

  it("decodes percent-encoded paths", async () => {
    const r = await get(port, "/%53KILL.md");
    expect(r.status).toBe(200);
    expect(r.body.equals(readFileSync(path.join(SKILL, "SKILL.md")))).toBe(
      true,
    );
  });

  it("answers / with the engine page and reports missing paths as 404", async () => {
    const root = await get(port, "/");
    expect(root.status).toBe(404);
    expect(root.body.toString()).toBe("404 /engine/index.html");
    const missing = await get(port, "/nope/file.js");
    expect(missing.status).toBe(404);
    expect(missing.body.toString()).toBe("404 /nope/file.js");
  });

  it("refuses a directory as 404", async () => {
    expect((await get(port, "/assets/engine")).status).toBe(404);
  });

  it("refuses an encoded path that climbs out of the root", async () => {
    const r = await get(port, "/" + ["..", "..", "package.json"].join("%2F"));
    expect(r.status).toBe(403);
    expect(r.body.length).toBe(0);
  });

  it("refuses a sibling directory whose name extends the root's", async () => {
    const sibling = path.basename(SKILL) + "-old";
    const r = await get(
      port,
      "/" + encodeURIComponent(`../${sibling}/secret.txt`),
    );
    expect(r.status).toBe(403);
    expect(r.body.length).toBe(0);
  });

  // Called directly: over a socket, a throw would be an uncaught exception that ends the test worker.
  it("answers a malformed percent-encoding with 400", () => {
    const handler = servers[0].listeners("request")[0] as (
      req: unknown,
      rsp: unknown,
    ) => void;
    const rsp = { writeHead: vi.fn(), end: vi.fn() };
    expect(() => handler({ url: "/%E0%A4%A" }, rsp)).not.toThrow();
    expect(rsp.writeHead).toHaveBeenCalledWith(400);
    expect(rsp.end).toHaveBeenCalledOnce();
  });

  // Called directly for the same reason: fs.stat throws synchronously on a NUL byte.
  it("answers an encoded NUL byte with 400", () => {
    const handler = servers[0].listeners("request")[0] as (
      req: unknown,
      rsp: unknown,
    ) => void;
    const rsp = { writeHead: vi.fn(), end: vi.fn() };
    expect(() => handler({ url: "/SKILL.md%00.png" }, rsp)).not.toThrow();
    expect(rsp.writeHead).toHaveBeenCalledWith(400);
    expect(rsp.end).toHaveBeenCalledOnce();
  });

  it("serves on the port given on the command line when run directly", async () => {
    await runScript("serve.mjs", ["0"], SKILL);
    const line = logs.find((l) => l.startsWith("serving on"));
    const cliPort = Number(line?.split(" ")[2]);
    expect(cliPort).toBeGreaterThan(0);
    expect(cliPort).not.toBe(port);
    expect((await get(cliPort, "/SKILL.md")).status).toBe(200);
  });
});

const engineWindow = (
  extra: Record<string, unknown>,
): Record<string, unknown> => ({
  __ready: true,
  __error: null,
  E: { W: 64, H: 48 },
  ...extra,
});

function query(u: string) {
  const url = new URL(u);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.pathname).toBe("/engine/index.html");
  return Object.fromEntries(url.searchParams);
}

describe("render.mjs gates", () => {
  it("keeps an existing output unless --force", async () => {
    const cwd = mkProject();
    mkdirSync(path.join(cwd, "out"));
    writeFileSync(path.join(cwd, "out/clip.mp4"), "previous");
    await expect(
      runScript("render.mjs", ["--to", "1", "--out", "out/clip.mp4"], cwd),
    ).rejects.toEqual(new Exit(1));
    expect(errors).toEqual(["out/clip.mp4 exists; pass --force to replace it"]);
    expect(readFileSync(path.join(cwd, "out/clip.mp4"), "utf8")).toBe(
      "previous",
    );
    expect(pw.state.launches).toEqual([]);
  });

  it("stops on an engine error before encoding anything", async () => {
    const cwd = mkProject();
    pw.state.makeWin = () =>
      engineWindow({ __ready: false, __error: "timeline.js: bad scene" });
    await expect(
      runScript("render.mjs", ["--to", "1", "--out", "out/clip.mp4"], cwd),
    ).rejects.toThrow("timeline.js: bad scene");
    expect(readdirSync(path.join(cwd, "out"))).toEqual([]);
  });

  it("refuses a motion-blur flag on an engine that predates blur", async () => {
    const cwd = mkProject();
    pw.state.makeWin = () => engineWindow({});
    await expect(
      runScript(
        "render.mjs",
        ["--to", "1", "--shutter", "90", "--out", "out/clip.mp4"],
        cwd,
      ),
    ).rejects.toThrow(
      /^--shutter: this project's engine predates motion blur; copy main\.js, blur\.js/,
    );
    expect(readdirSync(path.join(cwd, "out"))).toEqual([]);
  });

  it("refuses a 4K master whose frame is past Level 5.2, before encoding", async () => {
    const cwd = mkProject();
    pw.state.makeWin = () => engineWindow({ E: { W: 7680, H: 4320 } });
    await expect(
      runScript(
        "render.mjs",
        ["--to", "1", "--scale", "2", "--out", "out/clip.mp4"],
        cwd,
      ),
    ).rejects.toThrow(
      "7680x4320 is larger than H.264 Level 5.2 allows (4K is 3840x2160): use a smaller canvas or --scale",
    );
    expect(query(pw.state.urls[0])).toEqual({ scale: "2" });
    expect(readdirSync(path.join(cwd, "out"))).toEqual([]);
  });
});

describe.skipIf(!hasFfmpeg)("render.mjs encoding", () => {
  let jpegs: Buffer[] = [];
  let big: Buffer | null = null;
  let useBig = false;
  let engine: Record<string, unknown> = {};
  // frame -> the stale clip the engine reports when that frame's blur falls back to sharp
  let sharp: Record<number, string> = {};
  const frames: [number, number][] = [];
  const grabs: unknown[][] = [];

  beforeAll(() => {
    // 30 flat frames, each 8 levels brighter than the last, so decoded order shows chunk order.
    const dir = mkProject();
    const r = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x48:r=10,format=gray,geq=lum='16+8*N'",
      "-frames:v",
      "30",
      "-c:v",
      "mjpeg",
      "-q:v",
      "2",
      path.join(dir, "f%03d.jpg"),
    ]);
    expect(r.status, String(r.stderr)).toBe(0);
    jpegs = Array.from({ length: 30 }, (_, i) =>
      readFileSync(path.join(dir, `f${String(i + 1).padStart(3, "0")}.jpg`)),
    );
    // Noise defeats JPEG compression, so one frame overflows the ffmpeg stdin buffer.
    const n = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=640x480,format=gray,geq=lum='random(1)*255'",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      path.join(dir, "big.jpg"),
    ]);
    expect(n.status, String(n.stderr)).toBe(0);
    big = readFileSync(path.join(dir, "big.jpg"));
    expect(big.length).toBeGreaterThan(65536);
  });

  beforeEach(() => {
    frames.length = 0;
    grabs.length = 0;
    useBig = false;
    engine = {};
    sharp = {};
    pw.state.makeWin = () => {
      const win: Record<string, unknown> = engineWindow(engine);
      win.renderFrame = async (f: number, fps: number) => {
        frames.push([f, fps]);
        win.cur = f;
        if (f in sharp)
          ((win.__blurFallbacks ??= []) as unknown[]).push([f, sharp[f]]);
      };
      win.grab = async (...a: unknown[]) => {
        grabs.push(a);
        return new Uint8Array(useBig && big ? big : jpegs[win.cur as number]);
      };
      return win;
    };
  });

  function project(master = "audio/master.wav", duration = 2) {
    const cwd = mkProject();
    mkdirSync(path.join(cwd, "engine/data"), { recursive: true });
    mkdirSync(path.join(cwd, "audio"));
    writeFileSync(
      path.join(cwd, "engine/data/audio.json"),
      JSON.stringify({ duration, master }),
    );
    // Silent for the first second, then a tone: a render from 1 s carries sound only when the mux
    // seeks the master to the render's start.
    const r = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc='if(gte(t,1),0.5*sin(2*PI*440*t),0)':s=44100:d=3",
      path.join(cwd, "audio/master.wav"),
    ]);
    expect(r.status, String(r.stderr)).toBe(0);
    return cwd;
  }

  function probe(file: string) {
    const r = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,nb_read_frames",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(r.stdout).streams as Record<string, unknown>[];
  }

  function brightness(file: string) {
    const r = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      file,
      "-an",
      "-fps_mode",
      "passthrough",
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ]);
    expect(r.status, String(r.stderr)).toBe(0);
    return [...r.stdout];
  }

  function peakDb(file: string) {
    const r = spawnSync(
      "ffmpeg",
      ["-hide_banner", "-nostats", "-i", file, "-map", "0:a", "-af"].concat([
        "volumedetect",
        "-f",
        "null",
        "-",
      ]),
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
    return Number(/max_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1]);
  }

  it("splits the song's frames across workers and muxes them in order with the audio", async () => {
    const cwd = project();
    pw.state.emit = [
      ["console", { type: () => "error", text: () => "shader failed" }],
      ["console", { type: () => "warning", text: () => "slow frame" }],
      ["console", { type: () => "log", text: () => "chatter" }],
      ["pageerror", new Error("boom")],
    ];
    await runScript(
      "render.mjs",
      [
        "--from",
        "1",
        "--fps",
        "10",
        "--workers",
        "3",
        "--crf",
        "20",
        "--out",
        "out/clip.mp4",
        "--only",
        "intro,drop",
        "--variant=b",
        "--canvas",
        "portrait",
      ],
      cwd,
    );

    const want = Array.from({ length: 10 }, (_, i) => 10 + i);
    expect(frames.map(([f]) => f).sort((a, b) => a - b)).toEqual(want);
    expect(frames.every(([, fps]) => fps === 10)).toBe(true);
    expect(grabs.every((a) => a[0] === "image/jpeg")).toBe(true);
    expect(pw.state.launches).toHaveLength(3);
    expect(pw.state.launches[0]).toMatchObject({
      channel: "chrome",
      headless: true,
    });
    for (const u of pw.state.urls)
      expect(query(u)).toEqual({
        scale: "1",
        only: "intro,drop",
        variant: "b",
        canvas: "portrait",
      });
    expect(pw.state.viewports).toEqual(
      Array(3).fill({ width: 64, height: 48 }),
    );

    const out = path.join(cwd, "out/clip.mp4");
    expect(readdirSync(path.join(cwd, "out"))).toEqual(["clip.mp4"]);
    const streams = probe(out);
    expect(streams).toEqual([
      expect.objectContaining({
        codec_type: "video",
        codec_name: "h264",
        width: 64,
        height: 48,
        nb_read_frames: "10",
      }),
      expect.objectContaining({ codec_type: "audio", codec_name: "aac" }),
    ]);
    const y = brightness(out);
    expect(y).toHaveLength(10);
    for (let i = 1; i < y.length; i++) expect(y[i]).toBeGreaterThan(y[i - 1]);
    expect(readFileSync(out).includes("crf=20.0")).toBe(true);
    expect(peakDb(out)).toBeGreaterThan(-20);

    expect(logs).toContain("[w0] error: shader failed");
    expect(logs).toContain("[w2] warning: slow frame");
    expect(logs).toContain("[w1] pageerror: boom");
    expect(logs.some((l) => l.includes("chatter"))).toBe(false);
    expect(logs.some((l) => l.startsWith("motion blur"))).toBe(false);
    expect(logs.some((l) => l.startsWith("note:"))).toBe(false);
    expect(logs.at(-1)).toBe("wrote out/clip.mp4 (10 frames)");
  });

  it("skips idle workers and leaves audio out with --noaudio", async () => {
    const cwd = project();
    await runScript(
      "render.mjs",
      [
        "--to",
        "0.3",
        "--fps",
        "10",
        "--workers",
        "4",
        "--noaudio",
        "--ending",
        "alt",
        "--out",
        "out/short.mp4",
      ],
      cwd,
    );
    expect(pw.state.launches).toHaveLength(3);
    expect(query(pw.state.urls[0])).toEqual({ scale: "1", variant: "alt" });
    const out = path.join(cwd, "out/short.mp4");
    expect(probe(out)).toEqual([
      expect.objectContaining({ codec_type: "video", nb_read_frames: "3" }),
    ]);
    expect(readFileSync(out).includes("crf=16.0")).toBe(true);
  });

  it("replaces an existing output with --force", async () => {
    const cwd = project();
    mkdirSync(path.join(cwd, "out"));
    writeFileSync(path.join(cwd, "out/clip.mp4"), "previous");
    await runScript(
      "render.mjs",
      [
        "--to",
        "0.2",
        "--fps",
        "10",
        "--noaudio",
        "--force",
        "--out",
        "out/clip.mp4",
      ],
      cwd,
    );
    expect(probe(path.join(cwd, "out/clip.mp4"))[0]).toMatchObject({
      nb_read_frames: "2",
    });
  });

  it("waits for ffmpeg to drain frames larger than its input buffer", async () => {
    const cwd = project();
    useBig = true;
    await runScript(
      "render.mjs",
      ["--to", "0.3", "--fps", "10", "--noaudio", "--out", "out/big.mp4"],
      cwd,
    );
    expect(probe(path.join(cwd, "out/big.mp4"))).toEqual([
      expect.objectContaining({
        width: 640,
        height: 480,
        nb_read_frames: "3",
      }),
    ]);
  });

  it("fails naming the chunk when its encode fails", async () => {
    const cwd = project();
    mkdirSync(path.join(cwd, "out/clip.part0.mp4"), { recursive: true });
    await expect(
      runScript(
        "render.mjs",
        ["--to", "0.1", "--fps", "10", "--out", "out/clip.mp4"],
        cwd,
      ),
    ).rejects.toThrow(
      /^ffmpeg chunk encode failed \(exit \d+\): out\/clip\.part0\.mp4$/,
    );
    expect(existsSync(path.join(cwd, "out/clip.mp4"))).toBe(false);
  });

  it("keeps the chunks for inspection when the mux fails", async () => {
    const cwd = project("audio/missing.wav");
    await expect(
      runScript(
        "render.mjs",
        ["--to", "0.2", "--fps", "10", "--out", "out/clip.mp4"],
        cwd,
      ),
    ).rejects.toEqual(new Exit(1));
    expect(errors).toEqual([
      expect.stringMatching(
        /^ffmpeg mux failed \(exit \d+\); chunk files kept for inspection$/,
      ),
    ]);
    const list = readFileSync(path.join(cwd, "out/clip.mp4.txt"), "utf8");
    expect(list).toBe(`file '${path.resolve(cwd, "out/clip.part0.mp4")}'`);
    expect(probe(path.join(cwd, "out/clip.part0.mp4"))[0].nb_read_frames).toBe(
      "2",
    );
  });

  it("passes the blur flags, names the blur once and lists the frames it rendered sharp", async () => {
    const cwd = project();
    engine = {
      E: { W: 64, H: 48, blur: { on: true, samples: 8, shutter: 90, max: 16 } },
    };
    sharp = { 4: "drop", 1: "intro" };
    await runScript(
      "render.mjs",
      [
        "--to",
        "0.6",
        "--fps",
        "10",
        "--workers",
        "2",
        "--noaudio",
        "--blur",
        "--shutter",
        "90",
        "--blur-max",
        "16",
        "--out",
        "out/blur.mp4",
      ],
      cwd,
    );
    for (const u of pw.state.urls)
      expect(query(u)).toEqual({
        scale: "1",
        blur: "on",
        shutter: "90",
        blurmax: "16",
      });
    expect(logs.filter((l) => l.startsWith("motion blur"))).toEqual([
      "motion blur: 8 samples over a 90 degree shutter, up to 16 in fast windows",
      "motion blur: 2 frames rendered sharp, because a sample drew a clip prepare() had not advanced (a cut inside a scene): 1 (intro), 4 (drop). Register those cuts with E.cut(t) in load().",
    ]);
    expect(logs.at(-1)).toBe("wrote out/blur.mp4 (6 frames)");
  });

  it("counts a single sharp frame in the singular", async () => {
    const cwd = project();
    engine = { E: { W: 64, H: 48, blur: { on: false } } };
    sharp = { 2: "verse" };
    await runScript(
      "render.mjs",
      ["--to", "0.3", "--fps", "10", "--noaudio", "--out", "out/one.mp4"],
      cwd,
    );
    expect(logs.filter((l) => l.startsWith("motion blur"))).toEqual([
      "motion blur: off",
      "motion blur: 1 frame rendered sharp, because a sample drew a clip prepare() had not advanced (a cut inside a scene): 2 (verse). Register those cuts with E.cut(t) in load().",
    ]);
  });

  it("pins the 4K master's level and bitrate, running chunk 0 alone until it knows the frame size", async () => {
    const cwd = project();
    engine = { E: { W: 3840, H: 2160 } };
    vi.spyOn(os, "totalmem").mockReturnValue(1024 * 2 ** 30);
    await runScript(
      "render.mjs",
      [
        "--to",
        "0.3",
        "--fps",
        "10",
        "--workers",
        "3",
        "--scale",
        "2",
        "--noaudio",
        "--out",
        "out/master.mp4",
      ],
      cwd,
    );
    expect(query(pw.state.urls[0])).toEqual({ scale: "2" });
    // the other chunks launch only once chunk 0 has sized its page, then run alongside it
    expect(pw.state.events.slice(0, 4)).toEqual([
      "launch",
      "viewport",
      "launch",
      "launch",
    ]);
    expect(logs.some((l) => l.includes("lowered"))).toBe(false);
    expect(logs.some((l) => l.startsWith("note:"))).toBe(false);
    const out = path.join(cwd, "out/master.mp4");
    expect(probe(out)[0]).toMatchObject({ nb_read_frames: "3" });
    const level = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=level", "-of", "csv=p=0", out],
      { encoding: "utf8" },
    );
    expect(level.stdout.trim()).toBe("51");
    const sei = readFileSync(out);
    expect(sei.includes("vbv_maxrate=240000")).toBe(true);
    expect(sei.includes("vbv_bufsize=60000")).toBe(true);
  });

  it("lowers 4K workers to what memory holds, keeping the chunks of --workers", async () => {
    const cwd = project();
    engine = { E: { W: 3840, H: 2160 } };
    vi.spyOn(os, "totalmem").mockReturnValue(16 * 2 ** 30);
    await runScript(
      "render.mjs",
      [
        "--to",
        "0.3",
        "--fps",
        "10",
        "--workers",
        "3",
        "--scale",
        "2",
        "--noaudio",
        "--out",
        "out/master.mp4",
      ],
      cwd,
    );
    expect(logs).toContain(
      "--scale 2: 3 workers lowered to 1 at once (16 GB RAM, about 6.5 GB per worker)",
    );
    expect(pw.state.events).toEqual(
      Array(3).fill(["launch", "viewport", "close"]).flat(),
    );
    expect(frames.map(([f]) => f).sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(probe(path.join(cwd, "out/master.mp4"))[0].nb_read_frames).toBe("3");
  });

  it("renders a canvas past Level 5.2 at scale 1 without a level, saying so", async () => {
    const cwd = project();
    engine = { E: { W: 7680, H: 4320 } };
    await runScript(
      "render.mjs",
      ["--to", "0.2", "--fps", "10", "--noaudio", "--out", "out/big.mp4"],
      cwd,
    );
    expect(logs).toContain(
      "note: 7680x4320 is larger than H.264 Level 5.2 allows (4K is 3840x2160): use a smaller canvas or --scale; rendering anyway",
    );
    const sei = readFileSync(path.join(cwd, "out/big.mp4"));
    expect(sei.includes("vbv_maxrate")).toBe(false);
    expect(sei.includes("threads=4")).toBe(true);
  });

  it("writes an --out that is not .mp4, with chunks named from its stem", async () => {
    const cwd = project();
    await runScript(
      "render.mjs",
      ["--to", "0.2", "--fps", "10", "--noaudio", "--out", "out/clip.mov"],
      cwd,
    );
    expect(logs).toContain("wrote out/clip.mov (2 frames)");
    expect(probe(path.join(cwd, "out/clip.mov"))[0].nb_read_frames).toBe("2");
    expect(existsSync(path.join(cwd, "out/clip.part0.mp4"))).toBe(false);
  });
});

describe("still.mjs", () => {
  const frames: [number, number][] = [];
  // Over 0x8000 bytes, so the page's chunked base64 encoder runs more than one chunk.
  const png = (f: number) =>
    Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7 + f) & 255));

  beforeEach(() => {
    frames.length = 0;
    pw.state.makeWin = () => {
      const win: Record<string, unknown> = engineWindow({});
      win.renderFrame = async (f: number, fps: number) => {
        frames.push([f, fps]);
        win.cur = f;
      };
      win.grab = async (type: string) => {
        expect(type).toBe("image/png");
        return new Uint8Array(png(win.cur as number));
      };
      return win;
    };
  });

  it("writes one PNG per --t time with the frame the engine drew", async () => {
    const cwd = mkProject();
    await runScript(
      "still.mjs",
      [
        "--t",
        "1.5,2",
        "--fps",
        "30",
        "--dir",
        "shots",
        "--scale",
        "0.25",
        "--only",
        "verse",
        "--variant",
        "b",
        "--canvas=1080x1350",
        "--safe",
      ],
      cwd,
    );
    expect(frames).toEqual([
      [45, 30],
      [60, 30],
    ]);
    expect(readdirSync(path.join(cwd, "shots")).sort()).toEqual([
      "t_0001.50.png",
      "t_0002.00.png",
    ]);
    expect(readFileSync(path.join(cwd, "shots/t_0001.50.png"))).toEqual(
      png(45),
    );
    expect(readFileSync(path.join(cwd, "shots/t_0002.00.png"))).toEqual(
      png(60),
    );
    expect(query(pw.state.urls[0])).toEqual({
      scale: "0.25",
      only: "verse",
      variant: "b",
      canvas: "1080x1350",
      safe: "1",
      blur: "off",
    });
    expect(pw.state.viewports).toEqual([{ width: 64, height: 48 }]);
    expect(logs.at(-1)).toBe("shots/t_0001.50.png\nshots/t_0002.00.png");
  });

  it("steps a --range at 60 fps into out/stills by default", async () => {
    const cwd = mkProject();
    pw.state.emit = [
      ["console", { type: () => "error", text: () => "missing font" }],
      ["console", { type: () => "warning", text: () => "ignored" }],
      ["pageerror", new Error("boom")],
    ];
    await runScript("still.mjs", ["--range", "0:1:0.5", "--ending", "x"], cwd);
    expect(frames).toEqual([
      [0, 60],
      [30, 60],
      [60, 60],
    ]);
    expect(readdirSync(path.join(cwd, "out/stills")).sort()).toEqual([
      "t_0000.00.png",
      "t_0000.50.png",
      "t_0001.00.png",
    ]);
    expect(query(pw.state.urls[0])).toEqual({
      scale: "0.5",
      variant: "x",
      blur: "off",
    });
    expect(logs).toContain("console.error: missing font");
    expect(logs).toContain("pageerror: boom");
    expect(logs.some((l) => l.includes("ignored"))).toBe(false);
  });

  it("exits 1 with the engine's error", async () => {
    const cwd = mkProject();
    pw.state.makeWin = () => engineWindow({ __error: "scene.js: no plate" });
    await expect(runScript("still.mjs", ["--t", "1"], cwd)).rejects.toEqual(
      new Exit(1),
    );
    expect(logs).toContain("scene.js: no plate");
  });

  it("blurs a still only when --blur asks, on an engine with blur", async () => {
    const cwd = mkProject();
    const make = pw.state.makeWin;
    pw.state.makeWin = () => {
      const win = make();
      win.E = { W: 64, H: 48, blur: { on: true } };
      return win;
    };
    await runScript(
      "still.mjs",
      ["--t", "1", "--blur", "4", "--shutter", "270"],
      cwd,
    );
    expect(query(pw.state.urls[0])).toEqual({
      scale: "0.5",
      blur: "4",
      shutter: "270",
    });
    expect(frames).toEqual([[60, 60]]);
  });

  it("exits 1 when --blur meets an engine that predates blur", async () => {
    const cwd = mkProject();
    await expect(
      runScript("still.mjs", ["--t", "1", "--blur"], cwd),
    ).rejects.toEqual(new Exit(1));
    expect(logs).toEqual([
      expect.stringMatching(
        /^--blur: this project's engine predates motion blur; copy main\.js/,
      ),
    ]);
    expect(frames).toEqual([]);
  });

  it("exits 1 naming the missing Python environment when --sheet has no .venv", async () => {
    const cwd = mkProject();
    await expect(
      runScript("still.mjs", ["--t", "1", "--sheet", "contact"], cwd),
    ).rejects.toEqual(new Exit(1));
    expect(errors).toEqual([
      "--sheet: cannot run .venv/bin/python (ENOENT): scaffold.sh creates the project's Python environment there. The stills are in out/stills.",
    ]);
    expect(existsSync(path.join(cwd, "out/stills/t_0001.00.png"))).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "builds a --sheet from this run's stills with the project's Python, filtering objc noise",
    async () => {
      const cwd = mkProject();
      mkdirSync(path.join(cwd, ".venv/bin"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".venv/bin/python"),
        '#!/bin/sh\necho "$@"\necho "objc[1]: Class X is implemented in both" >&2\necho "sheet warning" >&2\n',
        { mode: 0o755 },
      );
      await runScript("still.mjs", ["--t", "1,2", "--sheet", "contact"], cwd);
      const sheet = logs.find((l) => l.startsWith("tools/sheet.py"));
      expect(sheet).toBe(
        "tools/sheet.py out/stills/contact.jpg 4 out/stills/t_0001.00.png out/stills/t_0002.00.png --force\n sheet warning\n",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "exits 1 when sheet.py fails, so an older sheet never passes for this run's",
    async () => {
      const cwd = mkProject();
      mkdirSync(path.join(cwd, ".venv/bin"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".venv/bin/python"),
        '#!/bin/sh\necho "ZeroDivisionError" >&2\nexit 3\n',
        { mode: 0o755 },
      );
      await expect(
        runScript("still.mjs", ["--t", "1", "--sheet", "contact"], cwd),
      ).rejects.toEqual(new Exit(1));
      expect(errors).toEqual([
        "--sheet: sheet.py failed (exit 3); no new sheet. The stills are in out/stills.",
      ]);
      expect(existsSync(path.join(cwd, "out/stills/t_0001.00.png"))).toBe(true);
    },
  );
});
