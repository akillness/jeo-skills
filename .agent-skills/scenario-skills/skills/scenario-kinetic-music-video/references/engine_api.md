# Engine API (assets/engine → project engine/)

A deterministic three.js + Canvas2D compositor. Every pixel is a pure function of global song time
`t`. `tools/render.mjs` and `tools/still.mjs` step frames with `window.renderFrame(frame, fps)` in
headless Chrome, and ffmpeg muxes the untouched master audio on top.

## Contents

- [Files](#files)
- [Scene contract](#scene-contract)
- [Canvas and safe band](#canvas-and-safe-band)
- [The E object](#the-e-object)
- [Footage: clean plates, mattes and tracking](#footage-clean-plates-mattes-and-tracking)
- [Keyed footage planes in 3D (roto)](#keyed-footage-planes-in-3d-roto)
- [Post](#post)
- [Motion blur](#motion-blur)
- [HUD](#hud)
- [Timeline, variants and project config](#timeline-variants-and-project-config)
- [Fonts and 3D assets](#fonts-and-3d-assets)
- [Commands](#commands)

## Files

| file                                  | role                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                          | fonts (@font-face → assets/fonts), importmap for three                                                                                                           |
| `main.js`                             | loads data and scenes, per-frame layer compositing, bloom, final grade shader, `renderFrame` / `grab`                                                            |
| `blur.js`                             | motion-blur planning: settings, cuts, shutter windows, sample times                                                                                              |
| `canvas.js`                           | canvas presets, orientation, the platform-UI safe band, per-canvas timeline filtering                                                                            |
| `core.js`                             | math, easing, springs, RNG/noise, palette, audio/lyric timeline helpers, text canvases, 3D type, G2D surfaces, video frame sequences (frames + matte + tracking) |
| `plate.js`                            | `drawPlate`, `plateRect`, `plateToScreen`, `plateMaterialFor`: clean footage with optional matte cut-out                                                         |
| `typekit.js`                          | kinetic type: `popScale`, `wordAlpha`, `drawText`, `fitSize`, `drawStagger`, `drawKaraoke`, `drawSubtitle`, `blitG2D`, `stretchKW`                               |
| `roto.js`                             | `makeRotoMaterial`: luma-keyed footage planes for clips shot on a black void (stylized redraws only with `{stylized:true}`)                                      |
| `timeline.js`                         | `CANVAS`, optional `SAFE`, `TIMELINE` (scene ids, [start,end), z, variant, canvas, energy), `HUD` config, `POST` project defaults                                |
| `scenes/hud.js`                       | global HUD layer (z=100): corners, title + mark, section code, bar/beat, counters (the spine), progress, subtitle track                                          |
| `data/audio.json`, `data/lyrics.json` | written by `audio_analysis.py` / `lyrics_align.py`                                                                                                               |

## Scene contract

```js
export default {
  async load(E, layer) {}, // build scenes/geometry/materials, load videos (cache everything here)
  async prepare(E, t, layer) {}, // optional: await v.frame(t - SLOT) for every clip drawn this frame
  render(E, t, rt, layer) {
    // t = GLOBAL seconds; window is [layer.start, layer.end)
    E.renderer.setRenderTarget(rt); // rt is pre-cleared transparent; renderer.autoClear is false
    // draw back → plate → mid → matte → front; E.renderer.clearDepth() between 3D passes
    // may set E.post.* and E.hud.* ; may return a number = layer opacity
  },
};
```

- Layers composite premultiplied-normal over black in z order (an entry can set
  `blend: 'add'|'screen'|'multiply'`). HDR linear color. Values above the bloom threshold (1.05)
  bloom.
- Previews run at `E.SCALE = 0.5` (E.W = 960 on landscape, 540 on portrait), a 4K master at 2.
  Always size 2D pixels as `px * E.SCALE`, and place them from `E.W`, `E.H` and `E.SAFE`, never from
  1920 or 1080 constants. The camera aspect is `E.W/E.H`.
  - `E.SCALE` also goes on text-texture sizes, `glow`, `stroke` and `drawStagger`'s `dy` (its
    default of 60 is unscaled).
  - `THREE.Line` stays one device pixel wide at every scale: draw hairlines as meshes or scaled
    canvas strokes.
- Deterministic only. No `Math.random`, `Date`, `performance.now` or rAF timing. Use `E.rng(seed)`,
  `E.hash1`, `E.noise1/2`. Particles use closed-form positions (no accumulated state).
- The budget is about 35 ms/frame at 1080p. Cache text textures, geometry and canvases in `load()`.
  At most 2 full-res 2D canvases redrawn per frame, and no allocation in hot loops.
- The first frame at `layer.start` is a hard cut in, so make it striking. The last frames land on an
  accent.
- With motion blur on, `render()` runs several times per output frame and `prepare()` once, so keep
  `render()` free of state between calls ([Motion blur](#motion-blur)).

## Canvas and safe band

One project renders at one canvas, `CANVAS` in timeline.js: `'landscape'` (1920×1080, the default),
`'portrait'` (1080×1920), `'square'` (1080×1080) or `'WxH'` with even sides. `--canvas` on
`render.mjs` and `still.mjs` overrides it to render the same project at a second ratio; an
unreadable value stops the render with an error.

- `E.CANVAS` is `[w, h]` at scale 1, and `E.ORIENT` is `'landscape' | 'portrait' | 'square'`.
- `E.SAFE` is `{x, y, w, h}` in px: the band platform UI never covers. On a 9:16-tall canvas it
  clears roughly the top 14%, the bottom 35%, 6% on the left and 13% on the right (authoring-time
  values); on anything wider it is the whole frame, so landscape layouts are unchanged. `SAFE` in
  timeline.js overrides sides per orientation, e.g. `{ landscape: { top: 0.1, bottom: 0.1 } }` or
  `{ portrait: { top: 0.2 } }`; a side it does not name keeps its default.
- Words, logos and faces go inside `E.SAFE`; footage and full-bleed graphics may fill the canvas
  behind it. The HUD and the house subtitle already lay out inside it, and off landscape the
  subtitle shrinks a long line to fit (a line much over 45 characters gets small, so split it in the
  lyrics).
- `E.safeCamera(cam)` shifts a PerspectiveCamera's frame so the origin lands on the band's center (a
  no-op on a full-frame band). Use it for 3D heroes, then set the distance so the object fits the
  band's width (see the scene template).
- `E.fitSize(ctx, text, o, maxW)` returns the largest size, up to `o.size`, at which the text fits
  `maxW`. Hero type sized for a 1920-wide frame overflows a 1080-wide one; fit it to `E.SAFE.w`
  divided by the largest scale its move reaches (a word popping in from 1.6× fits `E.SAFE.w / 1.6`),
  or enter from below 1.
- `E.plateFit(E, v)` returns `'cover'` when the clip's shape matches the canvas and `'contain'` (a
  window) when it does not. Pass it as every plate's `fit` in a scene that renders on more than one
  canvas.
- `node tools/still.mjs --safe` outlines the band in magenta. The HUD draws it (even at `alpha:0`),
  so the `hud` entry must be in `TIMELINE`. Never pass `--safe` to a delivery render.

## The E object

- **Time and audio**
  - `E.t`, `E.frame`, `E.fps`, `E.dur`, `E.bpm`, `E.spb`.
  - `E.frameT`, `E.atFrame(t)`, `E.blur`, `E.blurring`, `E.cut`, `E.fast`, `E.shutter`, `E.sharp`:
    see [Motion blur](#motion-blur).
  - `E.env(name, t)` for `mix|vocal|kick|snare|hats|bass` (≈0..1.5), plus `E.envAvg(name, t, win)`.
  - `E.last(list, t)` / `E.next(list, t)` return `{i, t, dt}` for the lists
    `beats|downbeats|kicks|snares|vocal_onsets`. There is no `hats` list (hats are an envelope
    only).
  - `E.pulse(list, t, decay=0.12, lead=0)` is an exponential decay since the last event (the
    workhorse).
  - `E.beat(t)` returns `{i, t0, t1, phase, bar, barT0, inBar, isDown, len}`.
- **Lyrics**
  - `E.words` holds `{w, s, e, li, wi, section, line}`.
  - `E.lineAt(t, lead)`, `E.wordAt(t, lead)`, `E.wordsIn(t0, t1)`, `E.section(name)`.
- **Math**
  - `E.clamp`, `E.lerp`, `E.remap`, `E.fract`.
  - `E.ease.{linear,inQuad,outQuad,inOutQuad,inCubic,outCubic,inOutCubic,inQuart,outQuart,inOutQuart,inExpo,outExpo,inOutExpo,outBack,inBack,outElastic,smooth}`.
  - `E.tween(t, t0, dur, fn)`, `E.spring(dt, k, z)` (0→1 damped step response).
- **Palette**
  - `E.PAL`: replace the values in `core.js` per project (from STYLE.md). Keep the role keys
    `black ink white accent`; the HUD and templates use them.
  - `E.col(hex, mul)` gives a linear THREE.Color, scaled by `mul`.
  - Bloom keys on luminance, not the brightest channel, so `mul` must lift the color's luminance
    past the 1.05 threshold: about 1.05 for white, 1.4 for pure cyan, 3.7 for pure magenta.
  - A large extruded face (`E.text3D`) over the threshold blooms into a blur. Keep its front face
    below the threshold and put the glow on the side material. If the glow still softens the
    letters, lower `E.post.bloom` and `bloomRadius` in that scene (0.3 and 0.12 held in one test
    run).
- **2D**
  - `E.makeG2D(w, h)` returns `{ctx, tex, clear(), commit()}`.
  - `E.blitG2D(E, g, intensity, blending)` draws the surface fullscreen into the current target.
    Keep `intensity` at 1 or below for flat type: above it, white type passes the bloom threshold
    and washes the whole frame gray. Go higher only for a deliberate glow.
- **Type**
  - `E.drawText(ctx, text, x, y, {font, size, weight, stretch:'125%'|'extra-condensed'…, tracking(em), color, alpha, align, s|sx|sy, rot, skewX, stroke, strokeOnly, glow, italic})`.
    `alpha` replaces the context's `globalAlpha` rather than multiplying it, so pass a fade as
    `alpha`.
  - `E.measure(ctx, text, o)`.
  - `E.drawStagger(ctx, text, x, y, t, s, {stagger, dy, spring, e})`.
  - `E.drawKaraoke(ctx, E, line, t, {x, y, size, align, font, litColor, dimColor, maxW})`: `maxW`
    shrinks the whole line to fit.
  - `E.popScale(t, s, {k, z, from})` and `E.wordAlpha(t, s, e, {out})`; `E.LEAD = 0.05`.
  - `E.textTexture(text, o)` returns a cached `{tex, w, h, aspect}` for planes.
  - `E.text3D(str, {font:'ArchivoBlack'|'Anton'|'BlackHanSans', size, depth, bevel…})` returns a
    cached, centered TextGeometry. Use a material array `[front, side]`.
  - Canvas `fontStretch` only accepts keywords. `stretchKW` maps percentages.
  - Never stroke a variable font: overlapping contours show their inner lines. Use static fonts
    (Archivo Black, Anton) for outline type.

## Footage: clean plates, mattes and tracking

This is the default compositing mode. Footage is drawn exactly as generated, and code graphics live
in layers around it.

- `const v = await E.loadVideo('clip')` loads `assets/video/<clip>/f_#####.jpg` +
  `meta.json {fps,n,w,h,lumLo,lumHi,ext?,warp?,mask?,track?}`. If `meta.mask` is set, the matte
  sequence `m_#####.png` loads too (`v.mtex`, white = subject). If `meta.track` is set, `track.json`
  loads too.
- A still (a style frame used as a backdrop plate) loads as a one-frame clip:
  `assets/video/<name>/f_00001.png` plus `meta.json {fps:1, n:1, w, h, ext:'png'}`. Animate
  `drawPlate`'s `zoom`, `x` and `y` so it never reads as a frozen frame.
- In `prepare()`: `await v.frame(localT)`. Use `localT = t - SLOT` for slot clips. This updates
  `v.tex`, `v.mtex` and `v.i`. Beat-warp in `meta.warp` is applied automatically. The index clamps
  to the last frame, so **keep localT inside the clip**, because a held last frame reads as a
  freeze.
- `E.drawPlate(E, v, { fit:'cover'|'contain', zoom:1, x:0, y:0, rot:0, crop:[x,y,w,h] (image UV, y down), mirror:false, opacity:1, matte:false, invert:false, feather:0.12 })`
  draws into the current render target.
  - `matte:true` draws only the subject (alpha from the matte). `invert:true` draws only the
    background.
  - `x` and `y` are px offsets at 1080p scale (multiplied by `E.SCALE` internally).
  - `fit:'cover'` fills the canvas and crops the clip when the ratios differ; `fit:'contain'` shows
    the whole clip as a band or window. Use `fit: E.plateFit(E, v)` so a 16:9 clip on a portrait
    canvas is windowed, never cover-cropped to fill (`pipeline.md` §9).
- **Layer recipe** ("type behind the subject"): `drawPlate(v)`, then MID graphics (a `blitG2D` or a
  3D render), then `drawPlate(v, {matte:true})`, then FRONT graphics.
- **Backdrop replacement** for plates shot on a flat color cyc: draw a color field, then
  `drawPlate(v, {matte:true})`. The backdrop becomes your color and the subject is untouched (the
  floor shadow is lost). Run `fixmatte.py` on those clips first.
- `E.plateRect(E, v, opts)` gives `{x, y, w, h, cx, cy, rot}` in screen px.
  `E.plateToScreen(E, v, [u, v], opts)` gives `[x, y]` in screen px (E.W × E.H, y down) for a
  video-UV point. Pass the same opts you used for `drawPlate`.
- **Tracking:** `v.trackAt(localT)` returns
  `{ pose: [[x,y,vis]×33] | null, box: [x0,y0,x1,y1], c: [cx,cy], a: area, top: [x,y] }`, all in
  video UV (0..1, y down).
  - MediaPipe indices: 0 nose, 2/5 eyes, 9/10 mouth corners, 11/12 shoulders, 13/14 elbows, 15/16
    wrists, 19/20 index fingers, 23/24 hips, 27/28 ankles.
  - Pose is single-person and may lock onto the wrong person in a group shot. `box`, `c` and `top`
    come from the matte and cover everyone.
  - Pose needs a human-like body. For creatures, objects or products, use `box`, `c` and `top`.
  - Smooth landmarks over ±2 frames (see `smoothPt` in the scene template). Raw jitter looks cheap.
- `E.plateMaterialFor(v, {matte})` gives a material for your own mesh: footage on a 3D card, inside
  a tile grid, or through a type mask.

## Keyed footage planes in 3D (roto)

For clips shot on a pitch-black void that should float inside a 3D world without a matte:

- `const m = E.makeRotoMaterial(E, {footGain, keyLo, keyHi})`, then `E.rotoLevels(m, v)`. Each
  frame: `m.uniforms.tVideo.value = v.tex`.
- Other uniforms: `uCrop` (Vector4 x,y,w,h in video UV), `uMirror`, `uOpacity`,
  `uReveal`/`uRevealDir`, `uDissolve`.
- Put it on `new THREE.Mesh(new THREE.PlaneGeometry((v.meta.w / v.meta.h) * h, h), m)` (the clip's
  own aspect), or call `E.drawRotoFullscreen(E, m, {scale, x, y})`.
- Output is `rgb = c·m, alpha = key·m`, so dim rim halos add light. Near-black costumes go
  see-through over bright graphics. Fix this with a dark backing cut to the silhouette, or a tighter
  key (`keyLo 0.006, keyHi 0.03`).
- Stylized redraws (dots, edges, ASCII, scanline, cel) need `{stylized:true}`. Use them only when
  the director asks; effects on footage are rejected by default.

## Post

- `E.post` is reset every frame to the neutral defaults, merged with the project's `POST` from
  timeline.js:
  `{bloom:0.55, bloomRadius:0.35, bloomThreshold:1.05, exposure:1, ca:0, grain:0, vignette:0, flash:0, flashCol:[r,g,b], invert:0, punch:0, shake:[x,y], rot:0, scan:0, glitch:0, letterbox:0, sat:1, tint:[r,g,b], fade:1, grade:'neutral', invertCol:'#FFA010'}`
- **`grade:'neutral'`** (default): values ≤ 1 pass through unchanged (no tonemap, no clamp), so
  footage and any palette render true. Only HDR > 1 is compressed, hue-preserving with a white-hot
  core (neon reads like a tube). `invert` is a true RGB invert.
- **`grade:'warm'`**: for amber-on-black pieces that are mostly graphics. It clamps g ≤ r and b ≤ g
  (kills cool CA fringes), applies a 50% hue-preserving ACES blend and pulls saturated yellows
  toward amber. `invert` becomes a poster in `invertCol`. It shifts footage colors, so don't use it
  when footage must stay clean.
- `grain`, `ca`, `vignette`, `scan`, `glitch`, `sat` and `tint` touch every pixel, including
  footage. Keep them at 0 over footage unless the director wants that texture.
- `punch` (zoom), `shake` and `rot` move the whole frame. `shake` is in UV units (0.004 is a hard
  hit), not pixels: pixel values blow the frame up and show as corrupt plates. They work as camera
  accents over footage. `rot` samples clamp-to-edge, so add about 0.1 punch while tilted.
- `flash` is added in linear space before sRGB encoding, so 0.1 already reads strong. It is zeroed
  below 0.02.
- `letterbox` masks to a 2.39:1 window across the full width, which is a thin strip on a portrait
  canvas. There, frame a cinema moment as a boxed plate instead.

## Motion blur

Off by default. `export const BLUR = { on: true }` in timeline.js turns it on from `--scale 1` up;
`render.mjs --blur`, `--blur off` or `--blur 12` (a sample count) overrides it for one run. Previews
below scale 1 and `still.mjs` stay sharp unless given `--blur`. `E.blur` holds this run's resolved
settings (`on`, `samples`, `shutter`, `max`, `beatCuts`, `wordCuts`), so `load()` can check
`E.blur.on`.

- **How:** each output frame renders its blurred layers at `samples` sub-frame times (default 8)
  across a shutter of `shutter` degrees (default 180: 1/120 s at 60 fps) that opens at the frame
  time. They are averaged in a float target, then post runs once.
- **Once per frame, at the frame time:** `prepare()`, the HUD, `E.post` (bloom, grade, grain, flash,
  punch, shake, rot) and `E.hud`. A sample's writes to `E.post` and `E.hud` are dropped, so camera
  moves made with `E.post` stay sharp: move your own camera or group for a blurred whip.
- **Every sample:** `render()` with `t` (and `E.t`) the sample time, `E.frameT` the frame's.
  `E.atFrame(t)` maps a sample time back to the frame's: draw counters and digits from it.
- **Footage never mixes two frames.** Every sample shows the frame `prepare()` loaded, and
  `v.trackAt()` in `render()` replays what the same layer got in the frame pass, call by call. A
  plate your scene does not move is identical to a render without blur; a plate it moves blurs with
  the move.
- **Cuts:** no sample crosses a layer start or end, a word switch (`w.s - E.LEAD`) or an `E.cut(t)`.
  A cut inside the shutter slides it back, so the frame before it still blurs. Call `E.cut(t)` in
  `load()` for every other hard switch inside your section (a clip, a color field, a layout).
  `BLUR.beatCuts: true` adds every beat; `BLUR.wordCuts: false` drops the word switches.
- **Fast fades:** an opacity ramp over a frame or two averages into a gray copy of the whole word.
  Under blur, slam a word in fully opaque on its word switch instead.
- **Undeclared clip switch:** a sample drawing a clip that `prepare()` did not advance this frame
  makes that frame render without blur. `render.mjs` lists those frames at the end; add the `E.cut`.
  Roto materials and custom textures are not checked.
- **Per moment,** registered in `load()` in global seconds:
  - `E.fast(t0, t1, n)`: at least `n` samples on frames whose shutter overlaps the window (12 to 24
    for a slam or a spin).
  - `E.shutter(t0, t1, k)`: a shutter `k` times longer (2 to 3 for a whip), with `k` times the
    samples.
  - `E.sharp(t0, t1)`: no blur, for a held poster slam.
  - Samples stop at `max` (24 by default, `--blur-max` for one run). A base `samples` above it is
    refused. `BLUR.samples` above `BLUR.max` stops every run until timeline.js changes: no flag
    clears it.
- **Per layer:** `blur: false` on a TIMELINE entry renders it once per frame, like the HUD (`hud.js`
  declares `blur: false`; an entry's own `blur` wins); `blur: n` is `E.fast` over the whole entry.
  Anything else stops the render with an error.
- **Hand-made blur:** `E.blurring` is true while a layer that blurs this frame renders. Draw the
  ghost copies of moves 1, 2 and 38 (`motion_library.md` §4) only while it is false.
- **Cost:** each sample re-renders every blurred layer, so keep each `render()` within the frame
  budget. 8 samples took about 2.5 times as long as no blur on a synthetic scene (authoring-time
  measurement); `E.fast` and `E.shutter` windows cost more.
- It needs float render targets; without float blending it falls back to a slower exact path.

## HUD

A persistent frame glues 2D, 3D and footage sections into one piece, and its subtitle track keeps
every lyric readable.

- Per frame:
  `E.hud = {alpha:1, sub:true, corners:true, label:'', theme:'dark'|'light', ink, accent}`. Use
  `theme:'light'` on white or color frames (dark ink). Set `sub=false` only while the scene shows
  the full sung line itself.
- Content comes from `HUD` in timeline.js: `title`, optional `mark` (an SVG path, official brand
  paths only), `sections`, `counters` (`fmt: int|short|sci|clock|text`, `interp: lin|log`),
  `progress`, and `dark`/`light` theme colors. The counters are where the video's spine usually
  shows: a clock, a countdown, or a number that explodes over the song.
- It lays out inside `E.SAFE`, so on a portrait canvas it frames the safe band rather than the
  screen edges.
- Retheme it per project or drop it (`alpha:0`). Some concepts want no HUD at all.

## Timeline, variants and project config

- `TIMELINE` entries: `{id, file?, start, end, z, blend?, variant?, canvas?, energy?, blur?}`. One
  file per section, with hard cuts at boundaries on downbeats. `energy` (`calm`, `mid`, `high`,
  `showcase`) sets the targets `tools/dynamism_check.py gate` holds the section to; the engine
  ignores it.
- **Per-canvas entries:** `canvas:'portrait'` (or a list of orientations) renders the entry only on
  that canvas, `--only` included; tags are case-insensitive, an unknown one stops the render with an
  error, and so does an `--only` that leaves nothing to render. Use it for a section that needs its
  own layout per ratio: tag the landscape file `canvas:'landscape'` and its portrait twin
  `canvas:'portrait'`. Entries without `canvas` render everywhere.
- **Variants:** give alternate versions of a section (an ending, a hook) `variant:'a'|'b'|'c'`. Only
  `a` renders unless you pass `--variant b`, which lets you deliver several cuts from one project. A
  variant may run past the song; `render.mjs` pads silence (`apad`).
- `CANVAS` and `SAFE` set the canvas and its safe band (see
  [Canvas and safe band](#canvas-and-safe-band)). `POST` in timeline.js sets project-wide post
  defaults. `HUD` configures the frame.

## Fonts and 3D assets

- Canvas fonts loaded by `index.html`/`main.js`: `Archivo` (variable: wght 100-900, stretch 62-125%
  via `stretch:'125%'`), `Archivo Black`, `Anton`, `JetBrains Mono`, `Doto`, `Black Han Sans`,
  `Unbounded`, `Instrument Serif` (+ italic). To add a project font, drop the TTF in
  `assets/fonts/`, add an `@font-face` in `index.html` and a `document.fonts.load` line in
  `main.js`.
- 3D type fonts: `E.text3D(str, {font:'ArchivoBlack'|'Anton'|'BlackHanSans'})`. Add more with
  `core.loadFont3D(name, url)` in `main.js`.
- `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'` and `SVGLoader` are available.
  Assets are served from the project root (`/assets/3d/*.glb`, `/assets/brand/*.svg`).

## Commands

- `node tools/still.mjs --only <id>,hud --range a:b:step --scale 0.5 --dir out/<id>/it1 --sheet sheet --cols 4`
  (or `--t 1.2,3.4`; add `--safe` to outline the safe band, `--canvas portrait` for the other ratio)
- `node tools/render.mjs --only <id>,hud --from a --to b --fps 30 --scale 0.5 --out out/<id>/preview.mp4 --force`
- Full:
  `node tools/render.mjs --fps 60 --scale 1 --workers 3 --crf 17 --out out/final/master.mp4 [--variant b] [--to <end>] [--canvas portrait]`
- 4K master: the same with `--scale 2 --out out/final/master_4k.mp4` (`pipeline.md` §8).
- Motion blur for one run: add `--blur` (or `--blur off`) to `render.mjs` or `still.mjs`.
