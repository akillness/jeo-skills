# The spec and the blocks

## spec.js

```js
import { Words, Strike, Graph, Hero, Prompt, Stretch, Fly, Notes, Counters, Progress, Chain, Rewind, Picture, Logo } from './blocks.js';
export default {
  title: 'My film',
  bpm: 172, beats: 68, fps: 60,                      // the film is `beats` beats long
  palette: { bg: '#0B1020', paper: '#F3EEE3', accent: '#FFC21A', hot: '#FF8A1F', ink: '#14120E' },
  hud: 'MY FILM  ·  TEASER', hudOut: [65, 67],        // corner brackets, frame counter, REC, timecode; false hides it
  logo: 'logo.svg',                                   // optional; without it the Logo block types a wordmark
  music: { file: 'audio/music.mp3', offset: 7.95, stopBeat: 58, gain: -7 },   // offset: seconds into the track at beat 0
  sounds: { stomp: -1, hit: 1 },                      // level in dB per sound name (custom sounds, or retune a kit sound)
  cues: [[5.5, 'stomp', 1]],                          // extra sounds at beats: [beat, name, gain]
  scenes: [ [Block, startBeat, endBeat, options], ... ],
  captions: [ [startBeat, endBeat, [['Fourteen', 1], ['blocks', 2.5], ...]], ... ],   // optional karaoke caption, top left
};
```

- Palette names (`'bg'`, `'paper'`, `'accent'`, `'hot'`, `'ink'`) work anywhere a color does. Any
  CSS color works outside the palette.
- Palette values must be 6-digit hex (`#RRGGBB`) or `rgb()`, the two forms the engine parses without
  a browser: `validate.js` rejects `#fff` or `white` there.
- `bg` is the dark ground, `paper` the light ground and light type, `ink` type on light grounds,
  `accent` the brand color. Grounds other than `bg` switch the HUD and caption to ink.
- Keep `fps: 60`. The HUD and the checks in finish.py assume 60.
- Blocks with a nominal length (N beats) scale their internal timing to the span you give them. Keep
  close to N.
- Every block accepts `whipIn: [dx, dy, dur, roll]` and `whipOut: [...]`: a whip pan of the camera
  with a long-shutter smear and a whoosh, landing or leaving the block. `dir: -1` mirrors its camera
  roll.

`validate.js` checks the spec before the film builds:

- An error stops the boot with a message naming the scene; info.mjs, render.py, mix.py and finish.py
  print it and exit 1. Errors include a scene past the last beat, an unknown shot style, shots out
  of order, a bad palette color, and a block missing its own words or image: Picture `src`, Stretch
  `word`, Notes `preview`, Progress `lines`.
- A warning prints and the film still builds: `fps` other than 60, a `music.stopBeat` off the logo
  hit.

## Words (sequencer, absolute beats)

Kinetic type, one shot per beat or half beat. Shots ascend and sit inside the block.

```js
[Words, 0, 8, { charge: true, shots: [ { at: 1, style: 'punch3d', text: 'FOURTEEN', fx: 'punch' }, ... ],
                exit: { type: 'zoom', at: 7.2, char: 4 } }]
```

Shot options:

- **`at`**: the beat the shot starts (absolute).
- **`style`**: one of the six below; `slam` when omitted. `stack`, `pair` and `split` take
  `text: ['first', 'second']`, the others one string.
  - `punch3d`: an extruded word from depth with an echo trail.
  - `slam`: a huge word, letters tumble in, ghost rows scroll above and below.
  - `stack`: `[kicker, word]`, the word slams `second` beats later with an accent bar.
  - `pair`: `[line1, line2]` from both sides.
  - `split`: `[small, big]`, the big word slams from the right `second` beats later.
  - `cut`: a hard-cut word, for runs of beat cuts.
- **`ground`, `color`**: the background for the shot (a palette name); the type color (readable on
  the ground by default).
- **`size`, `wdth`, `y`, `dy`, `rot`**: type size in px, width axis 62 to 125, vertical position,
  offset, rotation (cut).
  - `cut` reads `size` (px, default 400), `wdth` (default 104), `dy` (px from the frame's vertical
    center, default 0) and `rot` (degrees, default 0). The word ignores `y`, but the `fx: 'punch'`
    sparks follow it (540 when unset): with `dy`, set `y` to `540 + dy` too.
  - A `cut` word wider than 1800 px shrinks to fit. A narrower one keeps its `size`.
- **`in`**: `cut` (default), `whipX`, `whipXr`, `whipY`.
- **`fx`**: `punch` (rays, ring, sparks, flash, shake), `hit` (flash and shake), `beat` (shake and
  bump only, for runs of cuts), `none`.
- **`cue`, `gain`, `big`**: the sound on the hit (default from `fx`), its gain, `big: true` for the
  heavier impact.
