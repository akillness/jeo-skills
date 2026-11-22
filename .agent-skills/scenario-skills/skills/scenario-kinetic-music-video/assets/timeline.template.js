// Delivery canvas, chosen once in the brief: 'landscape' (1920x1080), 'portrait' (1080x1920), 'square' or 'WxH'.
// render.mjs/still.mjs --canvas overrides it to render the same project at a second ratio.
export const CANVAS = "landscape";

// Optional safe-band override per orientation, as fractions of the canvas; sides it does not name keep their default.
// A 9:16 canvas defaults to the platform-UI band (top 0.14, bottom 0.35, left 0.06, right 0.13), anything else to the full frame.
// export const SAFE = { landscape: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 } };

// Master edit decision list. One entry per section scene (hard cuts at section boundaries, on downbeats or just
// before a vocal pickup), plus the global HUD on top. Scenes render only inside [start, end). id = file name in engine/scenes/.
//   file:    optional, use another file than <id>.js
//   variant: optional alternate version of a section (e.g. two endings). Only variant 'a' renders unless you pass --variant b.
//            Entries without a variant always render.
//   canvas:  optional 'portrait' | 'landscape' | 'square' (or a list): the entry renders only on that canvas. Use it when one
//            section needs a different layout per ratio; entries without it render on every canvas.
//   energy:  optional 'calm' | 'mid' | 'high' | 'showcase': the targets tools/dynamism_check.py gate holds the section to.
//            showcase (logo build, end card) skips the still, hold and motion targets, never the flash limit. Untagged
//            sections take it from the song's loudness. The engine ignores it.
//   blur:    optional false (renders sharp, once per frame, like the HUD) or a sample count for the whole entry under
//            motion blur; see ENGINE_API.md, Motion blur
export const TIMELINE = [
  { id: "intro", file: "_template.js", start: 0.0, end: 16.66, z: 0 }, // replace with your own scene files
  // { id: 'hook1',  start: 16.66, end: 37.60, z: 0, energy: 'high' },
  // { id: 'hook1_v', start: 16.66, end: 37.60, z: 0, canvas: 'portrait' }, // with canvas: 'landscape' on hook1
  // { id: 'outro',   start: 140.0, end: 150.0, z: 0, variant: 'a', energy: 'showcase' },
  // { id: 'outro_b', start: 140.0, end: 153.0, z: 0, variant: 'b', energy: 'showcase' }, // may run past the song: render.mjs pads silence
  { id: "hud", start: 0.0, end: 9999, z: 100 }, // sharp under motion blur (hud.js declares blur: false)
];

// Persistent frame. See engine/scenes/hud.js for every option.
export const HUD = {
  title: "SONG TITLE",
  mark: null, // or { path: '<svg path d>', w, h, alphas: [1] }
  sections: [
    [0, "INTRO"],
    [16.66, "HOOK_01"],
  ],
  counters: [
    // The spine lives here when the concept has one, e.g. a clock or a counter that grows over the song:
    // { label: '', keys: [[0, 120], [150, 420]], fmt: 'clock', suffix: ' AM' },
    // { label: 'COUNT', keys: [[0, 1], [40, 10000], [150, Infinity]], interp: 'log', fmt: 'short' },
  ],
  progress: true,
};

// Project-wide post defaults (merged over the neutral engine defaults; scenes can still override per frame via E.post).
// Neutral = footage passes through untouched. Use grade:'warm' only for amber-on-black, mostly graphics pieces.
export const POST = {
  // grade: 'warm', grain: 0.045, vignette: 0.35, ca: 0.0015, invertCol: '#FFA010',
};

// Motion blur, off by default: decide it in the look pass from an A/B of the fastest 5 s (ENGINE_API.md, Motion blur).
// It applies from --scale 1 up; render.mjs --blur overrides it per run, and stills stay sharp unless given --blur.
// export const BLUR = { on: true }; // also: samples 8, shutter 180 (degrees), max 24, beatCuts false, wordCuts true
