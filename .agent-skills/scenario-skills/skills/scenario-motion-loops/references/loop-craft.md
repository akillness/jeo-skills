# Loop craft

How the 80 loops of the Motion Loops exploration on scenario.com are built, as rules and patterns
you can reuse. Every pattern here is plain Canvas 2D on the helpers in `scripts/loop-template.html`
(`M.*`).

## The contract

- `draw(ctx, w, h, t, P)` paints one frame. `ctx` already has the background `P.bg` filled. `t` is
  seconds in `[0, LOOP)`, and `LOOP` is 12.
- The frame must depend on `t` alone. No `Math.random`, no `Date` or `performance.now`, no variables
  carried from one frame to the next. Motion blur renders eight moments around each frame, out of
  order, and the seam check renders `t` twice; both break if a tile keeps state.
- Every motion repeats with a period that divides `LOOP`: 1, 1.5, 2, 3, 4, 6 or 12 s at 12 s.
  `M.phase(t, period, offset)` gives the 0 to 1 position inside a cycle.
- Variety comes from `M.rand(i, salt)`: a fixed pseudo-random number per element index `i`. Use
  different salts for different properties (`rand(i, 1)` for angle, `rand(i, 2)` for size).

## Units and framing

- `const u = h / 100;` and every size in `u`. Counts come from `w` so a pattern fills edge to edge
  at 16:9, 9:16, 1:1 and at thumbnail size. Centered subjects sit at `w / 2, h / 2`, sized from `h`.
- Nothing thinner than about `0.2 * u` if the loop will be seen small; dense parallel hairlines and
  tiny dots in a regular grid alias into moire unless moire is the point.
- Background loops are full bleed. Shape loops have one subject (or a small group) at 30 to 45% of
  `h` with room around it, because an editor will key or overlay it.

## Color

- Use only the palette: `P.bg`, `P.fg` (main motif), `P.fg2` (second color, sparingly), `P.mid`,
  `P.accent`, `P.paper`, `P.ink`, with `M.rgba(color, alpha)` and `M.mixColor(a, b, k)`.
- Three tones from one brand color: dark (dark card background, accent motif), accent (accent
  background, ink motif) and light (paper background, ink motif, accent as the second color). When a
  shape loses contrast in its tone (an accent shape on a near-accent background), change the tone;
  do not invent a new color.
- Shading for 3D faces is a mix of palette colors, branched by tone:
  `if (P.bg === P.paper) ... else if (P.bg === P.accent) ... else ...`.
- Flat fills and clean strokes. A purposeful glow is a radial gradient, never `ctx.filter` blur
  (slow, and it differs between browsers).

## Patterns that close the loop

**Scroll by whole repeats.** A pattern with spacing `p` must move a whole number of spacings per
period: `const off = M.phase(t, 3) * p;` moves one spacing every 3 s. For several layers at
different speeds, give each a whole number of steps per loop:
`const s = M.fract((steps * t) / LOOP);`.

**Streams toward the camera.** Rows at depth `z = k + 1 - M.phase(t, 1.5)` move exactly one row per
period, so the field is identical at every period boundary. Fade rows in near the camera and out
toward the horizon so they never pop.

**Surge without breaking the loop.** Warp time instead of the speed:
`const tw = t + a * Math.sin((M.TAU * t) / 6);` with 6 dividing `LOOP` keeps
`tw(t + 12) = tw(t) + 12`, so every phase computed from `tw` still closes. Keep `a * M.TAU / 6 < 1`
so time never runs backwards.

**Smooth wander.** `M.loopNoise(t, seed, period)` is noise built from sines on a circle and repeats
every `period` seconds. Use it for drift, sway and breathing.

**Rotation.** A full turn per 12 s is `M.TAU * (t / 12)`; twice as fast is `2 * M.TAU * (t / 12)`. A
symmetric shape with `n` arms only has to turn `M.TAU / n` per period.