- **`second`**: for stack, pair and split, beats until the second element.
- **`scramble: [a, b]`, `glitch`, `inverts: [..]`**: a glyph scramble between beats a and b
  (relative), an RGB glitch, invert flashes.
- **`flip: { at, ground, color }`**: change ground and color mid-shot (relative beat).
- **`dot`, `glyphs`, `code`, `note`, `noteAt`**: accent the last character; a burst of code glyphs;
  the film's source as a backdrop (split); a mono line typed under the word.
- **`echo: false`, `tumble: false`, `from`**: no ghost rows; no letter tumble; the starting scale of
  the slam.

`charge: true` draws converging speed lines into a glowing point before the first shot. `exit` is
one of:

- `zoom`: the camera flies through the counter of letter `char` of the last shot. Pick a letter with
  a hole: O, D, 0, A, B, P, R.
- `collapse` (`at`, `end`): everything shrinks into the point a logo line can grow from.
- `flash`: to white.

## Strike (sequencer)

"NO <thing>." over a mock of the thing, then the thing dies.

```js
[Strike, 16, 27, { no: 'NO', items: [
  { at: 16, word: 'GUESSWORK.', ui: { type: 'timeline', title: 'cut_guess_v7', tag: 'GUESSING  12%' } },
  { at: 19.5, word: 'PRESETS.', ground: 'paper', ui: { type: 'tiles', tiles: [['BLUR', '◆', 'PRESET 01'], ...] } },
  { at: 23, word: 'QUEUE.', ui: { type: 'rack', rows: ['QUEUE 01', 'QUEUE 02', 'QUEUE 03'] } } ] }]
```

Per item: the mock enters, NO slams at +1 beat, the word fills at +1.5, the mock dies at +2.
`timeline` is split by a slash, `tiles` topple, `rack` powers down at +2.5. Items after the first
whip in. The last item ends in a TV switch-off point (`tvOff: false` to skip). Give each item 3 to 4
beats.

## Graph (N = 6)

`{ number: '0', label: 'CUTS', sub: 'OFF THE BEAT', ground: 'paper', ticks: i => i * 4 + 'f', portal: true }`.
Two comets draw axes out of the switch-off point. The camera rides the comet that draws a curve, the
keyframes pop, the graph folds, and the number lands with echo rings. Then the camera flies through
its counter (a dark portal) into the next block. Use a number with a hole for the portal, or
`portal: false`.

## Hero (N = 8)

`{ kicker: 'YOU ARE', title: 'THE POST.', sub: 'press start to deliver', chevron: '> ', landZoom: 1.7 }`.
The kicker tumbles in and a comet spirals to the center. The extruded title flies out of depth,
orbits, flips once, and a light sweeps it twice. Ghost copies fan out behind it, and the sub line
types with a caret.

## Prompt (N = 19)

`{ label: 'BRIEF.md', text: [['plain '], ['keyword', 1], ...], unit: 'CHARS', doodles: true }`. A
comet draws the box and the text types itself while the camera follows the caret. Keywords highlight
and pop, the camera pulls back, and the keywords pulse. Then the camera pushes into the Enter key
through converging speed lines until its accent color fills the frame on the last beat. Start the
next block on an accent ground and it reads as the drop. Typing always fills beats 1.3 to 11.4,
whatever the length.

## Stretch (N = 8)

`{ word: 'BOUNCE.', grounds: [[0, 'accent'], [4, 'paper'], [5, 'accent']], code: true }`. A word on
the variable width axis: drop slam, elastic stretch, a weight dip, a squeeze, a stretch, spreading
letters. Ghost rows lag behind, with a live ruler and the CSS that drives it.

## Fly (N = 11)

`{ words: [['DODGE', 'paper'], ['THE', 'accent'], ['BIG', 'paper'], ['FEET.', 'accent']] }`.
Extruded words in depth inside chamfered portals. The camera flies through them with a banked roll
and tunnel dust, lands on the last word and orbits it. Use 3 to 5 words.

## Notes (N = 16)

`{ preview: 'BOUNCE.', notes: [['make it warmer', 'recolor'], ['shorter opening', 'trim'], ['louder on the hits', 'punch']], segments: [['HOOK', 180], ...], tag, panel, file }`.
Segment widths sum to 1000 px. Three notes are typed into a panel while the camera moves between the
input, the preview and the timeline. Each note's effect plays: recolor the preview, halve the first
segment with a slash, punch on every beat over a starburst. The note being typed runs huge across
the frame.

## Counters (N = 11)

`{ counters: [['14', 'BLOCKS'], ['{lines}', 'LINES OF SOURCE'], ['{frames}', 'FRAMES RENDERED']], title, source }`.
The film's own source (or `source` text) is a plane the camera flies over. Giant numbers land on
slot reels, one every 3 beats. `{lines}`, `{frames}` and `{seconds}` are filled from the film.

## Progress (N = 9)

