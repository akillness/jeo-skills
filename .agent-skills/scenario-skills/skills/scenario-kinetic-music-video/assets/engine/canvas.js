// Canvas size, orientation and safe band, at scale 1 (main.js multiplies by SCALE).
// A project renders at the CANVAS in timeline.js; ?canvas= (render.mjs/still.mjs --canvas) overrides it for a second ratio.
export const PRESETS = {
  landscape: [1920, 1080],
  portrait: [1080, 1920],
  square: [1080, 1080],
};

// Platform UI covers the edges of a 9:16 feed: top bar, caption and buttons at the bottom, an action rail on the right.
// Fractions of the canvas, authoring-time values derived from the band scenario-formats and scenario-video-ads compose to
// (6 to 13% per side there; the wider inset goes on the right, where the action rail sits).
export const TALL_SAFE = { top: 0.14, bottom: 0.35, left: 0.06, right: 0.13 };
const FULL = { top: 0, bottom: 0, left: 0, right: 0 };

// 'portrait' | 'landscape' | 'square' | 'WxH' | [w, h] -> [w, h], or null. Sides must be even (H.264 4:2:0 refuses odd ones).
export function parseCanvas(v) {
  let w, h;
  if (Array.isArray(v)) [w, h] = v;
  else {
    const s = String(v ?? "")
      .trim()
      .toLowerCase();
    if (PRESETS[s]) return [...PRESETS[s]];
    const m = s.match(/^(\d+)x(\d+)$/);
    if (!m) return null;
    [w, h] = [+m[1], +m[2]];
  }
  const ok = (n) => Number.isInteger(n) && n >= 2 && n % 2 === 0;
  return ok(w) && ok(h) ? [w, h] : null;
}

// The query value wins over timeline.js CANVAS; landscape when neither is set. Throws on a value it cannot read.
export function resolveCanvas(query, timelineCanvas) {
  for (const v of [query, timelineCanvas]) {
    if (v == null || v === "") continue;
    const c = parseCanvas(v);
    if (!c)
      throw new Error(
        `canvas ${JSON.stringify(v)}: use landscape, portrait, square or WxH with even sides`,
      );
    return c;
  }
  return [...PRESETS.landscape];
}

export function orientation(w, h) {
  return w === h ? "square" : h > w ? "portrait" : "landscape";
}

// Insets for this canvas: TALL_SAFE on a 9:16-tall canvas, the full frame on anything wider. timeline.js SAFE overrides
// sides per orientation, e.g. { portrait: { top: 0.2 } }; the sides it does not name keep their default.
export function safeInsets(w, h, overrides) {
  const base = h / w >= 1.7 ? TALL_SAFE : FULL;
  return { ...base, ...(overrides?.[orientation(w, h)] ?? {}) };
}

// Safe band in pixels of a W x H canvas.
export function safeRect(W, H, insets) {
  return {
    x: Math.round(W * insets.left),
    y: Math.round(H * insets.top),
    w: Math.round(W * (1 - insets.left - insets.right)),
    h: Math.round(H * (1 - insets.top - insets.bottom)),
  };
}

// Shift a perspective camera's frame so its center lands on the safe band's center: 3D placed at the origin then sits
// clear of platform UI. No-op on a full-frame band, so landscape renders are unchanged.
export function centerOnSafe(cam, W, H, R) {
  const dx = W / 2 - (R.x + R.w / 2),
    dy = H / 2 - (R.y + R.h / 2);
  if (dx || dy) cam.setViewOffset(W, H, dx, dy, W, H);
  return cam;
}

// The orientations a TIMELINE entry renders on, or null for all. A tag it cannot read throws, so a typo fails the render
// instead of silently dropping the section on every canvas.
export function canvasTags(entry) {
  if (entry.canvas == null) return null;
  const tags = []
    .concat(entry.canvas)
    .map((t) => String(t).trim().toLowerCase());
  const bad = tags.filter((t) => !Object.hasOwn(PRESETS, t));
  if (bad.length)
    throw new Error(
      `timeline entry ${entry.id}: canvas ${JSON.stringify(entry.canvas)} must be landscape, portrait or square`,
    );
  return tags;
}

// A TIMELINE entry with `canvas: 'portrait'` (or a list of orientations) renders only on that canvas; without one, on all.
export function onCanvas(entry, orient) {
  const tags = canvasTags(entry);
  return tags == null || tags.includes(orient);
}

// Plate fit for a clip on this canvas: 'cover' when their shapes are close enough to fill the frame, otherwise 'contain'
// (the whole clip as a window), so a 16:9 clip on a 9:16 canvas is never cropped to a third of its width.
// Pass the same fit to drawPlate, plateRect and plateToScreen.
export function plateFit(E, v) {
  const va = v.meta.w / v.meta.h,
    sa = E.W / E.H;
  return Math.max(va / sa, sa / va) <= 1.34 ? "cover" : "contain";
}
