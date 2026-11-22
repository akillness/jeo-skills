# Archetype: pin-pull

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "Not that pin! Save [hero]": pull the golden pins in the right order so the
gems reach the hero's minecart and the magma never does. Active run: end card at 36.0 s (win, all
three mines, 42/42 gems on mine 3). Idle: an untouched viewer reaches the end card at 10.0 s by the
idle timeout; touch once then idle, 12.2 s ("KEEP DIGGING!"). Meta 670 KB (Google ZIP 468 KB).

## Controls

- **Tap a golden pin** (or touch it and swipe; the press on the pin counts). It slides out toward
  its ring in 0.27 s and whatever it held falls. Hit area: the whole rod plus the ring, 60 px tall.
- Bottom buttons, cropped from the recording's HUD: hint (hand for 3 s), restart (rewinds the
  current mine), SKIP (calls the CTA).
- **Before the first touch:** the simulation does not step and the clock is held. The right pin
  breathes in a spotlight and the hand loops the pull on it (reach the ring, press, drag 46 px out,
  1.1 s loop). A blinking dashed danger arrow runs from the magma pin to the hero, who looks scared
  and calls "HELP!". Banner "SAVE [HERO]! / Pull the right pin". 30% of pixels change by 1.5 s.
- **Fail-bait is the player's choice, never a demo.** Pull the magma pin and the magma stops 2 cells
  short of the hero in slow motion: "NOT THAT PIN!", a rewind, then "TRY THIS ONE!" with the hand on
  the right pin.
- **Hint:** the hand returns after 2.5 s idle (once the grid has settled), right after a rewind, or
  for 3 s after the hint button. It only points.
- **Endings:** the mine-3 result (goal); 45 s of gameplay ("TIME'S UP! N mines to go!"); 10 s idle.
  Untouched goes straight to the end card ("SAVE [HERO]!"); after a start, "KEEP DIGGING! N mines to
  go!" shows for 1.3 s.

## Beat sheet (35–45 s)

Times after the first touch, from the active QA run.

| Time            | Beat                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0 s             | Mine 1 "SAVE [HERO]!" (A magma, B gems): the player pulls B, gems tumble into the cart                                         |
| ~1 s            | "GREAT! 48 gems saved": stars light one by one, the hero cheers, the win jingle ducks the music                                |
| ~4 s            | Title card, mine 2 "COOL IT FIRST!": the recording's own level                                                                 |
| ~5.5 s          | Water pin: steam, the magma pool turns to stone cell by cell                                                                   |
| ~11 s           | Gems pin: the gems land on the stone                                                                                           |
| ~13.5 s         | Gate pin: everything drops, the cart fills, "AWESOME!"                                                                         |
| ~17 s           | Mine 3 "WATCH OUT!": water, gems over a slope, a gate, and a **trap** pin above the hero                                       |
| 19–31 s         | Water, gems, gate: "MINE CLEARED!", confetti and the fanfare, end card 3.0 s later                                             |
| mine 3 mistakes | Gems first: 2 gems melt in 0.4× slow motion with "-1" pops, "SO CLOSE! 2 gems melted!" (40/42). Gate or trap first: "TOO HOT!" |

## Tuning that made win and near-fail reliable

- **Write the simulation as a plain module** (`src/sim.js`) that runs in the ad and in Node: a 30 ×
  47 grid of 18 px cells, grains of water, magma, stone and gem, fixed 1/60 s steps, no randomness.
  Keep your own step accumulator: the runtime can hand a fractional last step.
- **Enumerate every pin order offline.** `node analysis/check_levels.js` plays them all and prints
  each outcome; `--table` writes the hint table (designed order first, then the fastest win, never a
  trap pin). The hint, the outcomes and every result line come from the simulation. Nothing is
  hard-coded.
- **Make mistakes cost a few gems, not all.** A gem touching magma is lost and that one cell turns
  to stone. Water touching magma turns the whole connected pool to stone, one cell every 3 steps.
- **Rewind early, fail late.** On mines 1 and 2 magma freezes 2 cells short of the hero and rewinds
  (snapshots every 2 steps, about 30 s kept, played back in 0.45–1.0 s). On mine 3 it burns the
  hero.

| Mine | Pins                                    | Right order             | Wrong orders                                                      |
| ---- | --------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| 1    | A magma, B gems                         | B: 48/48                | A: near miss, rewind                                              |
| 2    | A water, B gems, C gate under the magma | A B C (or A C B): 36/36 | B first: 12 gems melt, rewind; C first: magma on the hero, rewind |
| 3    | A water, B gems, C gate, D trap         | A B C: 42/42            | B first: 40/42 "SO CLOSE!"; C or D first: "TOO HOT!"              |

