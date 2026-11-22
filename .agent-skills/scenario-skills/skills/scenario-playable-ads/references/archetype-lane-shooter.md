# Archetype: lane shooter with gates

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). In it, a squad runs down a canyon road, shoots gates to raise their numbers,
grabs weapon crates, mows down a monster horde and fights a boss. Hook "Shoot the gates, grow your
squad". Active run: win (squad 46), end card at 35.2 s. Untouched viewer: nothing scrolls or fires,
the idle timeout shows the end card at 10.0 s (touch once, then idle: "TIME OUT!" at 10.9 s, end
card 12.4 s). Meta 692 KB.

It is a crowd runner where the squad also fires. Read `archetype-crowd-runner.md` for the projection
and the crowd slots; this file covers what shooting adds.

## Controls

- **Drag left or right anywhere.** It is a relative drag: the squad follows the finger's horizontal
  delta, about 1:1 on screen, smoothed and clamped to the road.
- After the first drag the road scrolls, monsters walk and the squad auto-fires. That is the genre's
  nature. Only the player steers: gates are chosen by the squad's position, crates are taken by
  steering into them.
- Bolts fly up the lane the squad is in: a gate's number goes up, a monster pops, the boss's HP bar
  drops.
- **Before the first drag the game waits, alive.** The gameplay clock is held. Units breathe-bob and
  glint; the 10-monster pack fidgets at the top of the road; the +5 panel pulses under a bouncing
  arrow, with lane dots flowing from the squad to it; "DRAG TO THE BLUE GATE!" glows on a 3 s cycle.
  The shared hand (`PA.draw.hand`, scale 1.4) loops a real drag toward the +5 lane on the DRAG TO
  MOVE bar, fingertip below the bar's text.
- The first drag starts the run. The prompt becomes "SHOOT THE GATES!" and fades after 1.8 s.
- **Hints:** after 2.5 s with the finger up, the hand returns and swipes toward the better lane. It
  only points.
- **Never autoplay.** Nothing steers for the player, before or after a touch. Holding the finger
  down is playing, so the 10 s idle timeout counts only with the finger up
  (`!inp.down && inp.idle >= 10`).

## Beat sheet (35–45 s)

| Time after first drag | Beat                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| before                | Waiting screen (above). 10 s untouched: end card titled "BLAST THE BOSS!" with no stats                           |
| 2.0 s                 | Gate 1 (+5 / -2): the squad grows from 3 to about 10                                                              |
| 1.5–3.3 s             | Pack 1 (10 monsters, HP 2): any that reach the line take a unit                                                   |
| 6.9 s                 | SPREAD crate: a 3-way fan of bolts                                                                                |
| 8 / 9.6 / 10–11.7 s   | Brute (HP 28) and a side pack, gate 2 (x2 / +4), pack 2 (16, HP 6)                                                |
| 15.1 s                | Gate 3 (-5 / +8): the trap a careless player takes                                                                |
| 17.6 s                | Crate pair: RAPID or ROCKETS (the build choice)                                                                   |
| 20.1 s                | Gate 4 (+10 / -6): the squad peaks at about 45                                                                    |
| 20.9–24.6 s           | **Signature: the huge wave**, 91 monsters in 13 rows plus 2 brutes, music ducked for the whole wave               |
| 26.5 s                | **Boss:** a stomp and a shake, "BOSS INCOMING!", the HUD progress bar becomes its HP bar                          |
| ~31 s                 | Result: "BOSS DOWN!" (slow-mo) or "SO CLOSE! BOSS HAD n% HP LEFT"; above 35% left, "THE BOSS WON!"                |
| 42 s                  | Time cap, a safety net: "TIME'S UP!" with the real HP or unit count. In this build the boss always resolves first |
| +4.2 s                | End card: BIGGEST SQUAD, MONSTERS BLASTED, BOSS, PLAY FREE, Replay                                                |

## Tuning that made win and near-fail reliable

- **Projection:** `y = 125 + 805 / z`, road half-width `416 / z` (logical px), fitted to the plate's
  edge dashes. Gates, crates and dashes approach at 1.25 z/s, monsters at 1.7, the boss at 0.8.
- **Perspective cheat:** `boost(z) = min(2.6, 1 + 0.38·(z - 1))` scales far objects' draw size and
  hit radius. The screenshot's art draws far things about 2.5× bigger than a lens would; without it
  everything up the road is a dot.
- **Gates you can shoot:** `+n` and `-n` panels gain +1 per (3 + 3k) hits, at most 4 steps (a red -5
  can climb only to -1); `x` panels need about 220 hits per step. Each step pulses the panel with a
  spark and a chime.
- **Threats:** a monster that reaches the line inside the squad's width removes 1 unit, a brute 3.
  The count never drops below 1 before the boss.
- **Bolts:** every unit fires every 0.5 s (0.33 with RAPID); SPREAD adds two side bolts; ROCKETS
  fire every 0.9 s for 10 splash damage. Bolts fly at 9 z/s up to z = 3.7, are swept-tested, and the
  first hit consumes them.