**Staggered beats.** Offset each element's phase: `M.phase(t, 3, i * 0.12)`. A wave across a grid
uses position as the offset: `Math.sin(M.TAU * (t / 4) - (x / w) * 5 - (y / h) * 3)`.

**Holds and windows.** Inside a cycle, `M.win(p, a, b)` is 0 before `a`, eases 0 to 1 between `a`
and `b`, and holds at 1 after `b`. Chain windows for anticipation, action, settle and hold:

```js
const p = M.phase(t, 3);
const anticipate = M.ease.inOutSine(M.win(p, 0.0, 0.15)); // wind up
const go = M.ease.outBack(M.win(p, 0.15, 0.45)); // overshoot and settle
const leave = M.ease.inCubic(M.win(p, 0.8, 0.95)); // exit, then hold empty
```

Make the end of a cycle equal its start (same position, scale and color), or the seam check fails.

**Springs that close.** `M.ease.spring(k, zeta, freq)` settles from 0 to 1 and is pinned to exactly
1 at `k = 1`. Any after-shake you write yourself must reach exactly 0 before the cycle ends:

```js
const shake = (tau, freq, decay) =>
  tau <= 0 ? 0 : Math.exp(-tau / decay) * Math.sin(M.TAU * freq * tau);
const settle = (tau, freq, decay, end) =>
  shake(tau, freq, decay) * (1 - M.smoothstep(end * 0.7, end, tau));
```

**Put the loop point in a hold.** The easiest seam is a moment where nothing moves. If a shape's
cycle has a rest, offset its timeline (`M.phase(t, 6, 2)`) so 12 s falls inside the rest.

## Animation principles for shape loops

- Anticipation before every big move (a squash, a pull back), overshoot after it (`outBack`,
  `spring`), follow-through on secondary parts, and a short hold so the eye can read the pose.
- Squash and stretch keep the volume: if the height scales by `sy`, the width scales by about
  `1 / Math.pow(sy, 0.75)`. Stretch along the direction of travel, squash on contact.
- Constant speed only for scrolls and streams. Everything else eases.
- Nothing is ever fully still for a whole second in a background loop; shape loops may hold.
- A contact shadow (a flat low-alpha ellipse that shrinks as the subject rises) grounds a bounce
  without breaking the flat look.

## Depth without a 3D engine

- Project with `M.proj(x, y, z, f, cx, cy)`: divide by `z` once. Scaling the focal length by depth
  again shrinks the whole scene toward the center.
- Draw far to near. For lines in 3D (rings, wireframes), split them into short segments, sort by
  depth, and fade and thin the far ones.
- Hidden lines: a stack of ridgelines reads as terrain only if nearer ridges hide farther ones. Draw
  rows from far to near, and before stroking each row, fill the area below its line with `P.bg`. A
  wireframe mesh without hidden lines reads as clutter.
- Long lines toward a vanishing point are drawn in depth segments so they can fade into the horizon
  instead of ending in a hard point.

## Performance

- Each output frame draws the tile `samples` times on a canvas `ss` times larger in each direction
  (8 draws at 2x by default). Keep one draw under a few milliseconds: fewer than about 2,000
  primitives, paths batched with `Path2D`, no per-pixel loops.
- Fast moves need more motion-blur samples, not fewer: a full-frame push at 8 samples shows strobing
  copies. Raise `--samples` (cost grows linearly) for loops with very fast motion.

## Review like a motion designer

- Look at stills at several times, and sample inside a single cycle: stills every 1.5 s show only
  two poses of a 3 s cycle. `--stills dir --at 0,0.25,0.5,0.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75`.
- Look at the frames just before and after the loop point (`--at 11.9,11.95,0,0.05`).
- Check the 16:9 export and the thumbnail size; a loop that only works at one aspect is not done.
- A designed snap (a pop, a burst, a kick) changes a lot in one or two frames on purpose. A seam or
  glitch detector flags it; look at the frames before deciding it is a bug.
