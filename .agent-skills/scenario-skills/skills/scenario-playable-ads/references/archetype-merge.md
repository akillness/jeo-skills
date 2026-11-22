# Archetype: merge-2

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "Merge up to the legendary one". Active run: end card at 35.3 s (win, "NEST
SAVED!"). Untouched: the board waits, and the idle timeout shows the end card at 10.0 s with
`progress` 0. Meta 764 KB. Rendering in plate coordinates makes the playable look like the game in
the screenshot.

## Controls

- **Drag an item onto an identical item** to merge it into the next tier. The dragged item lifts
  (scale 1.15, shadow) and every identical item gets a lime outline.
- Drop on an empty tile: the item moves there. Drop anywhere else: it springs back with a wobble.
- Once the game has started, the nest pops eggs by itself. That is the generator's nature in the
  genre, not a move made for the player. Only the player merges.
- **Before the first touch the game waits, alive.** The gameplay clock is held: no spawns, no
  merges. The hook pair (two eggs on row 1) glows lime and wiggles, items breathe, hatchlings hop,
  "DRAG TO MERGE!" shows above the board, and the title pops in at 0.3 s. The hand loops the drag of
  one egg onto its twin from frame 0. The first touch starts the game, and the first merge is the
  player's own.
- After the first touch, the hand returns after 2.5 s idle and the same glow marks the hinted pair:
  the highest tier pair in phase 1 (it leads to the legendary), the lowest in phase 2. It only
  points.

## Beat sheet (35–45 s)

| Time   | Beat                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| wait   | Hook: a busy board (14 of 36 tiles, like the screenshot), "MERGE UP TO THE LEGENDARY ONE!", the chain banner with the "?" slot pulsing, the hand dragging egg onto egg                           |
| 0–8 s  | Tier-ups; each lights its slot in the chain banner (a ready-made tier legend)                                                                                                                    |
| ~8.5 s | **Signature:** two young dragons make the legendary. Board dims, gold rays, confetti, +500 coins count up, the dragon grows over 2×2 tiles, slot 5 flips gold, then it flies into the cliff nest |
| +4.6 s | Phase 2, "KEEP ROOM!": an 18 s timer while the nest dumps 8 eggs and then floods the board                                                                                                       |
| ~31 s  | Result: "NEST SAVED!" or "OUT OF SPACE! So close: Ns left!" (seconds read from the timer)                                                                                                        |

Endings: goal by play (the KEEP ROOM timer runs out, or the board fills), a 40 s phase-1 time cap
("TIME'S UP! Best: [HIGHEST TIER ON THE BOARD]"; phase 2 is capped by its own timer), or 10 s with
no input. The idle count runs only during play, not during the 4.6 s legendary celebration.
Untouched, that goes straight to the end card titled "RAISE A LEGEND!" with no stats. Started, one
line shows for 1.4 s first ("SO CLOSE! Best: [TIER NAME]", or "Nest at Ns left" in phase 2).

## Tuning that made win and near-fail reliable

- **Board on the plate:** measure the painted grid. `cx = 576 + (c - 2.5) · (165 + 2.3·r)`, rows at
  y 698…1533 (gap detection on the luminance profile). Draw the whole scene in plate coordinates
  (1152×2048), contain-fitted. Fill any bars with a blurred copy of the plate. Draw `PA.hit` buttons
  in logical space after popping the plate transform.
- **Busy seed:** 7 speckled eggs, 1 glowing egg, 1 young dragon and 4 vine locks. The legendary
  takes 7 merges.
- **Pace phase 1 by the generator:** the golden path needs eggs that only the nest supplies (one
  every 2.0 s from 1.5 s, while ≥ 12 tiles are free). A quick player reaches the legendary at about
  8.5 s of play.
- **Phase 2 is timed, not a goal count.** A goal ("hatch 3") let fast players finish early, so the
  run length had no lower bound.
  - The nest dumps 8 eggs, then spawns every `max(0.42, 0.85 - 0.03·t)` s.
  - Protect rule: if ≤ 2 tiles are free and the player merged in the last 2.5 s, skip the spawn. A
    player who is merging never gets the last tiles filled.
  - A player who stops merging, or drops pieces in the wrong place, fills up by play. That is the
    near-fail; nothing floods the board for an idle viewer.
- Sounds: no sound repeats faster than about 3 times a second. Payoffs duck the music to 0.12 for
  1.0 s (hatch), 1.2 s (young dragon), 1.4 s (a bonus legendary) and 1.6 s (NEST SAVED coins), then
  restore `cfg.musicVolume`. Overlapping ducks extend each other. The legendary has its own longer
  duck (0.18). Merge chime pitched 1.0 / 1.12 / 1.25 per tier.

## QA bot pattern

- `qa()` exposes:
  - `progress` = gameplay clock + merges (0 until the first touch), `started`, `phase` (`play1`,
    `play2`, ...);
  - `hint` = `{from, to, tier}` in client coordinates (the move the hand shows);
  - `bad` = a drag onto a non-matching item, or onto a vine lock when every item has the same tier;
  - `merges`, `free`, `legend`, `p2t`, `maxTier`, `n4`, `pill`, `cta`.
- `active`: `{"drag": (hint.from, hint.to)}` every 1.3 s, from 1.3 s on (a quick but human pace).
- `fail`: plays phase 1 well, then drags `bad` every 1.3 s. Each drag springs back, the protect rule
  does not cover it, and the board fills at about 27 s.
- Storyboard triggers use event data: `{"event": "merge", "data": {"tier": 3}}`. `COMPARE` pairs the
  frames with the screenshot and the gameplay recording's first merge, hatch, tier-4 merge,
  legendary and refill moments. `STORYBOARD_IDLE`: the waiting hook at 0.1 s, still waiting at 6 s,
  the idle end card.

## Asset map

Image edits use an instruction-editing image model; pick it with `recommend`.

| Element                                                                                          | Source                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Scenery, chain banner frame with empty slots, empty board                                        | Image edit of the screenshot: items, locks, nest and HUD removed; "the five round slots become empty plain wooden recesses"               |
| Tier 1–4 items, nest                                                                             | Image edit of the screenshot, one transparent 3×2 sheet, cut **by connected alpha regions**: the legendary's wings cross the 512 px cells |
| Legendary dragon                                                                                 | same sheet. The screenshot shows only its "?" silhouette; check it against the gameplay recording's legendary moment                      |
| Avatar, coin, gem, plus, gear, "?" slot, vine lock tile, menu strip                              | screenshot crops (`mask: "ellipse"` / `"rrect:<r>"`)                                                                                      |
| Info panel, level star, coin and gem numbers                                                     | code, item icon and name follow the last item picked or merged                                                                            |
| Logo                                                                                             | the intake logo, keyed off its plain teal background                                                                                      |
| Outlines, flash ring, sparkles, rays, coins, nest lightning badge, timer pill, banners on plates | code                                                                                                                                      |
| Hand                                                                                             | the shared hint hand, `PA.draw.hand`                                                                                                      |
| SFX                                                                                              | pickup, drop, merge, hatch, young dragon, legendary, spawn, coins, fail                                                                   |

## Mistakes seen

- A sparse phase-1 board (6–8 items) did not match the busy board in the screenshot.
- The bottom menu strip doubled as a CTA, which risks accidental installs. Keep the CTA on the pill
  and the end card.
- Hatch (-31 dB) and coin (-32 dB) takes were buried under the music. Boost with a limiter
  (`gain_db` alone clips peaky takes) and duck the music around each payoff sound.
- Ask for an N×M grid in a prompt and you may get a different grid (asked 6×7, got 6×6). Measure,
  don't assume.
- The 8-egg dump spawns every 0.1 s, and the spawn and flying-coin sounds use `minGap` 0.1 and 0.12.
  Raise both gaps to 0.33 so the dump does not machine-gun.