- **Boss HP is set when it spawns**, from the player's own fire power:
  ```
  hp = firepower × (3.7 - 1.12) / 0.8 × f
  firepower = units / fire interval × (3 with SPREAD) + rockets
  f = 0.72 when the player made at least 2 good choices by hand, else 1.24
  ```
  A good player kills it with time to spare; a player who steers badly reaches it weak and loses.
  The result text reads the real HP. Measured: active 644–672 HP, killed at about 31 s; fail bot
  down to 1 unit, boss 75% left, "THE BOSS WON!".
- **Place items by arrival time**, then check every one is reachable by a player who starts late.
- **Sound:** the music ducks to 0.12 on each good gate (0.8 s), each pickup (0.9 s), the boss's
  entrance (1.4 s) and the whole huge wave; each new duck replaces the last (`duckId`). Shots play
  at volume 0.16.

## QA bot pattern

- `qa()` exposes:
  - `goodX` and `badX`: the lanes of the better and the worse choice for the next item (`next`,
    `nextZ`);
  - `X`, `X0` (lane at touch-down), `pxPerX` (drag gain), `maxX`;
  - `count`, `peak`, `kills`, `weapons`, `boss` (hp, max, z), `result`, `cta`, `pill`;
  - `progress`: road distance since the first drag, 0 until the run starts.
- `active`: steer to `goodX`. `fail`: steer to `badX` (worse gates, away from packs and crates,
  beside the boss).
- Steering uses `{"move": ((target - X0) * pxPerX / 70, 0)}`; 70 is `qa.py`'s joystick radius in
  logical px. The bot holds the finger down, so it never trips the idle timeout.
- `STORYBOARD`: hook, a gate shot up, the spread fan, gate 4, the huge wave, the boss, the result,
  the end card. `STORYBOARD_IDLE`: hook at 0.1 s, still waiting at 6 s (nothing has moved), the end
  card.
- Rule checks: `hook_moves_without_input` 6.6%, `idle_never_autoplays` (max progress 0),
  `idle_timeout_endcard_by_15s` (10.0 s), `replay_restarts_game` (0.90 of pixels change).

## Asset map

Image edits use an instruction-editing image model; sounds come from a sound-effect model and a
music model. Pick each with `recommend`.

| Element                                                                                        | Source                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Road, canyon, sky                                                                              | Image edit of the screenshot: units, bolts, bubbles, gates, monsters, crates and HUD removed. The static edge dashes removed with OpenCV inpainting and redrawn scrolling in code |
| Unit run (2 frames), unit cheer, 2 monster types, boss                                         | Image edit of the screenshot as a transparent character sheet, sliced by alpha regions                                                                                            |
| Blue and red gates (blank glass, "NO text and NO numbers"), rocket, 3 crates                   | Image edit of the screenshot as a transparent prop sheet. 12 pieces need two sheets                                                                                               |
| HUD icons (unit head, skull, coin), DRAG TO MOVE bar                                           | screenshot crops with shape masks. Every number redrawn                                                                                                                           |
| Logo                                                                                           | intake logo, flood-fill keyed off its navy background, padded before trimming                                                                                                     |
| Gate tick-up, crate burst into a bolt fan, mow-down, the boss                                  | look and timing from the recording (1.5, 4.5, 6 and 7.8 s frames), without its glitches (a drifting count bubble, a squad that never grows after x3)                              |
| Hand                                                                                           | shared image hand, `PA.draw.hand`                                                                                                                                                 |
| Bolts, puffs, chunks, petals, bubbles, HP bar, gate numbers, dashes, arrow, lane dots, banners | code                                                                                                                                                                              |
| Font                                                                                           | Fredoka Bold (OFL), subset to 8 KB                                                                                                                                                |
| SFX and music                                                                                  | sound-effect model and music model: shot, pop, gate good, gate bad, pickup, rocket boom, boss stomp and roar, win, fail; three limiter-boosted                                    |

## Mistakes seen

- **A waiting screen with too little motion:** 1.9% of pixels changed. The glowing prompt, a bigger
  hand, lane dots and the idle bob brought it to 6.3–6.6% without a single move made for the viewer.
- **Sounds that machine-gun.** Shot min gap 0.06–0.09 s, pop 0.035 s, gate chime 0.08 s: all far
  faster than 3 a second, and still in the build. Raise each gap to about 0.33 s, or play one volley
  sound per burst.
- **The payoff at the horizon.** The huge wave dies as a strip at the top of the screen, while the
  gameplay recording has big monsters meeting the squad mid-screen. Let the wave reach z ≈ 1.6–2.5
  first (a shorter bolt range for the wave, or a slower approach), so monsters are ≥ 90 logical px
  when they pop.
- **A carpet of tiny units.** The build draws up to 60 units; at 46 the squad no longer looks like
  the screenshot's 8 big ones. Draw about 30 at most and let the bubble carry the count.
- **Crate labels** about 10 css px while they approach. Make them ≥ 28 logical px on a plate, shown
  from z < 3.
- The boss under an additive hit flash read as a white blob. Cap the flash at about 0.45.
- Confetti over the result banner. Draw it under the banners.
- A sprite-name typo (`crate_rockets`) caused console errors; `no_console_errors` catches it.
- Frames from earlier builds stay in `qa/`. Clear the folder before a re-run.
