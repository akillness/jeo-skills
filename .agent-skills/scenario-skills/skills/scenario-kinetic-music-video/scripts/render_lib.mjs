// Pure helpers for render.mjs and still.mjs: flags, the engine URL, H.264 levels, encoder arguments, workers per memory.

// --key value, --key=value and bare --flag (true); values may hold spaces
export function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .join(" ")
      .split("--")
      .filter(Boolean)
      .map((s) => {
        const [k, ...v] = s.trim().split(" ");
        const eq = k.indexOf("=");
        return eq > 0
          ? [k.slice(0, eq), k.slice(eq + 1) || true]
          : [k, v.join(" ") || true];
      }),
  );
}

// The engine page's query. `still` is for still.mjs: it may outline the safe band (a delivery render never does), and
// its stills stay sharp unless --blur asks for motion blur.
export function engineQuery(args, { scale, still = false }) {
  const q = new URLSearchParams({ scale: String(scale) });
  if (args.only) q.set("only", args.only);
  if (args.variant || args.ending)
    q.set("variant", args.variant || args.ending);
  if (args.canvas) q.set("canvas", args.canvas);
  if (still && args.safe) q.set("safe", "1");
  if (args.blur !== undefined)
    q.set("blur", args.blur === true ? "on" : String(args.blur));
  else if (still) q.set("blur", "off");
  if (args.shutter !== undefined) q.set("shutter", String(args.shutter));
  if (args["blur-max"] !== undefined)
    q.set("blurmax", String(args["blur-max"]));
  return q;
}

// Why a motion-blur flag cannot run on this project's engine, or null
export function blurRefusal(args, engineHasBlur) {
  const asked = ["blur", "shutter", "blur-max"].filter(
    (k) => args[k] !== undefined,
  );
  if (!asked.length || engineHasBlur) return null;
  return `--${asked[0]}: this project's engine predates motion blur; copy main.js, blur.js, canvas.js, core.js, plate.js, typekit.js and scenes/hud.js from the skill's assets/engine into engine/ first`;
}

// One line on the blur a render uses
export const describeBlur = (b) =>
  b == null
    ? null
    : b.on
      ? `motion blur: ${b.samples} samples over a ${b.shutter} degree shutter, up to ${b.max} in fast windows`
      : "motion blur: off";

const mbs = (w, h) => Math.ceil(w / 16) * Math.ceil(h / 16);
// H.264 Table A-1: [level, max macroblocks per second, per frame, decoded picture buffer, MaxBR in kb/s (Main; High
// allows 1.25x)]
const LEVELS = [
  ["1", 1485, 99, 396, 64],
  ["1.1", 3000, 396, 900, 192],
  ["1.2", 6000, 396, 2376, 384],
  ["1.3", 11880, 396, 2376, 768],
  ["2", 11880, 396, 2376, 2000],
  ["2.1", 19800, 792, 4752, 4000],
  ["2.2", 20250, 1620, 8100, 4000],
  ["3", 40500, 1620, 8100, 10000],
  ["3.1", 108000, 3600, 18000, 14000],
  ["3.2", 216000, 5120, 20480, 20000],
  ["4", 245760, 8192, 32768, 20000],
  ["4.1", 245760, 8192, 32768, 50000],
  ["4.2", 522240, 8704, 34816, 50000],
  ["5", 589824, 22080, 110400, 135000],
  ["5.1", 983040, 36864, 184320, 240000],
  ["5.2", 2073600, 36864, 184320, 240000],
  ["6", 4177920, 139264, 696320, 240000],
  ["6.1", 8355840, 139264, 696320, 480000],
  ["6.2", 16711680, 139264, 696320, 800000],
];
// x264 medium keeps 4 frames in the buffer and caps each side at sqrt(8 * max frame size)
const fits = ([, mbps, fs, dpb], w, h, fps) => {
  const n = mbs(w, h);
  const side = Math.max(Math.ceil(w / 16), Math.ceil(h / 16));
  return n <= fs && side * side <= 8 * fs && n * fps <= mbps && 4 * n <= dpb;
};

// The lowest level x264 medium signals for this size and rate, or null past 6.2
export function h264Level(w, h, fps) {
  return LEVELS.find((l) => fits(l, w, h, fps))?.[0] ?? null;
}

// 1920x1080 and 1080x1920 are 8160 macroblocks; anything larger is a 4K-class frame
export const above1080p = (w, h) => mbs(w, h) > mbs(1920, 1080);
const MAX = LEVELS.find(([l]) => l === "5.2");

// The pinned level's bitrate as a VBV cap. CRF alone has no ceiling: grain over footage at CRF 17 peaked at 296.6 of
// Level 5.2's 300 Mb/s. The Main MaxBR is 80% of what High allows, and a buffer of a quarter of it keeps every
// one-second window within the High limit, the peak delivery_check.py measures.
export function vbvArgs(level) {
  const br = LEVELS.find(([l]) => l === level)[4];
  return ["-maxrate", `${br}k`, "-bufsize", `${br / 4}k`];
}

// Encoder arguments for one chunk. At or below 1080p they are exactly the ones every earlier render used, so those files
// stay byte-identical. Above it the level is pinned (a slower preset or a later x264 would signal more than 4K60 players
// decode), its bitrate caps the encode, and x264 keeps to 4 threads (about 1.8 GB at 4K instead of 3.2).
export function x264Args({ w, h, fps, crf = 16, scale = 1 }) {
  const head = ["-c:v", "libx264", "-preset", "medium", "-crf", String(crf)];
  const tail = ["-pix_fmt", "yuv420p", "-r", String(fps)];
  if (!above1080p(w, h)) return [...head, ...tail];
  const level = h264Level(w, h, fps);
  const ok = fits(MAX, w, h, fps);
  if (!ok && scale > 1) throw new Error(levelProblem(w, h, fps));
  const pin = ok ? ["-level", level, ...vbvArgs(level)] : [];
  return [...head, ...pin, "-threads", "4", ...tail];
}

// Why a frame does not fit Level 5.2, naming the constraint that failed
export function levelProblem(w, h, fps) {
  const [, mbps, fs] = MAX,
    side = Math.max(Math.ceil(w / 16), Math.ceil(h / 16));
  if (mbs(w, h) > fs || side * side > 8 * fs)
    return `${w}x${h} is larger than H.264 Level 5.2 allows (4K is 3840x2160): use a smaller canvas or --scale`;
  if (mbs(w, h) * fps > mbps)
    return `${w}x${h} at ${fps} fps needs H.264 Level ${h264Level(w, h, fps) ?? "above 6.2"}, above the 5.2 that 4K60 players decode: render at 60 fps or less`;
  return null;
}

// One worker's memory, an authoring-time estimate: 3.5 GB at 1080p and 6.5 GB at 4K. A synthetic project measured 2.5
// and 5.3 GB (Chrome with its GPU targets plus x264); real footage caches add about a gigabyte at any scale.
export const workerGB = (w, h) => 2.5 + (w * h) / (1920 * 1080);

// Workers that fit in memory. Unchanged at or below 1080p, where 3 workers is the documented default.
export function workerCap(requested, w, h, totalBytes, reserveGB = 4) {
  if (!above1080p(w, h)) return requested;
  const fit = Math.floor((totalBytes / 2 ** 30 - reserveGB) / workerGB(w, h));
  return Math.max(1, Math.min(requested, fit));
}
