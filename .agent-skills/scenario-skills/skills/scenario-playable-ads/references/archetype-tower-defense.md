# Archetype: tower-defense

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "Hold the objective: build, upgrade, stop the boss at the gate" (banner
"HOLD THE BASE!"). Active run: end card at 40.5 s (win, boss down at 38.2 s, 230 px from the
objective, 16 hearts left). Idle: an untouched viewer reaches the end card at 10.0 s by the idle
timeout; touch once then idle, 12.4 s ("TIME OUT!"). Meta 996 KB (Google ZIP 722 KB).

## Controls

- **Tap.** A pad builds the tower drawn as a ghost on it (one fixed type per pad, price tag
  underneath). A tower with a green up arrow upgrades to level 2. An unaffordable tap shows "NEED
  n". Skip the tray drag in the ad.
- Hit area: 78 px around the pad disc and its tower. Only the next good pad glows and shows the
  plus; up arrows show only when affordable.
- Towers fire on their own, and the helper character at the objective hits anything within 250 px:
  the genre's nature. Nothing builds or upgrades for the player.
- **Before the first touch:** the clock is held. Wave 1 (6 critters) is already on the path,
  marching in place. The logo and "HOLD THE BASE!" pulse, a "TAP TO BUILD" plate pulses, the hook
  pad glows and the hand glides in and taps it (1.4 s loop). 4.3% of pixels change by 1.5 s (QA
  needs 3%).
- Any first tap starts the run; a tap on the glowing pad also builds. **Hint:** after 2.5 s idle the
  hand points at the next good build or upgrade. It only points.
