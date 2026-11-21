# Motion runtime

Plain `<script>` (no build step), needs only `vendor/gsap.min.js` (GSAP 3.12.5). One global, `Motion`.
Frames are the unit (30 fps default). Every frame is a pure function of `t`: jumping to any frame equals playing to it.

```html
<link rel="stylesheet" href="./runtime/fonts.css">          <!-- Inter variable, OFL -->
<script src="./runtime/vendor/gsap.min.js"></script><script src="./runtime/motion.js"></script>
```
Copy `runtime/` next to your film (`film/runtime/`, paths `./runtime/` as above) or reference it by absolute path. Start from `templates/film.html`; see `examples/demo/index.html` (paths `../../runtime/`, because it lives two levels below the skill root).
Optional layers: `runtime/hero3d/` (Three.js hero object, `M.hero3d`) and `runtime/native-ui/` (iOS phone / notification builders); examples `examples/3d-hero`, `examples/phone`.

## Seek contract
`Motion.film()` registers `window.__timelines.main`, `window.__seek(t)`, `window.__duration`, `window.__events`, and writes
`data-composition-id/start/duration/width/height` on `#main`. `scripts/render.mjs` drives `__seek`. Rules for your own code:
author only through `M.*` (or `M.tl` with `fromTo` + `immediateRender:false`); never `setTimeout`, `Math.random`, `Date`, CSS animations.
Two tweens must not overlap on the same property of the same element (e.g. `M.drift` scale and `M.press` scale on one node): put one on a parent.
`kf`, `enter`, `snap` etc. all set the element's first value at time 0, so the page also looks right before any seek.

## Film
```js
const M = Motion.film({ fps: 30, duration: 15, width: 1920, height: 1080, clock: 'smooth' });  // 'twos': even-frame onsets, __seek holds each pose 2 f
M.tl; M.f(12);          // paused gsap timeline; frames -> seconds (0.4)
M.twos(7);              // 6 (nearest even frame at or below)
M.mark(66, 'cut', 'A to B');   // record an event; cut/show/press/enter/exit/word/type/count/snap/whip/dive auto-record
window.__events;        // [{t, frame, type, label}] sorted by frame: place audio on these
```

## Eases (`M.ease.*`, also `Motion.ease`) - measured from 53 human-made films, f(0)=0, f(1)=1
`crashIn` (hit + 1.18 overshoot) `popOver` (late 1.08) `bounceHard` (1.48) `snapSettle` (hero entry) `softLand` (workhorse ease-out)
`whip` (big move) `glide` (gentle out) `cruise` (linear) `softInOut` `gentleIn` `accelExit` `crashOut`. Anywhere an `ease` is accepted you can pass a
name, one of these functions, or a GSAP ease string. Typical frames: `Motion.easeFrames` (softLand 12, whip 7, accelExit 13 ...).

## Keyframes and visibility
```js
M.kf('#box', 'x', [[0, 0], [30, 400, 'whip'], [60, 0, 'accelExit']]);          // [frame, value, easeOfSegmentEndingHere]; default linear
M.kf('#box', 'opacity', [[0, 1], [20, .2]], { ease: 'softInOut' });              // opts: ease (name | array per segment), fmt: v => v + 'px', step: 2 (hold poses)
M.kf('#g', '--b', [[0, 12], [6, 0]], { fmt: v => v + 'px' });                    // CSS vars and any gsap prop work
M.kf('#x', 'opacity', [[0, 1], [40, 1], [40, 0], [90, 0]]);                      // DUPLICATE frame = a hard step: 1 on frame 39, 0 on frame 40 (no tween in between)
M.show('#tag', 40, 70);                                                          // visible on frames 40..69 (hard cut in, hard cut out); off omitted = stays
M.hide('#tag', 120);                                                             // hard hide from frame 120
M.cut(66, { hide: ['#sceneA'], show: ['#sceneB'] });                             // several swaps on one frame; labelled in __events
```
**Visibility is ONE track per element.** `show`, `hide`, `cut`, `enter`, `exit`, `cursor` each add a hard on/off op at a frame; the state on frame `f` is the *last op at or before `f`*
(same frame: authored later wins). So `M.enter(el, {at: 20})` + `M.show(el, 20, 70)` is visible on [20, 70) and hidden again from 70, and an explicit later hide always wins.
An element whose first op is an "off" (an `exit` / cut-hide on something never shown) is visible until it; before its first "on" an element is hidden.
An element authored `style="visibility:hidden"` is fine (the spelling does not matter to the runtime or to `selfTest`). `M.type` owns its caret's `visibility`.