`{ lines: ['DRAWN', 'FRAME BY FRAME.'], cards: [['FOURTEEN', 'bg', 'paper'], ...], label, doneLabel, doneRight, ground: 'paper' }`.
Line 1 renders itself (outline, then a scan line fills it) and line 2 slams. Frames of the film ride
a conveyor past a render head, outlined until they pass it. A progress bar and a frame counter run
to done.

## Chain (N = 12)

`{ nodes: [['BRIEF', 'brief.md'], ['BEATS', '{seconds} s on the grid'], ['FILM.', '4K · 60 FPS · {frames} frames', 'accent']] }`.
Three words 2,000 px apart in one world. The camera rides the comet from node to node, each lands
with a ring, then the camera pulls back to show the chain and its trails.

## Rewind (N = 8)

`{ from: seconds, label: 'PLAYBACK' }`. The film so far plays backwards inside a tilting playback
window and lands on its first frame as the window fills the screen.

## Picture (N = 8)

```js
[
  Picture,
  8,
  16,
  {
    src: "art/key1.png",
    words: [
      [1, "MONSTERS"],
      [3, "NEXT DOOR.", "accent"],
    ],
    reveal: "slash",
    focus: [0.55, 0.45],
    tint: 0.3,
    weather: "rain",
    cutIns: [[5, 1.65, [0.62, 0.2], "stomp"]],
    x: 1380,
    y: 560,
  },
];
```

- The image cuts in along a slash (or zooms in), then pushes and pans with a slight 3D tilt.
- It punches in on every word and hard-cuts in to details: `cutIns: [[beat, scale, [fx, fy], cue]]`,
  positions 0 to 1 of the image. A cut-in's cue plays at a fixed level: a hit that needs its own
  level goes in `spec.cues` (`[beat, name, gain]`) instead, since `spec.sounds` raises every use.
- `words: [[beat, text, color]]` and `cutIns` count beats from the block's start, on its 8 nominal
  beats scaled to its span. In a block from 8 to 16, `[1, 'MONSTERS']` lands on beat 9.
- A weather layer rides over it: `rain`, `snow`, `dust` (the default), or `null`. Only `rain` keeps
  the picture moving between words. Under the others, put a word or a cut-in on every beat: two
  words and one cut-in over 8 beats held 0.88 s under `snow` or `dust` and failed `finish.py`.
- `tint` darkens it for type.
- `x`/`y` place the words' center in px on the 1920x1080 frame (defaults 960 and 600; 0 counts as
  unset). Set them off center when a face is in the middle.
- Keep `x` more than 60 px inside either side: at 60 px the fit width below reaches 0 and the words
  vanish, and closer they render mirrored. Nothing checks it.
- Words are `size` px (default 260). They shrink to fit 1600 px, or with `x` set, twice the distance
  from `x` to the nearer side minus 120 px.
- The block's camera pushes in to 1.1x around the frame's center by its end, carrying off-center
  words outward. Leave about 10% more room than the fit width, and check a still at the last word.
- Use images at least 2048 px wide. Cut-ins above 1.7x look soft at 4K.

## Logo (N = 11)

`{ mark: ['id', ...], word: ['id', ...], tagline: 'Signed. Sealed. Stomped.', small: 'AVAILABLE NOW', wordmark: 'NAME', width: 840 }`.

- Beat 1 of the block: a line, a slash and a hit.
- The SVG's `mark` paths drop in one by one, then its `word` paths wipe on. Without ids the whole
  logo wipes on; without a logo file `wordmark` is typed.
- The tagline and small line follow, then a slow push, drifting particles and a light sweep until
  the end.
- The music should stop dead on beat 1 of this block: `music.stopBeat` is the block's start + 1.
- finish.py's motion gates stop at this block's start, or 4.5 s before the end when that is earlier.
- The logo file is inlined, so main.js rebuilds it from SVG drawing elements first. Scripts,
  embedded HTML, event handlers and references to other hosts are dropped; `#id` and same-folder
  references stay.

## Writing a custom block

- Write it in spec.js, or in a `custom.js` that spec.js imports, never in blocks.js:
  `new_film.sh --force` replaces the engine files. Any subclass of `Scene` passes the spec checks.
- Copy the smallest block that is close and keep its shape:
  - `build()` creates elements and registers effects and cues on the film: `f.burst`, `f.ray`,
    `f.ring`, `f.slash`, `f.comet`, `f.flash`, `f.shake`, `f.bump`, `f.ground`, `f.cut`, `f.fast`,
    `f.smear`, `f.cue`, and `f.paint` for custom canvas drawing.
  - `update(t)` sets styles from `t` only.
  - `cam(t)` returns `{ x, y, s, r }` for the camera.
- Use `set()` (it skips unchanged values), `tw()` and the eases in `E`, `meas()` once at build time,
  and `relPos()` instead of `offsetLeft`.
- Register a `fast` window on fast moves so the renderer takes more motion-blur samples there.
