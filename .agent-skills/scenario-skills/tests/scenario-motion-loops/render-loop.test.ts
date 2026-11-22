import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const scripts = fileURLToPath(
  new URL("../../skills/scenario-motion-loops/scripts/", import.meta.url),
);
const SCRIPT = path.join(scripts, "render-loop.mjs");
const TEMPLATE = path.join(scripts, "loop-template.html");
const tmp = mkdtempSync(path.join(tmpdir(), "motion-loops-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const run = (args: string[], cwd = tmp) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

// A gray sine pattern scrolling `speed` cycles per second, two cycles across the frame, encoded the
// way the script encodes. At 0.5 cycles per second a 48-frame clip at 24 fps closes exactly.
function clip(name: string, speed: number, frames: number, tagged = true) {
  const file = path.join(tmp, name);
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=gray:s=320x180:r=24,format=gray,geq=lum='128+90*sin(2*PI*(2*X/W-${speed}*T))'` +
        (tagged
          ? ",format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv"
          : ""),
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

describe("render-loop.mjs arguments", () => {
  it("prints usage on --help", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Usage:/);
  });

  it("fails with usage when called without arguments", () => {
    const r = run([]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Usage:/);
  });

  it("asks for an action", () => {
    const r = run([TEMPLATE]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/--out <file.mp4>, --check or --stills/);
  });

  it("never overwrites an existing output without --force", () => {
    const out = path.join(tmp, "exists.mp4");
    writeFileSync(out, "keep");
    const r = run([TEMPLATE, "--out", out]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Refusing to overwrite/);
    expect(readFileSync(out, "utf8")).toBe("keep");
  });

  it("refuses to write the video over the page", () => {
    const page = path.join(tmp, "page.html");
    copyFileSync(TEMPLATE, page);
    const r = run([page, "--out", page, "--force"]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/must not be the loop page/);
  });

  it("rejects a numeric option that is not a number", () => {
    for (const flag of ["--crf", "--seconds", "--samples"]) {
      const r = run([TEMPLATE, "--check", flag, "abc"]);
      expect(r.code, flag).toBe(1);
      expect(r.out, flag).toMatch(/bad value for/);
    }
  });
});

describe("render-loop.mjs --qa", () => {
  it("passes a clip whose last frame leads into its first", () => {
    const r = run(["--qa", clip("seamless.mp4", 0.5, 48)]);
    expect(r.out).toMatch(/320x180 24\/1 fps, 48 frames.*-> ok/);
    expect(r.code).toBe(0);
  }, 30000);

  it("flags a clip that jumps at the loop point", () => {
    const r = run(["--qa", clip("jump.mp4", 1 / 3, 48)]);
    expect(r.out).toMatch(/CHECK SEAM/);
    expect(r.code).toBe(1);
  }, 30000);

  it("passes a jump at the loop point with --ignore-seam", () => {
    const r = run([
      "--qa",
      "--ignore-seam",
      clip("designed-cut.mp4", 1 / 3, 48),
    ]);
    expect(r.out).toMatch(/ok \(seam jump ignored\)/);
    expect(r.code).toBe(0);
  }, 30000);

  it("still flags untagged color with --ignore-seam", () => {
    const r = run([
      "--qa",
      "--ignore-seam",
      clip("designed-cut-untagged.mp4", 1 / 3, 48, false),
    ]);
    expect(r.out).toMatch(/UNTAGGED COLOR/);
    expect(r.code).toBe(1);
  }, 30000);

  it("flags a clip without BT.709 primaries and transfer tags", () => {
    const r = run(["--qa", clip("untagged.mp4", 0.5, 48, false)]);
    expect(r.out).toMatch(/UNTAGGED COLOR/);
    expect(r.code).toBe(1);
  }, 30000);

  it("flags a last frame that repeats the first", () => {
    const r = run(["--qa", clip("duplicate.mp4", 0.5, 49)]);
    expect(r.out).toMatch(/DUPLICATE FRAME\?/);
    expect(r.code).toBe(1);
  }, 30000);
});

// The page checks and the render need Playwright and a browser, which CI does not install. Point
// MOTION_LOOPS_PLAYWRIGHT_DIR at a folder holding node_modules/playwright to run them, and set
// MOTION_LOOPS_CHANNEL=chrome to use an installed Google Chrome instead of Playwright's Chromium.
const pwDir = process.env.MOTION_LOOPS_PLAYWRIGHT_DIR;
const channel = process.env.MOTION_LOOPS_CHANNEL
  ? ["--channel", process.env.MOTION_LOOPS_CHANNEL]
  : [];
const withPlaywright =
  !!pwDir && existsSync(path.join(pwDir, "node_modules", "playwright"));

describe.skipIf(!withPlaywright)("render-loop.mjs with a browser", () => {
  const page = (name: string, edit = (s: string) => s) => {
    const file = path.join(tmp, name);
    writeFileSync(file, edit(readFileSync(TEMPLATE, "utf8")));
    return file;
  };
  const browserRun = (args: string[]) => run([...args, ...channel], pwDir);

  it("passes the template's page check", () => {
    const r = browserRun([page("ok.html"), "--check"]);
    expect(r.out).toMatch(/-> PASS/);
    expect(r.code).toBe(0);
  }, 60000);

  it("reports a period that does not divide the loop", () => {
    const f = page("seam.html", (s) =>
      s.replace(
        "phase(t, 1.5); // one grid row",
        "phase(t, 5); // one grid row",
      ),
    );
    const out = path.join(tmp, "seam.mp4");
    const r = browserRun([f, "--out", out]);
    expect(r.out).toMatch(/SEAM JUMP/);
    expect(r.out).toMatch(/not encoding seam.mp4: the page check failed/);
    expect(existsSync(out)).toBe(false);
    expect(r.code).toBe(1);
  }, 60000);

  it("reports a tile that reads Math.random", () => {
    const f = page("random.html", (s) =>
      s.replace(
        "const p = phase(t, 1.5);",
        "const p = phase(t, 1.5) + 0.2 * Math.random();",
      ),
    );
    const r = browserRun([f, "--check"]);
    expect(r.out).toMatch(/NOT DETERMINISTIC/);
    expect(r.code).toBe(1);
  }, 60000);

  it("renders a full loop that passes its own file check", () => {
    const out = path.join(tmp, "small.mp4");
    const r = browserRun([
      page("render.html"),
      "--width",
      "320",
      "--height",
      "180",
      "--samples",
      "2",
      "--out",
      out,
    ]);
    expect(r.out).toMatch(/288 frames.*bt709\/bt709\/bt709\/tv.*-> ok/s);
    expect(r.code).toBe(0);
  }, 300000);
});
