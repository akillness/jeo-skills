# Motion-design library

This is a menu of looks, type treatments, moves and timing numbers that held up in production. Pick
from it to fit the song; don't run through it like a checklist. Frame counts are @60 fps. The
tempo-relative units (beat, 8th, bar) come from the song's own `audio.json`; never hard-code a BPM.
`E.spring(dt,k,z)` and `E.ease.*` are in `engine_api.md`.

## Contents

1. [Looks](#1-looks)
2. [Type system](#2-type-system)
3. [Motion-type vocabulary](#3-motion-type-vocabulary)
4. [Technique library (40 moves)](#4-technique-library-40-moves)
5. [Integrating graphics with footage](#5-integrating-graphics-with-footage)
6. [Transitions](#6-transitions)
7. [Timing, easing and springs](#7-timing-easing-and-springs)
8. [Sync and cut density](#8-sync-and-cut-density)
9. [Safety and default bans](#9-safety-and-default-bans)
10. [Portrait canvas](#10-portrait-canvas)

## 1. Looks

Most strong videos use **2-4 looks**, cut hard on downbeats, with each section owned by one look. A
look is a ground, an ink, an accent and a rendering rule, plus a matching footage style for any
generated shots. These archetypes have been tested; invent others.

| look                  | ground                | ink                                           | accent               | rendering rule                                                          | footage style that matches                                       |
| --------------------- | --------------------- | --------------------------------------------- | -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **NIGHT / neon**      | pure black            | glowing warm lines and type (HDR 2-4 → bloom) | warm-white cores     | glow allowed; ≥70% black                                                | rim-lit subject on a black void; light-line drawings             |
| **PAPER / editorial** | white or bone         | ink black                                     | ONE accent           | flat, crisp vector edges, Swiss grid, hairline rules                    | high-key white set; ink or brush drawings                        |
| **POP / color field** | flat saturated field  | black or white                                | a second field color | flat, no glow; hard 0-blur drop shadows OK                              | subject on a matching color cyc (backdrop replaceable via matte) |
| **FILM / mono**       | black-and-white grain | white type                                    | none                 | soft serif and subtitle type                                            | 35mm B&W lip-sync                                                |
| **RISO / print**      | paper                 | 2-3 spot inks with misregistration            | n/a                  | halftone and overprint on graphics only                                 | riso-style generated stills animated                             |
| **PIXEL / 8-bit**     | black or flat color   | pixel type (Doto)                             | 1-2                  | integer pixel grid, no AA, hard binary sprite mask + 1-cell ink outline | pixel-art character generated and animated                       |
| **WIRE / blueprint**  | dark blue or black    | 1 px lines                                    | callout color        | wireframe 3D, dimension callouts                                        | wireframe or point renders                                       |
| **CLAY / toy**        | soft color            | dark ink                                      | n/a                  | soft shadows, rounded 3D                                                | clay-toy subject                                                 |

- **High-contrast pop pairs:** tangerine+cobalt, lemon+black, pink+cobalt, mint+black, cobalt+lemon.
- **Glow belongs to dark looks only.** Flat looks stay flat.
- **Color comes from references.** A director who wants "lots of color" needs a palette reference
  (images or hex) up front. Without one the model drifts back to safe palettes, which happened once.
- **Spread the subject's looks too.** A subject can appear in several renderings over one video (3D
  cartoon mostly, a 2D flat section, a photoreal film section, a pixel ending), each generated as
  its own style frame. It reads as range, as long as identity holds.

## 2. Type system

One family in many widths beats many families. Defaults that worked:

| role        | font                                               | treatment                                                                                                                                          |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HERO**    | `Archivo` variable (wght 100-900, stretch 62-125%) | UPPERCASE, tracking −0.03em, ultra-wide 125% or ultra-condensed 62% (never "normal" for heroes), 25-90% of frame height, accent full stop ("RUN.") |
| **3D HERO** | `E.text3D` Archivo Black / Anton                   | extruded and beveled. Dark looks: front below bloom, glowing side. Flat looks: unlit color front + black side. The camera flies through or orbits. |
| **SYSTEM**  | `JetBrains Mono` 500-700                           | UPPERCASE, +0.06-0.12em, 14-28 px: terminals, logs, labels, callouts                                                                               |
| **LED**     | `Doto` 900                                         | numerals, counters, split-flap, scoreboards                                                                                                        |
| **SOFT**    | `Instrument Serif` italic                          | lowercase, big and soft, only for tender lines                                                                                                     |

- **Outline type uses static fonts only.** A stroked variable font shows its overlapping inner
  contours.
- **Hierarchy:** 1-3 hero words per line (nouns, verbs, numbers). Function words stay small.
- **Vary scale and density:** full-frame poster slams, mid-size kinetic phrases and quiet
  lower-third subtitles.

## 3. Motion-type vocabulary

Never use the same treatment on two consecutive lines.

- **width wave:** stretch animated per letter in a sine wave
- **weight ladder:** the same word stacked 100→900
- **smear slam:** a 2-3 frame horizontal stretch into place
- **outline echo wall:** repeated outline copies fill the frame, one solid
- **karaoke fill:** an accent fill sweeps through the letters in sync with the vocal
- **text on a path:** along a curve in the footage (hair, an arm, a road), an orbit or a ring
- **decode scramble:** mono glyphs resolve into the word
- **split-flap / odometer counters**
- **type as a window:** the plate seen through giant letters
- **3D extruded fly-through**
- **kinetic crop:** one giant letter fills the frame, then pull back to reveal the word
- **stagger cascade**
- **sticker pop:** white-bordered, rotated, bouncy
- **UI chat bubble / terminal typing** with a block cursor
- **word pile-up:** lines stack until the frame is full, then cut to black
- **vertical banner** on the empty third
- **neon ignition:** the outline stroke-draws with a flicker, then blooms
- **Swiss grid slam:** words snap into grid cells after the hairline rules draw

## 4. Technique library (40 moves)

"8th", "beat" and "bar" are the song's own grid. Every move lists its timing and a JS sketch.

**Type moves**

1. **Smear Slam.** A word hits center from scale 1.6 with 3 trailing ghosts (offset −6/−12/−18% W,
   alpha .35/.2/.1) that collapse into it. 8 fr outExpo, ghosts gone by fr 6, 1 fr flash
   `post.flash=0.08`. _Use:_ the first word of a hook line, or chant words. Under engine motion
   blur, draw the ghosts only while `E.blurring` is false.
2. **Directional Blur Slide.** Slides in from off-frame with motion blur made of 8 stacked draws at
   1/8 alpha, spaced by `v*dt`. 6 fr outQuart. _Use:_ call-and-response words. While `E.blurring`,
   draw it once: the engine blurs it.
3. **Letter Rise Stagger.** Letters rise from a baseline clip mask. 14 fr per letter outQuint,
   stagger 2 fr (1 fr for fast words). _JS:_
   `ctx.rect(0,base-cap*1.1,W,cap*1.1); ctx.clip(); y=base+cap*(1-e)`.
4. **Wave Drop.** Letters fall in with ±15° rotation and land on a spring k=600 z=0.35, stagger 1.5
   fr. _Use:_ "falling" or "dropping" lyrics.
5. **Variable-Width Wave.** A traveling wave through `wdth` 62→125, period 1 beat, phase 0.12 beat
   per letter. Pre-rasterize width steps in `load()`. _Use:_ "breathe", "stretch", held notes.
6. **Echo Wall.** The center row is solid and 4-6 outline rows scroll in alternating directions at
   ±0.35 W/s. Add a row every 8th in a chant.
7. **Punctuation Portal.** The final "." (or an i-dot or a cursor) scales to fill the screen and
   becomes the next background. 6 fr inExpo, while the word whips away 4 fr earlier.
8. **Color-Field Flip.** Swap background and foreground on each kick with a hard cut, plus a 2 fr
   scale punch 1.04→1. `bg = FIELDS[E.last('kicks',t).i % n]`.
9. **Swiss Grid Slam.** A 12-column grid: hairline rules draw first (10 fr linear), then words drop
   into cells (8 fr outExpo, from scale 0.94) at the onset minus 3 fr.
10. **Split-Flap Counter.** Digits flip every 2 fr through hashed randoms and settle right to left,
    4 fr apart, on outBack. _Use:_ times, years, counts, countdowns.
11. **Scramble Resolve.** Glyph noise resolves left to right over 20-30 fr, each char locking at
    `i*1.5 fr`, from a themed glyph pool ("01ACGT#%").
12. **Text Selection + Cursor.** A UI highlight box grows from the left (10 fr outQuart), its
    handles pop 3 fr later, and a block cursor blinks per beat.
13. **Type-on-Path Ring.** Mono caps orbit a circle at 0.1 turn per beat, snapping +0.05 turn on
    each kick.
14. **Letters Bigger Than Frame.** Single glyphs at 150% W, one per 8th, with a 12 fr linear push
    1.0→1.08. The counters become windows.
15. **Weight Ladder.** The same word in 8 rows from Thin to Black, one step per 8th, with an arrow
    stepping down.

**Shape and 2D moves**

16. **Dot-Collapse → Nested Iris.** Collapse to a dot (12 fr inQuart), hold 1 fr, then two discs
    burst out, the second lagging 3 fr. _Use:_ section changes.
17. **Spring Morph + Ghost Outlines.** A shape morphs polygon→polygon each beat (k=267 z=0.30), with
    4 lagging outline echoes and orbiting satellites. Resample to 128 pts and recompute the echoes
    from `t − k/60`.
18. **Truchet Wave Field.** A tile field of quarter-arcs that waves rotate 90°. 1 wave per bar,
    rising to 1 per beat in a build.
19. **Gooey Pills.** UI chips joined by metaball necks (SDF `smin`), with flicker and scramble,
    merging into one blob.
20. **Single-Line Draw.** One continuous pen line draws and morphs scribble → object → object at
    about 0.8 H/s, with a 24 fr inOutCubic morph and a leading pen dot. _Use:_ "sketch", "draw",
    "line".
21. **Line-Icon Draw-On.** 2 px SVG icons stroke on over footage (12 fr linear dash offset), then
    multiply 1→3→6.
22. **Tumbling Square → Object Pop.** A square rolls in with squash on landing, then pops into an
    object (k=400 z=0.5) with sub-parts lagging 3 fr.
23. **Liquid Splat Wipe.** A noise-perturbed SDF blob splats (12 fr outExpo), flings droplets and
    thins into a ring that reveals the next color.
24. **Falling Drop Beat-Marker.** A drop bounces three times, each on a beat. A calm breath moment.
25. **Confetti Burst.** 40-80 primitives with closed-form drag and gravity, spin ±360°/s, fading
    over 70 fr. _Use:_ celebrations and the final lock-up.
26. **Starburst + Orbit Text.** A 12-spoke rounded burst whose spokes grow staggered, with a ring
    and orbiting mono text, plus a kick pulse.
27. **Easing-Race Chart.** Balls race A→B with onion-skin ghosts over graph lines, lasting exactly 1
    bar. _Use:_ "rising", "falling", comparisons.
28. **Halftone Dissolve.** A dot grid whose radius is driven by wipe progress, used to transition
    from footage into graphics. 20 fr inOutQuart. It touches the transition, never the subject at
    rest.
29. **Kaleidoscope / Mirror Tile.** Fold UV into 4→6→8→12 wedges on downbeats. Graphics only.

**3D moves (three.js)**

30. **Cube-Grid Ripple.** An InstancedMesh cube field (about 576 instances). Each kick spawns a
    radial ring that pushes the cubes in Z.
31. **Point-Cloud Morph.** `THREE.Points` morph grid → torus → globe → text points, 1 beat each on
    inOutQuart.
32. **Extruded Type Flythrough.** `E.text3D` words in a Z corridor. The camera travels one word per
    beat, linear, with a 6 fr outExpo surge on downbeats.
33. **Orbit Data Rings.** 3-5 tilted rings of ticks and mono text at different speeds. One ring
    snaps +30° on each onset.
34. **Isometric Block City.** Iso boxes rise in a diagonal stagger (outBack s=2.6). _Use:_ "build",
    "world", "city".
35. **Vortex Zoom-Through.** Nested rotating squares; zoom through on inOutExpo, landing on the
    downbeat. Loops seamlessly.
36. **Infinite Zoom (Droste) through type.** Zoom into a letter's counter that contains the scene, 1
    bar per level, linear in log space.

**Camera and post moves**

37. **Kick Scale-Punch.** `E.post.punch = 0.035*E.pulse('kicks',t,0.09)`, plus small shake on
    snares.
38. **Whip Pan with Smear Frame.** Exit 5 fr inQuart, 1 smear frame (a stretched copy), then entry 6
    fr outQuart, centered on the kick. Under motion blur, register the whip in `load()` with
    `E.shutter(t0, t1, 2 to 3)`, and in `render()` skip the stretched copy while `E.blurring`.
39. **HUD Frame.** Corner brackets, title, section code, bar and beat squares, a spine counter and a
    progress line, for the whole video (`scenes/hud.js`).
40. **Chant Metronome Grid.** Each chant syllable fills the next cell of a 4×4 grid on its onset, a
    kick inverts a cell, and the last word wipes the grid with a progress bar.

## 5. Integrating graphics with footage

The rule that made footage sections land: **code goes on top of the video, deeply integrated, never
video pasted over graphics.** Every footage shot needs at least one graphic that reacts to it:

- **BACK** (under the plate): fields, grids and giant type. With a color-cyc plate, replace the
  backdrop around the subject.
- **MID** (plate → graphics → matte cut-out): type behind the subject but over the background. Keep
  enough of each hero word visible to read it; if the subject covers a key letter, move the word.
- **FRONT** (over everything, often tracked): a line leaves a fingertip, a label locks to the head,
  words land on a jump apex, a box tracks the face, type rides a curve in the plate.
- **Continue the plate:** a line or shape that exists in the footage (a horizon, a screen, a hand
  gesture) leaves it and becomes graphics.
- **Match cuts on shape:** cursor → sun, dot → planet, line → horizon, a logo glyph → an iris wipe.
- **Plates in windows:** footage inside type, split panels, a tile wall, or a 3D card. This is
  compositing, not an effect.
- Pure-graphics stretches (often 30-40% of the runtime) must be as strong as the footage moments,
  and the subject should return often.

## 6. Transitions

All on downbeats: color-field wipe, shape iris (circle, rhombus or the video's own glyph),
type-as-window zoom, grid tile flip, whip with shape smears, match cut on shape, split-screen
reveal, dot collapse and burst, punctuation portal, liquid splat.

## 7. Timing, easing and springs

**Durations by role (@60)**

| role                   | enter                              | hold (min) | exit                 | easing                   |
| ---------------------- | ---------------------------------- | ---------- | -------------------- | ------------------------ |
| hard-hitting word slam | 6-8 fr                             | 8 fr       | 4-5 fr               | outExpo in / inQuart out |
| normal word or line    | 12-16 fr                           | ≥ 20 fr    | 8-10 fr              | outQuart / inCubic       |
| letter stagger         | 12-14 fr per letter, offset 1-2 fr | -          | reverse, offset 1 fr | outQuint                 |
| UI card or chip        | 12 fr from scale 0.94              | -          | 8 fr to 0.96 + fade  | outQuart / inQuad        |
| morph in place         | 18-30 fr (≤ 1 beat)                | -          | -                    | inOutQuart / spring      |
| section transition     | 12-24 fr, landing ON the downbeat  | -          | -                    | inOutExpo                |
| counter or progress    | real duration                      | -          | -                    | linear                   |
| ambient drift          | loop ≥ 1 bar                       | -          | -                    | linear or sine           |

**Overshoot recipes**

| feel                    | recipe                   | overshoot | peak    |
| ----------------------- | ------------------------ | --------- | ------- |
| crisp UI pop            | outBack s=1.70158        | 10%       | -       |
| cartoon pop             | outBack s=2.6            | 20%       | -       |
| firm                    | `E.spring` k=1600 z=0.70 | 4.6%      | 6.6 fr  |
| snappy                  | k=900 z=0.60             | 9.5%      | 7.9 fr  |
| firm editorial          | k=300 z=0.45             | ≈20%      | ≈12 fr  |
| bouncy (engine default) | k=260 z=0.42             | 23%       | 12.9 fr |
| jelly morph             | k=267 z=0.30             | 37%       | 12.1 fr |
| quick jelly             | k=600 z=0.35             | 31%       | 8.2 fr  |
| wobbly                  | k=150 z=0.25             | 44%       | 15.9 fr |

Settle time is about 4/(z·√k) s.

**Rules**

- Arrivals use ease-out (expo or quart), morphs use in-out, counters and progress use linear, and
  exits and anticipation use ease-in.
- Never scale UI from 0: start at 0.94-0.98. Big type may come from ≥ 1.6× or from 0 with a smear.
- **Anticipation:** 3-4 fr of counter-motion at 8-12% of the move's distance.
- **Lead:** visual hits land 2-3 fr before the audio event (`E.LEAD = 0.05` s). The eye needs the
  frame before the ear.
- **Stagger:** fast words 1 fr per letter, normal 2 fr, UI lists 3-4 fr per item. A cascade finishes
  within 1 beat.
- **Exits** take 60-70% of the entry duration.
- **Holds:** a word needs ≥ 20 fr to be read (≥ 12 fr if it repeats), and a line needs ≥ 1 beat
  after its last word.
- **One hero per frame:** during a slam, secondary elements freeze or dim to 40%.
- **Camera (3D):** one dominant move per shot: dolly through type, orbit reveal or crash zoom. Use
  FOV 18-24° for poster compression and 70-95° for fly-throughs.

## 8. Sync and cut density

- **Pick 1-2 sync layers per moment.** Kick → scale punch or a shape hit. Snare → a shape or color
  event, or a 1-2 frame glitch. Vocal onset → type. Bass envelope → glow. Hats envelope → shimmer.
- **Cut discipline:** section changes on `downbeats`, word cuts on `vocal_onsets`, color flips and
  punches on `kicks`, shakes on `snares`.
- **Cut density should climb with energy.** A shape that worked: intro and verse a cut every 2 bars
  → pre-chorus 1 bar, then 1 beat in its last bar → drop 1 bar with beat events inside. Then build 1
  beat, then a half-beat → chant a half-beat with 16th flashes on shapes or bands. Let the bridge
  breathe with a long held shot. `dynamism_check.py gate` reports cuts per bar per section and warns
  when they fall as the energy rises.
- **Showcase moments need time.** A brand or logo reveal, a character turn or a sprite moment reads
  at 0.35-0.5× speed with few cuts. Directors rejected fast cut rates on these twice.
- **A spine:** let the edit carry the song's meaning, with a counter, clock or countdown that
  progresses through the video while the cut rate or the looks escalate with it.

## 9. Safety and default bans

- **Photosensitivity:** at most 3 full-frame flashes per second, end card included. A flash is a
  pair of opposing changes in relative luminance (WCAG 2.x general flash: 10% or more, the darker
  state under 0.80), so a flash in and out is one. `dynamism_check.py gate` counts them over the
  whole video. Full-frame 16ths or 8ths at 120 BPM are 8 or 4 flashes per second. Color-to-color
  swaps of similar luminance can run faster; keep white↔black to 1 flash per second.
- **Banned unless the director asks:** any filter, glow, grain, outline, halftone or color change on
  generated footage; lens flares; generic HUD clutter with no meaning; "AI slop" nebula or particle
  soup; glossy Pixar-style 3D graphics; cyberpunk cyan/magenta; real people's faces; logos other
  than the client's own (and those only where specified, in their official colors).

## 10. Portrait canvas

Layout rules for a 9:16 canvas (`CANVAS = 'portrait'`), written when the engine gained one. Unlike
the rest of this file, they have been through only one production so far.

- **The frame is narrow and tall.** A hero line breaks into stacks of one or two words, each sized
  with `E.fitSize` to `E.SAFE.w` divided by the largest scale its move reaches, or entering from
  below 1 so the overshoot stays inside the band. A wide poster slam becomes a word pile-up down the
  band.
- **Short sung lines.** The house subtitle shrinks a line to fit the band, so a line much over 45
  characters turns small: split it in `analysis/lyrics.txt`.
- **Type sits above the subject, not beside it.** The vertical banner on the empty third becomes a
  horizontal band above the head. Below the chest works only while it stays above the bottom 35%,
  where the platform caption sits.
- **Words, logos and faces stay inside `E.SAFE`.** Plates, color fields and full-bleed graphics fill
  the whole canvas behind them, so the platform UI covers background, never the read.
- **Moves run along the long axis:** slides, smear slams and wipes travel up and down.
- **3D heroes:** wrap the camera in `E.safeCamera(cam)` and fit the object to the band's width, as
  the scene template does.
- **Cinema moments:** `letterbox` is a thin strip on portrait. Use a boxed plate (`fit:'contain'`)
  with type above and below instead.
- **The first 3 seconds:** the hook lands big and centered in the band, and reads with the sound
  off, since many viewers scroll muted.