- Physics: acceleration 0.022 cells/step² from 0.16, capped at 0.6; sideways every 3 steps (water),
  8 (magma), 4 (gems, stone); settled after 18 still steps. A pin opens its gap in the first 4 of
  its 16 slide steps, so a body falls as one piece.
- Slow motion: 0.35× once the bait magma is within 6 cells of the hero; 0.4× for 1.1 s on the mine-3
  melt.
- Hold the banners: clear 2.5 s, title card 0.5 s, result to end card 3.0 s (win) or 2.8 s.
- **Near-fail = the fail bot:** it falls for the bait on mine 1, plays mine 2 well, then pulls the
  trap first on mine 3: "TOO HOT!", end card 31.2 s.
- Sound: the win jingle, the freeze and the fail duck the music to 0.12. The pin slide rises 0.05 in
  pitch per pin.

## QA bot pattern

- `qa()` exposes `phase`, `level`, `canPull`, `settled`, `started`, `progress` (gameplay clock after
  the first touch plus pins pulled; 0 untouched), `pulled` (the sequence), `hint` (the next pin from
  the table) and `collected`. It also has `lost`, `total`, `heroDist`, `result`, `banner`, and
  `pins` (id, ring in client coordinates, pulled, trap).
- `active`: once the grid has been still for 0.6 s and 1.0 s has passed since the last pull, click
  the `hint` pin.
- `fail`: the same pace; pin A first on mine 1, the hint on mine 2, the trap pin first on mine 3.
- `STORYBOARD`: hook 0.5 s, the right pin (`pull` with `pin` and `level`), `cool`, gems on stone
  (`pull` with `seq: "AB"`), mine 3, result, end card. `STORYBOARD_IDLE`: 0.1 s, 1.5 s, 6.0 s, the
  idle end card.
- `COMPARE`: recording frames 0.1 s (setup), 1.5 s (steam), 3.5 s (gems on stone), 6.0 s (cheer).
- The bait frame happens only on the fail run, and `qa.py` has no fail storyboard. Capture it
  yourself.

## Asset map

Every asset comes from the gameplay recording. Make a 4 fps contact sheet, pull full-resolution
frames only at the chosen moments (`ffmpeg -ss t -frames:v 1`), upload 3–5 of them, and give each
Scenario job only the frames that show its elements as `referenceImages`. Add "rendered crisply at
full detail" so 720p frames come back sharp. Pick each model with `recommend`.

| Element                                                                                 | Source                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background plate                                                                        | image edit of frame 0.1 s, plus 5.0 s for the emptied tower: tower, pins, liquids, hero, cart and HUD removed, "fill the center with more of the same back wall" |
| Hero idle / scared / cheer                                                              | transparent sheet from an image model, frames 7.0 s (idle), 0.1 s (scared), 6.0 s (cheer)                                                                        |
| Minecart, golden pin                                                                    | same sheet, from frame 0.1 s (straight side views)                                                                                                               |
| Stone grain                                                                             | same sheet, from the cooled-magma blocks at 3.0 s                                                                                                                |
| 5 gems, rock wall block                                                                 | transparent sheet from an image model, frames 3.0 s and 0.1 s                                                                                                    |
| Level plank, gem pill, gear, hint / restart / SKIP                                      | PIL crops of frame 0.1 s; baked numbers painted out with row-profile fills and redrawn live                                                                      |
| Logo                                                                                    | none came with the recording: image model from the game name, frames 0.1 s and 6.0 s as style references, violet keyed out                                       |
| Water, magma, steam, stars, banners, danger arrow, HELP bubble, spotlight, rewind lines | code                                                                                                                                                             |
| Hand                                                                                    | shared `PA.draw.hand`                                                                                                                                            |
| SFX                                                                                     | sound-effect model, 2 takes each: pin slide, sizzle, gems into cart, splash, win jingle, fail, ouch, rewind; quiet takes lifted with a look-ahead limiter        |
| Music                                                                                   | music model, cut to 12 bars (25.71 s at 112 BPM): the take fades out from 26 s                                                                                   |

## Mistakes seen

- A first build auto-pulled the magma pin as a demo. That breaks the never-autoplay rule: show the
  bait with the danger arrow and the hand on the right pin, and let the player choose.
- Fluids fell as staggered diagonal bead ribbons. Open a pin's cells in 4 steps and let falling
  grains ride on the grain below.
- `PA.draw.rrect` calls `beginPath()`, so it reset the spotlight's cut-out path.
- The singed tint painted an orange box. Use a cached tint in the sprite's shape.
- The banner covered the PLAY FREE pill. It now sits over the tower's rock ceiling.
- The first gem-pill crop caught the gem's glow and left a magenta streak. Take fill columns right
  of the number.
- The gems-into-cart sound uses `minGap` 0.06 and can fire about 16 times a second as the cart
  fills. Raise it to about 0.33.