- **Endings:** the boss settles it (goal); the 46 s cap ("TIME'S UP!" + the boss's real HP); 10 s
  idle. Untouched goes straight to the end card ("HOLD THE BASE!", no stats); after a start, "TIME
  OUT!" + "WAVE n/3, n CRITTERS POPPED" shows for 1.5 s.

## Beat sheet (35–45 s)

Times after the first touch, from the active QA run.

| Time                  | Beat                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 0 s                   | First tap builds a cannon on the hook pad; wave 1 starts walking (8 more critters, HP 3)                           |
| ~2.7 s                | Slow tower on the middle bend: its shots trap and slow critters                                                    |
| ~9.3 s                | First upgrade: golden flash, "LEVEL 2!"                                                                            |
| ~11 s                 | "WAVE 2/3": 14 critters, HP 6                                                                                      |
| ~18 s                 | A cannon at the gate bends                                                                                         |
| ~19 s                 | "FINAL WAVE!": 16 critters, HP 8                                                                                   |
| ~21 s                 | **Boss entrance**: a banner with its name, red pulse, shake, stomp, HP set at spawn, boss HP bar under the HUD     |
| 25–35 s               | Spike tower at the gate, upgrades as coins allow; 0.6× slow motion once the boss is within 170 px of the objective |
| ~38 s                 | Boss down: white flash, sparkle burst, every critter pops, "BASE HELD!" + "16 HEARTS LEFT", 0.35× for 0.9 s        |
| +2.3 s                | End card: logo, the helper, CRITTERS / HEARTS / TOWERS                                                             |
| boss at the objective | "SO CLOSE!" + "BOSS HAD n% HP LEFT", or a loss banner when the hearts run out                                      |

## Tuning that made win and near-fail reliable

- Start: 100 coins, the top-left cannon built, 20 hearts, 8 coins per kill. Cannon 50, slow tower
  70, spike tower 90, upgrade 60. Waves (start, critters, gap, HP): 0.4 s / 8 / 0.9 s / 3 (plus the
  6 on the path), 11 s / 14 / 0.55 s / 6, 19 s / 16 / 0.5 s / 8. Critters 80 px/s; the boss at 21 s,
  70 px/s, slowed by the slow tower too.
- Towers (level 1 / 2):
  - cannon: range 205 / 235, 1.0 / 1.55 shots/s, damage 2 / 4 with a half-damage splash;
  - slow tower: range 195 / 225, slows to 0.5 / 0.4 for 1.6 / 2.2 s;
  - spike tower: range 190 / 220, spikes at 3 / 4 critters.
  - Ranges are ellipses (0.8) to match the camera.
- **All towers target the boss first**, then the critter furthest along. That keeps the boss
  simulation true.
- **Set the boss HP at spawn, honestly:** walk the boss down the path past the towers that exist
  then (ranges, rates, the slow tower's slow, the helper) and sum the damage D. HP = max(30, D × f),
  f = 1.0 after 2 or more builds or upgrades, else 1.4. Sweep f with the active bot: 0.85 dies 488
  px out, 0.95 at 282 px, **1.0 at 85–230 px**, 1.15 at 4 px, 1.3 reaches the objective. About 15%
  margin.
- **Cover the whole path.** No pad covers the last 150 px, so the helper guards the gate with its
  own short-range attack. Without it "held at the gate" could not be tuned.
- **Near-fail = the fail bot:** it builds only the top-right spike tower (early on the path, far
  from the gate) and then taps empty ground. Boss HP 30 (9 × 1.4, floor 30). The hearts run out
  first: "SO CLOSE!" with the boss at 73%, end card 44.3 s.
- **Cannon up-angle.** A second view, `cannonUp1` / `cannonUp2` (three-quarter back, muzzle
  up-right), shows when the target is more than 30 px above the cannon; the front view comes back
  under 10 px (hysteresis, no flicker). Both views face right and flip to the target's side.
  `muzzle()` fires from the barrel mouth of the view on screen, as fractions of the sprite: front
  (0.82, 0.46) / (0.73, 0.49), up (0.84, 0.11) / (0.72, 0.10).
- Sound: builds, upgrades, the boss entrance and the result duck the music to 0.12 (`duck()` keeps
  only the newest restore). Shots are pitched per tower.

## QA bot pattern

- `qa()` exposes `phase`, `progress` (gameplay time after the first tap; 0 untouched), `wave`,
  `coins`, `hearts`, `kills`, `manual` (taps that built or upgraded), `pads` (type, level, next
  cost, `afford`, client x/y). It also has `boss` (distance, path length, hp, dead), `ground` (a
  neutral tap point), `cannons` (`up` per cannon) and `shots`.
- `active`: follows the best order (P2 cannon, P3 slow tower, upgrade P2, P4 cannon, P5 spike tower,
  then upgrades). It taps an affordable pad after 0.4 s, and taps the pad it is saving for every 1.6
  s (shows NEED n), like a keen player.
- `fail`: one spike tower on pad 1, then a tap on `ground` every 2 s. `COMPARE`: frames 0.5, 4.5,
  5.5 and 7.5 s.
- `STORYBOARD`: hook 0.6 s, first build, first upgrade, wave 2 (+3 s), `4b-cannon-angles` (a `snap`
  that fires when one cannon is up and another is in the front view), boss (+1 s and +9 s), result,
  end card. `STORYBOARD_IDLE`: 0.1 s, 6.0 s (still waiting), the idle end card.

## Asset map

Every asset comes from the recording. Score frame sharpness every 0.25 s (edge variance) and skip
motion-blurred moments (5.5–6.5 s here). Export full-resolution key frames and pass them to an
instruction-editing image model (pick it with `recommend`) as reference images. Add "the frames are
small and a little soft: redraw at full detail, same design".

| Element                                                                                               | Source                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map, path, 6 empty pads                                                                               | image edit of frame 0.5 s at 1152 × 2048: REMOVE critters, towers, objective, helper, effects, HUD; KEEP "all six build pads in place, every one empty"; re-measure pads and path |
| Critter (2 poses), boss, objective, helper happy / worried                                            | transparent sheet from the image model, frames 7.5 s and 4.5 s; the worried helper is a variant of the happy one                                                                  |
| Cannon, slow tower, spike tower, levels 1 and 2                                                       | transparent sheet from the image model, frames 4.5 s and 7.5 s, "WITHOUT the round stone build pad"; level 2 designed as "its upgrade" (the recording never shows it)             |
| Cannon up views, levels 1 and 2                                                                       | 2 × 1 transparent sheet from the image model; references: the `cannon1` + `cannon2` sprites side by side, and frame 4.5 s                                                         |
| HUD coin and heart                                                                                    | crops of frame 1.5 s (circle mask, color mask), about 45 px                                                                                                                       |
| HUD panels, numbers, HP bars, price tags, up arrows, projectiles, slow effects, helper shots, banners | code, matched to the frame's navy HUD                                                                                                                                             |
| Logo                                                                                                  | image model from the game name, frames 4.5 s and 7.5 s as style references, navy keyed out                                                                                        |
| Font                                                                                                  | Fredoka Bold subset (8 KB)                                                                                                                                                        |
| SFX                                                                                                   | sound-effect model, 2 takes each: shot, critter pop, build, upgrade, boss stomp, objective hit, win, so-close; quiet takes +2 to +5 dB with a limiter                             |
| Music                                                                                                 | music model, 30 s loop                                                                                                                                                            |

## Mistakes seen

- The first build's demo tap at 0.8 s and weak-spot autopilot broke the never-autoplay rule. Both
  were removed.
- Shot, pop and leak sounds use `minGap` 0.06, 0.04 and 0.08, so they can fire 12–25 times a second
  in a busy wave. Raise them to about 0.33, or one shared limit per sound.
- A hit flash with `source-atop` + `fillRect` painted white boxes around sprites. Redraw the sprite
  with `lighter`.
- The tower sheet came back with grid lines between cells. Remove them with a morphological opening,
  or ask for "no lines or borders between cells".
- A plate edited from a frame drifts (pads within 5 px, a bend 20 px), and the path mask's row
  median is biased at the bends. Trace the path by hand over a plate overlay and smooth it
  (Catmull-Rom).
- The recording's currency counter glitches (`-50`) and the upgrade keeps the level-1 look. Never
  trust HUD numbers or missing views from a recording; redraw numbers and design the missing views.
