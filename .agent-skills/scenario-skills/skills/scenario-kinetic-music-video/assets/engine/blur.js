// Motion-blur planning: pure functions of time, no three.js. main.js renders the samples (ENGINE_API.md, Motion blur).
export const EPS = 1e-4; // seconds a shutter stops short of a cut
export const DEFAULTS = {
  on: false,
  samples: 8,
  shutter: 180,
  max: 24,
  beatCuts: false,
  wordCuts: true,
};

// Which pass is drawing, shared with core.js and plate.js. id counts frames and pass counts every pass, samples included;
// sub is true inside a sample, shift is the sample's time minus the frame's; keep records trackAt calls for the samples;
// layer is the index of the layer whose render() runs, else null; stale names a clip a sample drew that prepare() did
// not advance this frame.
export const clock = {
  id: 0,
  pass: 0,
  sub: false,
  shift: 0,
  keep: false,
  layer: null,
  stale: null,
};

const whole = (n, min) => Number.isInteger(n) && n >= min;

// The project's BLUR (timeline.js) with the page query over it. Below scale 1 the project setting is ignored unless the
// query sets blur, so previews stay fast.
export function resolveBlur(q = {}, cfg, scale = 1) {
  if (cfg != null && (typeof cfg !== "object" || Array.isArray(cfg)))
    throw new Error("BLUR in timeline.js: use an object such as { on: true }");
  for (const k of Object.keys(cfg ?? {}))
    if (!(k in DEFAULTS))
      throw new Error(
        `BLUR.${k} in timeline.js: unknown key (use ${Object.keys(DEFAULTS).join(", ")})`,
      );
  // the project's values are checked even where the query overrides them or a preview ignores them
  const p = { ...DEFAULTS, ...cfg };
  check(p, "BLUR in timeline.js");
  fits(p, "BLUR in timeline.js", "raise BLUR.max or lower BLUR.samples");
  const o = { ...DEFAULTS, ...(q.blur == null && scale < 1 ? {} : cfg) };
  const v = q.blur == null ? "" : String(q.blur).trim().toLowerCase();
  if (v === "off" || v === "0" || v === "1") o.on = false;
  else if (v === "on" || v === "true") o.on = true;
  else if (/^\d+$/.test(v)) {
    o.on = true;
    o.samples = +v;
  } else if (v)
    throw new Error(
      `--blur ${JSON.stringify(q.blur)}: use on, off or a sample count`,
    );
  if (q.shutter != null && q.shutter !== "") o.shutter = +q.shutter;
  if (q.blurmax != null && q.blurmax !== "") o.max = +q.blurmax;
  check(o, "motion blur");
  // a run that stays sharp renders no samples, so its max holds nothing back
  if (o.on) fits(o, "motion blur", "raise --blur-max or pass a smaller --blur");
  o.on = o.on && o.samples > 1;
  return o;
}
function check(o, where) {
  for (const k of ["on", "beatCuts", "wordCuts"])
    if (typeof o[k] !== "boolean")
      throw new Error(
        `${where}: ${k} ${JSON.stringify(o[k])}, use true or false`,
      );
  for (const k of ["samples", "max"])
    if (!whole(o[k], 1))
      throw new Error(
        `${where}: ${k} ${o[k]}, use a whole number of 1 or more`,
      );
  if (!(o.shutter > 0 && o.shutter <= 720))
    throw new Error(
      `${where}: shutter ${o.shutter}, use degrees above 0, up to 720`,
    );
}
// sampleCount caps every frame at max, so a larger base count would never render. `fix` names the remedy for where the
// values came from: no flag clears the project check.
function fits(o, where, fix) {
  if (o.samples > o.max)
    throw new Error(
      `${where}: samples ${o.samples} above max ${o.max}, ${fix}`,
    );
}

// A layer's blur from its TIMELINE entry, else its scene's default export: { sharp, floor }. false or 0 renders it once
// per frame (the HUD); a whole number of 2 or more is the sample floor for the whole entry.
export function layerBlur(entry, scene, id) {
  const v = entry !== undefined ? entry : scene;
  if (v === undefined || v === true) return { sharp: false, floor: 0 };
  if (v === false || v === 0) return { sharp: true, floor: 0 };
  if (whole(v, 2)) return { sharp: false, floor: v };
  throw new Error(
    `${id}: blur ${JSON.stringify(v)}: use false (sharp, like the HUD), true, or a sample count of 2 or more`,
  );
}