## Enter / exit
```js
M.enter('#panel', { at: 66, frames: 12, ease: 'softLand',
  from: { x: 0, y: 46, scale: .93, rotation: 0, blur: 0, opacity: 0 },            // any subset; lands on neutral (or opts.to)
  smear: { axis: 'y', px: 30, frames: 3 } });                                     // directional blur, strongest on the FIRST frame, decays over 3 f
M.exit('#panel', { at: 120, frames: 12, ease: 'accelExit', to: { y: -80, blur: 6 }, smear: true, hide: true });  // smear peaks on the LAST frame; hides at the end
```
`blur` is a CSS var (`--b`) read by the element's filter; smear is a per-element SVG `feGaussianBlur` made for you. The element is hidden before `at` (and, if you also
`M.show(el, a, b)`, hidden again after `b`; see "Visibility is ONE track").

## Words
```js
const onsets = M.words('#headline', { at: 2, mech: 'rise', gaps: [5, 4, 7], dist: 84, frames: 13, ease: 'softLand',
  smear: true, accent: { color: '#F2542D', frames: 24, word: -1 }, fixedSlots: false });   // returns onset frames
```
`mech`: `rise` (y), `slide` (x), `pop` (scale from `dist`=.5), `shrink` (from 1.6), `focus` (blur + opacity). `gaps`: number or per-word frames
(default speech-like: 4, 3 ... slower last). `accent.word`: index, -1 last, array or `'all'`; it tints on arrival and settles to the ink colour.
`fixedSlots:false` keeps the visible line centred (widths measured once, line x glides); single line only. Words are never split into letters.

