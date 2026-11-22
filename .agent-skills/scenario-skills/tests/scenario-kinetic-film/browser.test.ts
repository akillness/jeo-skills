// The film in a real browser. CI installs neither Playwright nor a browser, so this suite is opt-in:
// point KINETIC_FILM_PLAYWRIGHT_DIR at a folder holding node_modules/playwright (npm ci in
// skills/scenario-kinetic-film/assets/npm does it). It uses Google Chrome when installed, else
// Playwright's Chromium. Fonts come from KINETIC_FILM_FONTS_DIR (a folder holding fonts/) when set, or
// are downloaded by get_fonts.sh.
import { spawn, spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import http from "http";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SKILL = path.resolve(__dirname, "../../skills/scenario-kinetic-film");
const SCRIPTS = path.join(SKILL, "scripts");
const pwDir = process.env.KINETIC_FILM_PLAYWRIGHT_DIR;
const withPlaywright =
  !!pwDir && existsSync(path.join(pwDir, "node_modules", "playwright"));
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".png": "image/png",
};

function serve(dir: string): Promise<[string, http.Server]> {
  const server = http.createServer((req, res) => {
    const file = path.join(
      dir,
      decodeURIComponent(new URL(req.url!, "http://x").pathname),
    );
    if (!file.startsWith(dir) || !existsSync(file))
      return res.writeHead(404).end();
    res
      .writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      })
      .end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve([
        `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
        server,
      ]),
    ),
  );
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "kinetic-browser-"));
const servers: http.Server[] = [];
afterAll(() => {
  servers.forEach((s) => s.close());
  rmSync(tmp, { recursive: true, force: true });
});

// a film folder as new_film.sh lays it out, served on its own port
async function film(
  name: string,
  example: string,
  edit?: (dir: string) => void,
  fonts = true,
) {
  const dir = path.join(tmp, name);
  cpSync(path.join(SKILL, "assets/engine"), dir, { recursive: true });
  cpSync(path.join(SKILL, "assets/examples", example), dir, {
    recursive: true,
  });
  if (fonts)
    cpSync(path.join(tmp, "fonts-src", "fonts"), path.join(dir, "fonts"), {
      recursive: true,
    });
  edit?.(dir);
  const [url, server] = await serve(dir);
  servers.push(server);
  return { dir, url };
}

function node(script: string, args: string[], url: string) {
  return new Promise<{
    code: number | null;
    out: Buffer;
    err: string;
    ms: number;
  }>((resolve) => {
    const start = Date.now();
    const p = spawn(process.execPath, [path.join(SCRIPTS, script), ...args], {
      cwd: tmp,
      env: { ...process.env, FILM_URL: url, FILM_DIR: pwDir },
    });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (b) => out.push(b));
    p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) =>
      resolve({ code, out: Buffer.concat(out), err, ms: Date.now() - start }),
    );
  });
}

const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe.skipIf(!withPlaywright)("the film in a browser", () => {
  let tour: { dir: string; url: string };

  beforeAll(async () => {
    const src = path.join(tmp, "fonts-src");
    if (process.env.KINETIC_FILM_FONTS_DIR)
      cpSync(process.env.KINETIC_FILM_FONTS_DIR, src, { recursive: true });
    else
      expect(
        spawnSync("bash", [path.join(SCRIPTS, "get_fonts.sh"), src]).status,
      ).toBe(0);
    tour = await film("tour", "tour");
  }, 120000);

  it("info.mjs reads the tour with no problem", async () => {
    const r = await node("info.mjs", [], tour.url);
    expect(r.code, r.err).toBe(0);
    expect(r.err).toMatch(/^browser: [^\n]+\n$/);
    const info = JSON.parse(r.out.toString());
    expect(info.title).toBe("Tour");
    expect(info.dur).toBeCloseTo((148 * 60) / 172, 9);
    expect(info.endCard).toBeCloseTo((137 * 60) / 172, 9);
    expect(info.problems).toEqual([]);
    expect(info.cues.length).toBeGreaterThan(100);
    expect(info.lines).toBeGreaterThan(1000);
  }, 60000);

  it("the page requests no favicon", async () => {
    process.env.FILM_URL = tour.url;
    process.env.FILM_DIR = pwDir;
    const { launch } =
      await import("../../skills/scenario-kinetic-film/scripts/browser.mjs");
    const b = await launch();
    try {
      const pg = await b.newPage();
      // Chrome's favicon fetch raises no page request event, only this console error when it fails
      const errors: string[] = [];
      pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await pg.goto(tour.url + "index.html?render=1");
      await pg.waitForFunction(() => (window as any).__ready, null, {
        timeout: 20000,
      });
      await pg.waitForTimeout(500);
      expect(errors).toEqual([]);
    } finally {
      await b.close();
    }
  }, 60000);

  it("snap.mjs writes 1920x1080 stills at beats and seconds", async () => {
    const out = path.join(tmp, "stills");
    const r = await node("snap.mjs", [out, "1", "b1", "40"], tour.url);
    expect(r.code, r.err).toBe(0);
    expect(r.out.toString()).toMatch(/no errors/);
    expect(pngSize(readFileSync(path.join(out, "t_000.35.png")))).toEqual([
      1920, 1080,
    ]);
    expect(pngSize(readFileSync(path.join(out, "t_040.00.png")))).toEqual([
      1920, 1080,
    ]);
  }, 60000);

  it("render.mjs streams every frame's samples", async () => {
    const r = await node("render.mjs", ["0.5", "0", "3"], tour.url);
    expect(r.code, r.err).toBe(0);
    let at = 0;
    const frames: number[] = [];
    while (at < r.out.length) {
      const k = r.out.readUInt32LE(at),
        n = r.out.readUInt32LE(at + 4);
      at += 8;
      for (let j = 0; j < n; j++) {
        const len = r.out.readUInt32LE(at);
        expect(r.out.subarray(at + 4, at + 6)).toEqual(
          Buffer.from([0xff, 0xd8]),
        ); // a JPEG
        at += 4 + len;
      }
      expect(n).toBeGreaterThanOrEqual(4);
      frames.push(k);
    }
    expect(frames).toEqual([0, 1, 2]);
  }, 60000);

  it("a frame looks the same however the film was seeked before it", async () => {
    process.env.FILM_URL = tour.url;
    process.env.FILM_DIR = pwDir;
    const { launch, openFilm } =
      await import("../../skills/scenario-kinetic-film/scripts/browser.mjs");
    const b = await launch();
    const shot = async (times: number[]) => {
      const { pg } = await openFilm(b, 0.5);
      for (const t of times)
        await pg.evaluate(
          (t: number) =>
            new Promise((r) => {
              (window as any).__seek(t);
              requestAnimationFrame(r);
            }),
          t,
        );
      const png = await pg.screenshot({
        clip: { x: 0, y: 0, width: 1920, height: 1080 },
      });
      await pg.close();
      return png;
    };
    // Prompt and Rewind: DOM blocks. 3D layers (Fly, Hero) can differ by a level or two on a few
    // pixels with the GPU's tile history, which byte equality cannot tell from a real state bug.
    try {
      for (const [t, ...before] of [
        [17.0, 40, 17.6],
        [44.2, 3, 44.9],
      ])
        expect(
          (await shot([...before, t])).equals(await shot([t])),
          `t=${t}`,
        ).toBe(true);
    } finally {
      await b.close();
    }
  }, 120000);

  it("a spec error fails at once, naming the scene", async () => {
    const bad = await film("bad-style", "tour", (d) => {
      const spec = path.join(d, "spec.js");
      const text = readFileSync(spec, "utf8");
      const broken = text.replace(
        "style: 'stack', text: ['BLOCKS ON'",
        "style: 'nope', text: ['BLOCKS ON'",
      );
      expect(broken).not.toBe(text);
      writeFileSync(spec, broken);
    });
    const r = await node("info.mjs", [], bad.url);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "scene 1 (Words 0-8) shot 2: style 'nope' is not one of",
    );
    expect(r.ms).toBeLessThan(20000);
  }, 60000);

  it("a spec error that would not crash still builds no film", async () => {
    const bad = await film("bad-palette", "starter", (d) => {
      const spec = path.join(d, "spec.js");
      writeFileSync(
        spec,
        readFileSync(spec, "utf8").replace("bg: '#0D0F14'", "bg: '#fff'"),
      );
    });
    process.env.FILM_DIR = pwDir;
    const { launch } =
      await import("../../skills/scenario-kinetic-film/scripts/browser.mjs");
    const b = await launch();
    try {
      const pg = await b.newPage();
      await pg.goto(bad.url + "index.html?render=1");
      await pg.waitForFunction(() => (window as any).__ready, null, {
        timeout: 20000,
      });
      expect(await pg.evaluate(() => !!(window as any).__film)).toBe(false);
      expect(
        await pg.evaluate(() =>
          (window as any).__problems.map((p: any) => p.msg),
        ),
      ).toEqual([expect.stringContaining("palette.bg is '#fff'")]);
    } finally {
      await b.close();
    }
  }, 60000);

  it("a syntax error in spec.js fails at once", async () => {
    const bad = await film("bad-syntax", "starter", (d) =>
      writeFileSync(path.join(d, "spec.js"), "export default {"),
    );
    const r = await node("info.mjs", [], bad.url);
    expect(r.code).toBe(1);
    expect(r.err).toContain("the film did not build");
    expect(r.ms).toBeLessThan(20000);
  }, 60000);

  it("missing fonts fail at once, saying how to fetch them", async () => {
    const bare = await film("no-fonts", "starter", undefined, false);
    const r = await node("info.mjs", [], bare.url);
    expect(r.code).toBe(1);
    expect(r.err).toContain("fonts missing");
    expect(r.err).toContain("get_fonts.sh");
    expect(r.ms).toBeLessThan(20000);
  }, 60000);

  it("the Kaiju Postal spec loads before its art and music exist", async () => {
    const kaiju = await film("kaiju", "kaiju-postal");
    const r = await node("info.mjs", [], kaiju.url);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out.toString()).endCard).toBeCloseTo(
      (57 * 60) / 172,
      9,
    );
    // a key-art scene without its file names the missing file instead of rendering blank in silence
    const still = await node(
      "snap.mjs",
      [path.join(tmp, "kaiju-stills"), "0.5", "b10"],
      kaiju.url,
    );
    expect(still.code, still.err).toBe(0);
    expect(still.out.toString()).toMatch(/HTTP 404 [^"]*art\/key1\.png/);
  }, 60000);
});
