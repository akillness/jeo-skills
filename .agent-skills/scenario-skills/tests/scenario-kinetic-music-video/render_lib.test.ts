import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  above1080p,
  blurRefusal,
  describeBlur,
  engineQuery,
  h264Level,
  parseArgs,
  vbvArgs,
  workerCap,
  x264Args,
} from "../../skills/scenario-kinetic-music-video/scripts/render_lib.mjs";

const GB = 2 ** 30;
// The encoder arguments render.mjs used before 4K masters, kept literally: every render at or below 1080p must match them
const before = (fps: number, crf = 16) => [
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  String(crf),
  "-pix_fmt",
  "yuv420p",
  "-r",
  String(fps),
];

describe("parseArgs", () => {
  it("reads --key value, --key=value and bare flags", () => {
    const a = parseArgs(
      "--from 2 --canvas=portrait --only a,b --force --out out/x.mp4".split(
        " ",
      ),
    );
    expect(a).toEqual({
      from: "2",
      canvas: "portrait",
      only: "a,b",
      force: true,
      out: "out/x.mp4",
    });
  });
});

describe("engineQuery", () => {
  it("carries scale, only, variant and canvas as before", () => {
    const q = engineQuery(
      { only: "intro,hud", ending: "b", canvas: "square" },
      { scale: 0.5 },
    );
    expect(String(q)).toBe(
      "scale=0.5&only=intro%2Chud&variant=b&canvas=square",
    );
  });

  it("forwards --safe for stills only, never for a render", () => {
    expect(engineQuery({ safe: true }, { scale: 1 }).has("safe")).toBe(false);
    expect(
      engineQuery({ safe: true }, { scale: 1, still: true }).get("safe"),
    ).toBe("1");
  });

  it("passes the motion-blur flags through", () => {
    const q = (a: object) => String(engineQuery(a, { scale: 1 }));
    expect(q({})).toBe("scale=1");
    expect(q({ blur: true })).toBe("scale=1&blur=on");
    expect(q({ blur: "12", shutter: "270", "blur-max": "16" })).toBe(
      "scale=1&blur=12&shutter=270&blurmax=16",
    );
    expect(q({ blur: "off" })).toBe("scale=1&blur=off");
  });

  it("keeps stills sharp unless --blur asks", () => {
    const q = (a: object) => engineQuery(a, { scale: 1, still: true });
    expect(q({}).get("blur")).toBe("off");
    expect(q({ blur: true }).get("blur")).toBe("on");
  });
});

describe("motion blur on the engine", () => {
  it("refuses a blur flag on an engine without blur, naming the files to copy", () => {
    expect(blurRefusal({ blur: true }, false)).toMatch(/^--blur: .*blur\.js/);
    // main.js imports canvas.js, which projects made before the portrait canvas lack
    expect(blurRefusal({ blur: true }, false)).toMatch(/canvas\.js/);
    expect(blurRefusal({ "blur-max": "8" }, false)).toMatch(/^--blur-max/);
    expect(blurRefusal({ blur: true }, true)).toBeNull();
    expect(blurRefusal({}, false)).toBeNull();
  });

  it("describes the blur a render uses", () => {
    expect(describeBlur(undefined)).toBeNull();
    expect(describeBlur({ on: false })).toBe("motion blur: off");
    expect(
      describeBlur({ on: true, samples: 8, shutter: 180, max: 24 }),
    ).toMatch(/8 samples over a 180 degree shutter/);
  });
});

describe("h264Level", () => {
  it.each([
    [320, 240, 10, "1.2"], // the 4-frame picture buffer, not the frame size, rules out 1.1
    [480, 270, 30, "2.1"],
    [540, 540, 30, "3"],
    [960, 540, 30, "3.1"],
    [960, 540, 60, "3.2"],
    [1920, 1080, 30, "4"],
    [1920, 1080, 60, "4.2"],
    [1080, 1920, 60, "4.2"],
    [2048, 1152, 60, "5"],
    [3840, 2160, 30, "5.1"],
    [3840, 2160, 60, "5.2"],
    [2160, 3840, 60, "5.2"],
    [3840, 2160, 120, "6"],
    [5120, 2880, 30, "6"],
  ])("%ix%i at %i fps is level %s", (w, h, fps, level) => {
    expect(h264Level(w, h, fps)).toBe(level);
  });
});