**Per-word options.** `dist` may be a number, an array (the last value repeats) or `(i, word) => number`. For everything else give `words` (array, or `(i, word) => object | null`):
```js
M.words('#headline', { at: 0, mech: 'rise', dist: 60, accent: { color: '#F2542D', word: -1 },
  words: (i, w) => (i === 2 ? { dist: 160, scale: 1.25 } : null) });          // the thesis word enters further away AND bigger (lands on neutral)
M.words('#h', { mech: 'pop', words: [{}, { frames: 18 }, { from: { scale: 2.4 }, accent: '#F2542D' }] });
```
Keys: `dist` (that word's travel), `scale` (START scale for any mech: lands on 1, so 1.25 = enters 25 % bigger and comes down), `from` (explicit start pose, wins over dist/scale),
`frames`, `ease`, `accent: true | '#colour' | {color, frames} | false` (true = the film-level `accent` colour; false = no accent even if the word is in `accent.word`). Words keep their layout size (transforms do not reflow), so use `scale` for entry only.

## Typing
```js
const ev = Motion.cadence('Summarise Tuesday\'s calls', { style: 'prompt', seed: 5, start: 0, cps: null });   // [[frame, nGraphemes], ...]
M.type('#prompt', { at: 74, style: 'prompt', seed: 5, caret: '#caret', caretGap: 6, recenter: false,
  accentNewest: { color: '#F2542D', frames: 2 } });                                // or events: [[0,2],[3,5],[8,'all']]
```
`style`: `prompt` (1-3 chars/frame bursts), `compose` (1 char per 2-4 f, 4-10 f after spaces), `fast`. Same `seed` gives the same rhythm. The target
element's text is the final text; `M.type` makes it `white-space:pre`. `recenter:false` reserves the full line width (left anchored);
`true` shrink-wraps so a centred host re-centres every event. The caret must share an offsetParent with the text (it is positioned by `left`); `caretOff:frame` hides it.

**Multi-line and pre-styled text.** The host may contain real line breaks (`\n` in the text, or `<br>`) and child elements with their own classes/styles:
```html
<div id="code" style="position:absolute;white-space:pre;font:52px/76px ui-monospace"><span class="k">const</span> <span class="v">name</span> = <span class="s">'Maya'</span>;
<span class="k">await</span> <span class="v">send</span>({ to: <span class="s">'a@b.dev'</span> });</div>
<div id="caret" style="position:absolute;left:0;top:210px;width:6px;height:60px;background:#F2542D"></div>   <!-- top = the FIRST line -->
```
```js
M.type('#code', { at: 104, style: 'fast', seed: 3, caret: '#caret', accentNewest: { color: '#F2542D', frames: 2 } });
```
The text is revealed grapheme by grapheme across the children; each span keeps its class (syntax colours survive), spans not yet reached are absent (no empty pills), and a line break
costs a short pause. The caret follows the last revealed glyph in 2D: `left` always, `top` too when the text has more than one line (offset from the caret's own authored `top`,
which is therefore the first line's position). Write the markup tight (no indentation inside the host: whitespace is typed too). `accentNewest` paints the newest glyphs even inside a styled span.

## Cursor and press
```js
M.cursor('#cursor', { keys: [[96, 2050, 1260, 3.4, -28], [121, 1498, 548, 1, 0]], ease: 'glide', twos: false });   // [frame, x, y, scale, rotation], about the TIP (origin 0 0)
M.press('#cursor', '#send', { at: 127, cursorDepth: .8, targetDepth: .8, lag: 1, frames: 3, release: true });     // target reacts `lag` f later; no ripple
```
Draw the cursor with its tip at the element origin. `press` extras: `hold`, `releaseFrames`, `cursorBase/targetBase` (resting scale), `targetStep: {backgroundColor: '#..'}` (hard colour step).
Cut on a frame before the release to land on maximum compression.

## Camera family
**transform-origin is a per-element track, not one static value.** `camera` (from its first key), `snap` and `dive` (from `at`) and `cursor` (whole film) each *claim* an origin from their
own start frame; the runtime switches it on that frame with one renderer, so seeking is safe. The console warns once (and tells you the fix) when
(a) two claims with different origins overlap in time on one element, or (b) the origin switches while the earlier claim ended scaled/rotated (the element would visibly jump).
Whenever two moves need different origins at the same time, or you want a clean mental model, **nest wrappers**:
```js
const wA = M.wrap('#box');            // new <div class="mwrap"> that takes over #box's layout role; returns it (wrap a wrapper for another level)
const wB = M.wrap(wA);
M.camera('#box', [[172, { scale: 1 }], [190, { scale: 1.6 }]], { origin: '0% 0%' });        // about the box's own top-left
M.snap(wA, { at: 200, from: { rotation: 20 }, to: { rotation: 0 }, origin: '100% 100%' });
M.dive(wB, { at: 222, frames: 6, perStep: 1.3, origin: [900, 300] });
```
A wrapper around an absolutely positioned element fills its parent (`left:0;top:0;width:100%;height:100%`), so **its origin is in the parent's px** (scene coordinates); around an in-flow
element it is a block/inline-block of that element's size. `z-index` is copied. Remember `from` values (snap, enter) apply from frame 0: a wrapper you only use later still sits at its `from` pose until then.
```js
M.camera('#cam', [[0, { scale: 1 }], [30, { scale: 1.4, x: 80 }, 'softInOut']], { origin: '50% 50%', ease: 'glide' });
M.snap('#cam', { at: 157, from: { scale: 2 }, to: { scale: 1 }, firstFrameShare: .6, tail: 15, origin: '960px 440px' });  // frame at+1 is already 60% there, then a decelerating tail
M.whip('#cam', { at: 120, dx: 300, dy: -50, frames: 8, smearPx: 40 });          // fast pan with smear on the first frames
M.dive('#cam', { at: 130, frames: 9, perStep: 1.6, origin: [960, 540] });       // constant-octave zoom: scale x1.6 every frame, never slows
M.drift('#cam', { prop: 'scale', from: 1, to: 1.05, start: 0, end: 270 });      // linear, never-freeze creep (prop: scale | x | y | rotation)
```

## Count and cascade
```js
const vals = M.count('#num', { at: 130, from: 0, to: 10000, frames: 23, round: true, format: 'comma', skip: .12, seed: 2 });  // one value per frame, steps decay, lands on `to`
M.cascade(['#a', '#b', '#c'], { at: 50, gaps: [3, 2], fn: (el, frame, i) => M.enter(el, { at: frame, from: { y: 40 } }) });      // returns the onset frames
```
`format`: `'comma'` or `v => '$' + v`. Digits are never eased and use tabular numerals.

## Self test
```js
Motion.selfTest(M, { samples: 24 });   // -> { ok, samples, elements, mismatches: [...] }; also window.__seekcheck and a console line
```
Plays frames 0..N in order, then jumps to 24 random frames (via a detour, so each is a real jump, backwards included) and compares every element's
attributes, inline style (compared as a parsed property map: `visibility:hidden` and `visibility: hidden`, declaration order and colour spelling can no longer cause a false FAIL),
computed transform and own text, **and the pixels of every `<canvas>`** (see "Canvas hashing" below). Open any film with `?selftest` (template/demo wire it) to run it. Wire it as `window.__ready = Motion.loaded().then(() => ...)`:
`Motion.loaded()` resolves after fonts AND the load event; text measurement is only cached then, and a selfTest started earlier can take a minute.
`Motion.loaded()` also waits for every `M.hero3d` scene (module + fonts + env + shader compile), so `window.__ready = Motion.loaded()...` is all a 3D film needs.
`examples/selftest/index.html` is the regression page for this runtime (visibility composition, per-word options, multi-line styled typing, origin claims, `kf` steps); it must print `PASS` and `[asserts] PASS`.

## 3D (hero3d)
Real light and depth for ONE hero object: Three.js r186 vendored in `runtime/hero3d/` (no CDN, no importmap, no build), seek-safe. `M.hero3d` puts it on the film clock; the timeline stays the single clock.
```html
<canvas id="gl" style="position:absolute;inset:0"></canvas>          <!-- inside #main; transparent: the ground/type live in HTML under or over it -->
<script>
const hero = M.hero3d('#gl', {                                         // a <canvas>, or any container (a canvas is created inside)
  envMap: 'studio', toneMapping: 'neutral',                            // 'studio' (black cyc + softboxes) | 'room' | plate.jpg | x.hdr/.exr
  key: { position: [-6, 6.5, 6], intensity: 2.2 }, rim: { position: [6, 3, -6], intensity: 4 }, ground: { y: -1.6, opacity: .38 },   // ground = shadow catcher only
  camera: { fov: 30, position: [0, .3, 11], target: [0, -.7, 0] },
  objects: [
    { id: 'mark', kind: 'group' },                                     // a mark built from parts is ONE subject: parts take parent:'mark'
    { id: 'ring', parent: 'mark', kind: 'logo', svg: RING_D, center: false, perUnit: .0155, ref: 3.1, depth: .12, material: 'satin', color: '#2b3a78' },
    { id: 'dot',  parent: 'mark', kind: 'logo', svg: DOT_D,  center: false, perUnit: .0155, ref: 3.1, depth: .12, material: 'brandPlastic', color: '#F2542D' } ],
  state: (t, objs, { key, pulse, f }) => ({                            // pure function of t (SECONDS, quantised to the film frame; twos clocks already hold even frames)
    camera: { position: key(t, [[0, [1.8, 1, 14]], [3.4, [.1, .35, 11], 'glide']]), target: [0, -.72, 0], fov: 30 },
    objects: { mark: { rotation: key(t, [[0, [.62, -1.75, .2]], [1.5, [.1, -.36, 0], 'snapSettle']]) },
               dot:  { position: key(t, [[.3, [.15, 3.6, .5]], [1.3, [0, 0, 0], 'gentleIn']]) } },
    keyIntensity: 2.2 + 1.6 * pulse(t, 1.34, .09) }) });               // also: sweep (0..1 travelling softbox), bloom, focus, exposure, envIntensity, keyPosition, rimPosition, warpTime, animTime
M.words('#line', { at: 84, mech: 'rise' });                            // Motion beats on the same clock; HTML type sits over/under the canvas
window.__ready = Motion.loaded();                                      // includes the 3D scene (M.hero3d also sets __ready if you did not)
</script>
```
Returns `{ canvas, ready, hero, H, THREE, key, pulse }` (`hero`, `H`, `THREE` after `ready`). Runs on the same renderers as everything else: every `__seek` draws the frame, so `render.mjs`, stills and `selfTest` all work unchanged.
* **State contract.** Before `state` runs, every object, light and the camera is reset to base. Anything `state` does not touch is back at base, so frame N is identical jumped-to or played-to. Return `{ camera, objects: { id: { position, rotation, scale, visible } }, ... }`, or mutate `objs[id]` (Object3D) directly. `ctx = { f, t, W, H, THREE, scene, camera, keyLight, rimLight, key, pulse, ease, rng, hero }`.
* **Time.** `state` is in seconds (hero3d's `key(t, [[sec, value, ease?]...])`, ease belongs to the segment arriving at that key; arrays interpolate per component). Convert film frames with `M.f(n)`. The measured Motion eases (`softLand`, `whip`, `glide`, `snapSettle`, `gentleIn` ...) work by name inside `key`.
* **Objects.** `kind`: `logo` (SVG: path `d`, array of `d`, or `<svg>` markup, filled shapes only, holes by winding; `size` = width in world units, or `perUnit` + `center:false` + `ref` for parts that must line up; `depth`, `bevelThickness`, `bevelSize` are fractions of `size`/`ref`; bevel normals are creased so lacquer does not facet), `extrudedText`, `coin`, `glassSlab`, `phone`, `gltf`, `group`. Or build your own: `build: (THREE, scene, camera, ctx) => ({ id: Object3D })` (they join the reset and `state.objects[id]`). Materials: `chrome`, `glass`, `satin`, `iridescent`, `brandPlastic` (`MeshPhysicalMaterial` recipes; override with `materialParams`; `warp:{amount,scale}` bends the shading normal so flat faces show bands of the environment instead of one tile).
* **Choose the material from the brand, not the preset.** Lacquer/plastic in the brand colour, satin metal, glass; chrome-on-black with bloom is the house style to avoid. Flat extruded faces reflect one direction: use bevels, a `warp`, a travelling `keyPosition`/`sweep`, or tilt the object. Use a light ground when the brand is light (the canvas is transparent), keep `bloom` off unless a real highlight needs it (`threshold` is in linear HDR; strength 0.03-0.08), `tone mapping 'neutral'` keeps brand colours (`'agx'` desaturates a saturated accent).
* **Rules.** One hero object, spent on one event, never on two consecutive beats. Never `requestAnimationFrame`, `Math.random`, `Date` in `state` (use `ctx.rng(seed)`). Canvas `pixelRatio` is pinned to 1. A page with any WebGL canvas must be rendered in ONE mode (see GPU vs SwiftShader).
* **ES module, not a classic script.** `M.hero3d` `import()`s `runtime/hero3d/hero3d.js` relative to `motion.js` (all vendored addons import `vendor/three.module.js` by relative path, so no importmap and no second copy of three). Module imports and the font/gltf/env fetches need `http(s)` or Chrome's `--allow-file-access-from-files`: `scripts/render.mjs` sets it, a double-clicked `file://` page will not draw 3D. Preview with `node scripts/render.mjs film.html --still t1,t2,t3 dir` or `python3 -m http.server`. If `motion.js` is inlined, pass `{ module: '<url of runtime/hero3d/hero3d.js>' }`. A failed import or no WebGL rejects `__ready`, so a render fails loudly instead of shipping a blank canvas.
* **3D text and fonts.** `extrudedText` uses opentype.js: it reads `.ttf/.otf/.woff` but NOT woff2 and ignores variable axes. `hero3d/fonts/Inter-Bold-Latin.ttf` is the default. For the brand face (brand.mjs downloads woff2/variable): `python3 runtime/hero3d/tools/fontconv.py brand.woff2 out.ttf --wght 700 [--text "Fathom" | --latin]` (fontTools + brotli; instances variable axes, unwraps woff2, optional subset).
* **Vendor.** `hero3d/vendor/` = three r186.1 + addons + opentype.js (licences alongside, 3 MB). The only edit: addons import `'three'` by relative path (`../../three.module.js`) instead of the bare specifier; `SVGLoader.js` was added for logos. Re-vendoring: copy the addon, then `sed "s#from 'three'#from '../../three.module.js'#"`.
* **Direct use** (no Motion): `import { createHero3D, key, pulse } from './hero3d/hero3d.js'`, `const h = await createHero3D(canvas, opts); h.renderAt(t, state?, frame?)`.

## Phone UI (native-ui)
True-proportion iOS furniture (393 x 852 pt device, 1 unit = 1 pt via `--s`), for when the product's real UI cannot be captured. If a real screenshot exists, use the screenshot. `runtime/native-ui/native-ui.{css,js}` (plain script, after `motion.js`):
```js
const icon = NativeUI.appIcon({ bg: 'linear-gradient(180deg,#8a7cff,#4636d9)', glyph: '<svg viewBox="0 0 38 38">...</svg>' });   // superellipse, 38 pt in a notification
ui.innerHTML = NativeUI.phone(NativeUI.lockScreen({ time: '7:52', date: 'Monday 5 October', wallpaper: 'radial-gradient(...)',
  notifs: [{ icon: cadence, title: 'Standup moved to 10:30', time: '8m ago', body: '...' },        // OLDEST first; the last one is the newest (bottom)
           { icon, title: 'Priya Raman', time: 'now', body: 'Landed early. Meet me at door 4? I have two bags.' }] }), { time: '7:52' });
NativeUI.arrive(M, '#ui .nu-notif:last-child', { at: 18, dir: 'up', frames: 14, push: ['#ui .nu-notif:first-child'] });   // returns the landing frame
NativeUI.macro(M, '#ui .nu-notif:last-child', { at: 58, frames: 28, world: '#cam', fill: .62 });                       // returns the end frame
```
* **Builders** (return HTML): `phone(screen, {dark,time,battery,status})`, `statusBar`, `appIcon`, `notification` (needs `title`, `body`, `icon|app`; throws otherwise), `banner` (the same, dropped over any screen), `lockScreen` (padlock, date, clock, stack, torch + camera), `list(rows)`, `tabBar(tabs, on)` (glyph names in `NativeUI.GLYPH` or inline `<svg>`), `appScreen`. Wrap in `<div class="nu" style="--s:.8">`: `--s .8` = device 0.63 H (a device in context is 45-65 % of frame height), `--s 2.6` = one notification 960 px wide. Set `--app-font` to the brand font for the brand's own UI. Do not put `filter` on an ancestor of `.nu-notif` / `.nu-tabbar` (it kills their backdrop blur).
* **Identity or nothing.** Every UI needs an icon, a sender/subject, a time and a sentence a person would write; no "label . value" cards, no greeting headers. Invented apps and people are fine: say "illustrative" in NOTE.md. Real status bar (time, signal, wifi, battery level), real tab bar (49 pt + home zone, 25 pt glyphs, 10 pt labels).
* **Motion = Motion.** `arrive` is `M.enter` (hard appearance outside the screen's clip, measured `softLand` travel, short y smear, no opacity ramp) plus an `M.kf` y pair for the siblings that make room; `dir:'up'` (lock screen roll-up, new one last) or `'down'` (banner). `macro` is `M.camera` on `world`: zoom about the fixed point that lands the target at the frame centre (a straight push, not a slide), `fill` = share of frame width, default ease `glide`. Positions come from `offsetLeft/Top` (transform-free), so the helpers are right even after other moves set a start pose; `world` must be positioned. Readability comes from the camera (body text ends at about 0.045 H with `--s .8`, `fill .62`), never from bigger fonts.
* The device is a whole-frame hero only as the wide shot of a macro move; otherwise crop it. `examples/phone/index.html` is the reference (invented apps).

## Canvas hashing (selfTest)
`Motion.selfTest` snapshots every `<canvas>` as well as the DOM: it draws it into a 2D scratch canvas and FNV-hashes the RGBA words, in both the sequential pass and the random-jump pass, so a WebGL scene that depends on history (a leaked clock, an unreset transform, `Math.random`) shows up as `mismatches` with `|canvas:<hash>` in the entry. The result has `canvases: n`. While stepping through frames nobody will snapshot, `M.hero3d` skips drawing (`window.__mdSnap === false`), so a 24-sample test of a 6 s 3D film costs about 50 draws, not 360. Negative test (done): a `state` that reads a call counter fails with 8/8 mismatches.

## Performance and determinism notes (WebGL)
* Speed: a hero scene with MSAA and no post is about 11 fps at 1080p on an Apple GPU (Metal/ANGLE); with bloom + DOF about 7 fps; SwiftShader (software GL, Linux/CI) is slower still. A 16 s film is 1-3 minutes at 1x. DOM/filter-heavy beats (the phone's backdrop blurs) run about the same.
* `render.mjs --scale 0.5` shrinks the screenshot, not the WebGL draw (the canvas buffer stays W x H), so a half-scale draft barely speeds up a 3D film. Instead render only the hardest beat: `node scripts/render.mjs film.html out.mp4 --from 2 --to 4`, and use `--still` for look checks (a still is a couple of seconds after about 5 s of page startup).
* `Motion.selfTest` is cheap (see above); run it before any long render.
* **GPU vs SwiftShader.** `render.mjs` launches Chrome with `--enable-unsafe-swiftshader --ignore-gpu-blocklist`, so WebGL runs on whatever Chrome picks: the real GPU where there is one, software otherwise. The two differ slightly (about 38 dB PSNR on a chrome scene; DOM text is identical). Pin one mode for a whole film: never resume a chunked render, or re-render one beat for a fix, on a different machine/mode than the rest; hard cuts hide it, a continuous move does not. Check which you have: `getParameter(UNMASKED_RENDERER_WEBGL)` ("ANGLE (Apple ... Metal)" = GPU, "SwiftShader" = software).

## Sound sync hooks (CLI side)
`scripts/render.mjs` writes `<out>.events.json` (the `window.__events` list) next to every video; `look.py` reads it for exact cut frames and reports the end hold. Use the same file to place sound.

## Limits
Smear/blur filters need the element to have room (filter region is -50%..+150% of its box). Smear is along the element's local axis. `fixedSlots:false` and
`M.type` measure text once fonts are loaded (render.mjs waits for `document.fonts.ready`). On `clock:'twos'` quantisation happens inside `__seek`; if you seek
`__timelines.main` directly you get smooth poses.
