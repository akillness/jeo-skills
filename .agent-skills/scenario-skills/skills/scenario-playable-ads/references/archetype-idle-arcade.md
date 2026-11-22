# Archetype: idle-arcade (carry-stack tycoon)

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "Brew it, carry it, sell it" (banner "RUN THE SHOP!"). Active run: end card
at 39.7 s (win, greenhouse unlocked at 34.5 s). Idle: an untouched viewer reaches the end card at
10.0 s by the idle timeout; touch once then idle, 12.3 s. Meta 1.13 MB (Google ZIP 823 KB).

## Controls

- **Point-and-go: tap the ground and the hero walks there.** Hold and slide to keep steering.
  - Set the goal in `onDown` / `onMove` (`setGoal`), not in `update`, so quick taps are never lost.
  - Push the goal out of the blockers (counter, kiosk back, cauldron). Enter the kiosk through its
    open side (`route()` walks to a doorway point first).
  - A pulsing yellow ring marks the destination.
- Everything else happens by standing in a zone, one item every 0.11 s: forest (pick ripe mushrooms
  within 72 px), cauldron ramp (drop), tray (pick potions), kiosk floor (serve the front customer),
  coin pads (pour coins in).
- The stack holds 8, wobbles and leans against the walk; "MAX" at the cap.
- **Before the first touch:** the day clock, patience, arrivals and brewing are held. The hero
  stands with a 7-mushroom stack, the logo pops in over "RUN THE SHOP!", the hand taps the cauldron
  with "TAP TO MOVE", a dashed trail runs from the hero to it and a guide arrow bounces over it.
  9.8% of pixels change by 1.5 s.
- **Hint:** after 2.5 s idle the hand taps the next useful spot (cauldron, mushrooms, tray, counter
  or an affordable pad). It only points.
- **Endings:** the greenhouse unlock (goal); the 42 s "DAY ENDS" timer, started by the first touch
  (time cap); 10 s idle. Untouched goes straight to the end card ("RUN YOUR SHOP!", no stats); after
  a touch a 1.4 s "SO CLOSE!" line from the real state shows first.

## Beat sheet (35–45 s)

Times after the first touch, from the active QA run.

| Time    | Beat                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0 s     | First tap: the hero walks the 7 mushrooms to the cauldron; a potion pops onto the tray every 0.3 s                                   |
| ~5 s    | First sale: potions to the kiosk, the front customer pays 6 per potion ("+12" for two), coins fly to the HUD                         |
| 5–14 s  | Loop: forest, cauldron, tray, kiosk. Patience bars drain green, yellow, red (+2 s per potion received)                               |
| ~15 s   | Conveyor (40): stand on the pad, coins pour in, the gold ring fills, the belt pops in, "CONVEYOR BUILT!"                             |
| ~22 s   | Helper (70, shown after the conveyor): a helper carries 4 potions at a time, "HELPER HIRED!"                                         |
| ~34.5 s | **Greenhouse (115):** flash, shake, unlock fanfare, the greenhouse pops in, crystals fly out, coin shower, "NEW AREA UNLOCKED!"      |
| +2.8 s  | "SHOP EXPANDED!", then the end card: logo, hero, COINS / SERVED / AREAS                                                              |
| 42 s    | Day ends first: "SO CLOSE!" + "N coins short of the Greenhouse" or "The Greenhouse was one step away", plus "N customers walked out" |

## Tuning that made win and near-fail reliable

- Prices: conveyor 40, helper 70, greenhouse 115. Start with 0 coins. Day 42 s.
- Hero 330 px/s, cap 8, step 0.11 s. Brew 0.3 s per mushroom, tray 16. Mushrooms regrow after 4 s.
  The conveyor pulls ripe mushrooms from the forest edge, one every 0.32 s.
- Customers: 3 waiting at the start, 4 slots, want 2 (30% want 3), patience 15 s. Arrivals speed up
  with each automation (2.0, 1.3, 0.8 s), so buying visibly brings more money.
- A pad takes its full price in 1 s of standing, capped by the coins in pocket.
- One function holds the good-player strategy: `brain('good')` drives the arrow, the hint hand and
  the active bot; `brain('nobuy')` is the same loop without pads, for the fail bot.
- **Near-fail = the fail bot:** it plays the loop all day but never steps on a pad. It ends with 166
  coins not yet poured: "The Greenhouse was one step away", end card 44.4 s. Every line reads cost −
  paid − coins.
- Seeded RNG (seed 7) and a fixed forest seed, so runs repeat within a frame or two.

**No chattering sounds.** A sound per item at the 0.11 s step chattered. Mark the event once
instead.