describe("x264Args", () => {
  it.each([
    [540, 540, 30],
    [960, 540, 30],
    [1080, 1920, 60],
    [1920, 1080, 60],
  ])("keeps the earlier arguments at %ix%i, %i fps", (w, h, fps) => {
    expect(above1080p(w, h)).toBe(false);
    expect(x264Args({ w, h, fps, crf: "17", scale: 1 })).toEqual(
      before(fps, 17),
    );
  });

  it("pins the level and 4 threads above 1080p", () => {
    const a = x264Args({ w: 3840, h: 2160, fps: 60, scale: 2 });
    expect(a.slice(a.indexOf("-level"), a.indexOf("-level") + 2)).toEqual([
      "-level",
      "5.2",
    ]);
    expect(a.slice(a.indexOf("-threads"), a.indexOf("-threads") + 2)).toEqual([
      "-threads",
      "4",
    ]);
  });

  it("caps the bitrate to the pinned level, peaks included", () => {
    const a = x264Args({ w: 3840, h: 2160, fps: 60, scale: 2 });
    expect(a.slice(a.indexOf("-maxrate"), a.indexOf("-maxrate") + 4)).toEqual([
      "-maxrate",
      "240000k",
      "-bufsize",
      "60000k",
    ]);
    // a second holds at most maxrate + bufsize: 300 Mb/s, what Level 5.2 High allows
    expect(vbvArgs("5")).toEqual(["-maxrate", "135000k", "-bufsize", "33750k"]);
    expect(vbvArgs("5.1")).toEqual(vbvArgs("5.2"));
  });

  it("refuses a 4K master past Level 5.2, naming what to change", () => {
    expect(() => x264Args({ w: 3840, h: 2160, fps: 120, scale: 2 })).toThrow(
      /60 fps or less/,
    );
    expect(() => x264Args({ w: 5120, h: 2880, fps: 30, scale: 2 })).toThrow(
      /smaller canvas/,
    );
  });

  it("still renders a large custom canvas at scale 1, without a level pin", () => {
    const a = x264Args({ w: 5120, h: 2880, fps: 30, scale: 1 });
    expect(a).not.toContain("-level");
    expect(a).not.toContain("-maxrate");
    expect(a).toContain("-threads");
  });
});

describe("workerCap", () => {
  it("leaves 1080p alone, the documented 3 workers included", () => {
    expect(workerCap(3, 1920, 1080, 8 * GB)).toBe(3);
    expect(workerCap(3, 1080, 1920, 8 * GB)).toBe(3);
  });

  it("fits 4K workers to memory, never below one", () => {
    expect(workerCap(3, 3840, 2160, 16 * GB)).toBe(1);
    expect(workerCap(3, 3840, 2160, 20 * GB)).toBe(2);
    expect(workerCap(3, 3840, 2160, 36 * GB)).toBe(3);
    expect(workerCap(3, 3840, 2160, 128 * GB)).toBe(3);
    expect(workerCap(5, 3840, 2160, 8 * GB)).toBe(1);
  });
});

// Real ffmpeg (CI runs 6.1 and 8.0): an x264 change on either version shows up here
const tmp = mkdtempSync(path.join(tmpdir(), "kinetic-render-lib-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const ff = (args: string[]) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], {
    maxBuffer: 1 << 28,
  });
  expect(r.status, String(r.stderr)).toBe(0);
  return r.stdout;
};
// JPEG frames through image2pipe, the way render.mjs feeds the encoder
function encode(w: number, h: number, fps: number, codec: string[]) {
  const src = path.join(tmp, `${w}x${h}_${fps}.mjpeg`);
  ff([
    "-f",
    "lavfi",
    "-i",
    `testsrc2=s=${w}x${h}:r=${fps}`,
    "-frames:v",
    "4",
    "-c:v",
    "mjpeg",
    "-f",
    "image2pipe",
    src,
  ]);
  const out = path.join(tmp, "o.mp4");
  ff([
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-c:v",
    "mjpeg",
    "-i",
    src,
    ...codec,
    out,
  ]);
  const level = spawnSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v",
    "-show_entries",
    "stream=level",
    "-of",
    "csv=p=0",
    out,
  ]);
  const stream = ff([
    "-i",
    out,
    "-map",
    "0:v",
    "-c",
    "copy",
    "-f",
    "h264",
    "-",
  ]);
  return {
    level: +String(level.stdout).trim() / 10,
    sha: createHash("sha256").update(stream).digest("hex"),
  };
}

describe("x264 on this ffmpeg", { timeout: 120000 }, () => {
  it.each([
    [540, 540, 30],
    [960, 540, 30],
    [1080, 1920, 60],
    [1920, 1080, 60],
  ])("encodes %ix%i at %i fps byte-identically to before", (w, h, fps) => {
    const old = encode(w, h, fps, before(fps));
    const now = encode(w, h, fps, x264Args({ w, h, fps, scale: 1 }));
    expect(now.sha).toBe(old.sha);
    expect(now.level).toBe(+h264Level(w, h, fps)!);
  });

  it("picks Level 5.2 at 4K60 on its own, so the pin changes no bytes", () => {
    const a = x264Args({ w: 3840, h: 2160, fps: 60, scale: 2 });
    const i = a.indexOf("-level");
    const auto = encode(3840, 2160, 60, [...a.slice(0, i), ...a.slice(i + 2)]);
    const pinned = encode(3840, 2160, 60, a);
    expect(auto.level).toBe(5.2);
    expect(pinned.sha).toBe(auto.sha);
  });
});