// The TIMELINE entries whose bounds are cuts: the loaded ones, plus every other entry on this canvas in the render's
// variant. `variant` is the one asked for, else the one an --only preview loaded, else 'a'. An entry whose canvas tag
// throws counts as off this canvas, so a typo stops only the renders that load it.
export function cutEntries(timeline, { onCanvas, variant, loaded = [] }) {
  const ids = new Set(loaded.map((l) => l.id)),
    vs = new Set(loaded.map((l) => l.variant).filter(Boolean));
  const v = variant || (vs.size === 1 ? [...vs][0] : "a");
  return timeline.filter((e) => {
    if (ids.has(e.id)) return true;
    try {
      if (!onCanvas(e)) return false;
    } catch {
      return false;
    }
    return !e.variant || e.variant === v;
  });
}

// Times no sample may cross: every entry's start and end, registered E.cut times, word switches (onset minus LEAD) and,
// when asked, the beats.
export function cutList(
  entries,
  { beats = [], words = [], lead = 0, extra = [], o = DEFAULTS } = {},
) {
  const s = new Set([0]);
  for (const e of entries) s.add(e.start).add(e.end);
  if (o.beatCuts) for (const b of beats) s.add(b);
  if (o.wordCuts) for (const w of words) s.add(w.s - lead);
  for (const c of extra) s.add(c);
  return [...s].filter(Number.isFinite).sort((a, b) => a - b);
}

// The shutter opens at t and closes len later. A cut inside slides it back to end just before the cut, never before the
// previous cut, so samples never mix two shots and the frame before a cut still blurs.
export function shutterWindow(t, len, cuts) {
  let prev = -Infinity,
    next = Infinity;
  for (const c of cuts) {
    if (c <= t) prev = c;
    else {
      next = c;
      break;
    }
  }
  if (t + len <= next - EPS) return [t, t + len];
  const b = Math.max(t, next - EPS);
  return [Math.min(t, Math.max(prev, b - len)), b];
}

// The longest shutter multiplier of the E.shutter windows holding t, else 1
export function shutterScale(t, windows) {
  let k = 1;
  for (const [a, b, m] of windows) if (t >= a && t <= b) k = Math.max(k, m);
  return k;
}

// Samples for a shutter [a, b]: the base count, raised by overlapping E.fast windows and by a longer shutter (so samples
// stay as close together), capped at max
export function sampleCount(a, b, k, o, fasts) {
  let n = o.samples;
  for (const [fa, fb, m] of fasts) if (b >= fa && a <= fb) n = Math.max(n, m);
  return Math.min(Math.max(n, Math.ceil(o.samples * k)), o.max);
}

// n times spread evenly over [a, b], both ends included
export function sampleTimes(a, b, n) {
  if (n <= 1 || b <= a) return [a];
  return Array.from({ length: n }, (_, j) => a + ((b - a) * j) / (n - 1));
}

// Sample times for the frame at t, or null when it renders once (blur off, inside E.sharp, no room before a cut)
export function framePlan(t, fps, o, B) {
  if (!o.on) return null;
  for (const [a, b] of B.sharps) if (t >= a && t < b) return null;
  const k = shutterScale(t, B.shutters);
  const [a, b] = shutterWindow(t, (o.shutter / 360) * (k / fps), B.cuts);
  const n = sampleCount(a, b, k, o, B.fasts);
  return n > 1 && b > a ? sampleTimes(a, b, n) : null;
}

// How a planned frame accumulates: every sample weighs 1/n. When the shutter opens at the frame time, the frame pass
// is sample 0 and only the rest render again.
export function passes(times, t) {
  const reuse = times[0] === t;
  return { n: times.length, reuse, render: reuse ? times.slice(1) : times };
}

// The track index a sample's k-th trackAt call on a clip returns: what the frame pass's k-th call got, whatever maps song
// time to clip time (slow motion, a clamp). A call the frame pass never made matches by clip time, else returns null.
export function replayIndex(seen, k, localT, shift) {
  if (k < seen.length) return seen[k][1];
  const e = seen.find(([t0]) => Math.abs(t0 - (localT - shift)) < 1e-6);
  return e ? e[1] : null;
}