| Sound                                 | First build                            | Fix                                                                    |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `pick` while paying on a pad          | every 0.06 s (~14/s)                   | removed: paying is silent; the purchase plays `build` or `unlock` once |
| `pick` per potion served              | every 0.11 s (~9/s)                    | removed: the sale's `coin` marks it                                    |
| `pick` when collecting                | pitch rising with the stack, up to 9/s | normal pitch (0.97–1.03), `minGap` 0.1                                 |
| `coin` per sale                       | `minGap` 0.05                          | `minGap` 0.3                                                           |
| `cork` per brewed potion              | up to ~3/s                             | `minGap` 0.4, volume 0.35                                              |
| `plop` per mushroom into the cauldron | up to 9/s                              | `minGap` 0.3                                                           |

- `build` ducks the music to 0.12 for 1.2 s; `unlock` ducks it until the result.
- The collect `pick` still allows 10/s. Raise its `minGap` to about 0.33 before reuse (no sound
  faster than about 3 times a second).

## QA bot pattern

- `qa()` exposes `phase`, `progress` (the gameplay clock, 0 until the first touch), `coins`,
  `earned`, `served`, `walked`, `tray`, `hero` (world position, stack, `s` = feet in client
  coordinates) and `pads` (paid, cost, done, shown). It also has `advice` / `adviceNoBuy`: a target
  in world units plus `sx`/`sy` in client coordinates.
- `active`: `{"click": (advice.sx, advice.sy)}` until the hero is within 18 world px, then a click
  on its own feet to stay put.
- `fail`: the same on `adviceNoBuy`.
- Use `click`, not `move`: QA's `move` is joystick-relative and overshoots by about 25 px.
- `STORYBOARD`: hook 1.0 s, first sale (`sale`, nth 0), queue 11 s, conveyor and helper (`buy` with
  `id`), unlock, result, end card. `STORYBOARD_IDLE`: 0.1 s, 1.0 s, 6.0 s (still waiting), the idle
  end card.
- `COMPARE`: hook vs the screenshot, first sale vs the gameplay recording at 4.5 s, conveyor vs 6.5
  s.

## Asset map

Image edits and transparent sheets come from an instruction-editing image model, walk clips from an
image-to-video model, sounds from a sound-effect model and a music model. Pick each with
`recommend`.

| Element                                                                              | Source                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yard plate                                                                           | image edit of the screenshot with REMOVE and KEEP lists (characters, items, pads, HUD out); a second edit adds the clearing and the kiosk                                           |
| Hero, helper, 4 customer types                                                       | transparent 3×2 sheet from the image model, made from the screenshot, hero with an **empty** basket (the stack is code); sliced by connected alpha regions, `alpha_floor` 60        |
| Hero walk, 4 diagonals × 8 frames                                                    | `scenario-sprite-animation`: SE first frame reframed from the hero sprite, NE turnaround by image edit, one 3 s image-to-video clip per facing; frames advance one per 34 px walked |
| Mushroom, potion, coin, coin pile, sprout                                            | transparent sheet from the image model, in the soft 3D look of the carried items in the gameplay recording                                                                          |
| Greenhouse, crystals                                                                 | transparent item sheet from the image model, made from the screenshot                                                                                                               |
| Logo                                                                                 | the studio's logo, keyed off its violet background (color distance, border flood, edge un-mix)                                                                                      |
| Stack, zones, pads, belt, bubbles, patience bars, arrow, trail, goal ring, HUD pills | code, in the screenshot's palette                                                                                                                                                   |
| Font                                                                                 | Fredoka Bold subset (8 KB woff2)                                                                                                                                                    |
| SFX                                                                                  | sound-effect model, 2 takes each: pick, plop, cork, coin, build, unlock, sad; quiet takes +7 to +14 dB with a limiter at −1 dBFS                                                    |
| Music                                                                                | music model, 30 s loop, starts on the first touch                                                                                                                                   |

## Mistakes seen

- A sound on every item (paying, serving, collecting) chattered at 9–14 per second. Sound the event
  once.
- The floating joystick: QA's fixed joystick origin covered the kiosk and the queue in every active
  frame. Point-and-go fixed the storyboard and the bot's overshoot.
- A first build's demo walk and autopilot broke the never-autoplay rule. Both were removed.
- Glow halos came back on transparent sheets although the prompt asked for none (alpha 1–30). Use
  `alpha_floor`.
- The greenhouse appears partly under the "DAY ENDS" pill.
- Queue pressure is mild: no customer walked out in any QA run, so the patience bars only reach
  yellow.
