# Archetype: sort puzzle (ball / jelly / water sort)

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). Hook "Can you sort them all in one go?". Active run: win, end card at 35.8 s.
Untouched viewer: nothing pours, the idle timeout shows the end card at 10.0 s (touch once, then
idle: 10.9 s). Meta 699 KB.

## Controls

- **Tap a jar**, then **tap another jar**. The whole unbroken top run of one color pours, as many
  jellies as fit. One pour = one move. Tap the same jar again to put the run back.
- Legal target: an empty jar, or a jar with room whose top jelly is the same color. An illegal tap
  wiggles the jar and plays a soft bounce sound; it never costs a move.
- Tap targets are whole jar columns (rim to base, padded 12 px), never the small jelly.
- **Before the first touch the board waits, alive.** The gameplay clock is held (the 0:42 pill does
  not move). The shared hand (`PA.draw.hand`) loops tap-tap on the real first move (yellow-topped
  jar, then the empty jar). The two yellows hop and glow, the target jar pulses gold, every jelly
  breathes and blinks. No jelly moves.
- **Hints:** after 2.5 s without input the hand returns and points at the solver's next pour. It
  only points.
- **Never autoplay.** Every pour is the player's. The ad ends by goal, by the 42 s round timer, or
  by 10 s with no input at all (`IDLE_END`), which goes straight to the end card.
- Tray buttons must do something. UNDO undoes one pour (3 charges). RESTART resets the board. +JAR
  is the booster, so a tap on it is an install intent and calls the CTA. Players tap these at the
  near-fail moment.

## Beat sheet (35–45 s)

| Time after first touch      | Beat                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| before                      | Waiting screen: Board A, "CAN YOU SORT THEM ALL IN ONE GO?", hand loop, hop and pulse. 10 s untouched: end card titled "CAN YOU SORT THEM?" with no stats |
| 0–1 s                       | The first pour: a 2-jelly train with rising bloops                                                                                                        |
| 3.5–7.5 s                   | Board A "domino": 3 pops 2 s apart (gold lid, confetti, coins to the counter, progress icon, mascot cheer, callout)                                       |
| 8.5–10.7 s                  | "TOO EASY? TRY LEVEL 24": Board B drops in jar by jar, LEVEL 24 plank and a MOVES 13 pill                                                                 |
| 10.7–30 s                   | Board B: 7 jars in the game's 4 + 3 layout, 5 colors. Pops at about 22, 24, 26 and 30 s                                                                   |
| ~30 s                       | Last move: the board dims except the source and target jars, "ONE SLOT LEFT!", the music drops to 0.18                                                    |
| ~32 s                       | Result: "LEVEL CLEAR!" with gold rain; MOVES 0: "OUT OF MOVES!" then SO CLOSE or NICE TRY; 42 s: "TIME'S UP! N jars to go!"                               |
| +3.3 s (win), +2.6 s (loss) | End card: jars, coins, moves, PLAY FREE, Replay, the player's lidded jars as a shelf                                                                      |

## Tuning that made win and near-fail reliable

- **Every board is solver-checked.** `analysis/solve_boards.py` is a pour-rule BFS (state = tuple of
  stacks, capacity 4). The same BFS runs in JS with a cache. One shared rule (`runLen`, `pourCount`,
  `apply`) drives the game, the solver, the hint hand, the MOVES counter and UNDO (which pours the
  same N back).
- Board A (bottom to top): `R R Y Y | B B R R | Y Y B B | -`. 4 pours, all 2-jelly trains, 3 pops,
  no move limit.
- Board B: `G G Y Y | G P P Y | G P P R | R B B Y / B B R R | - | -`. Optimal 11 pours (8 move 2–3
  jellies), **MOVES 13**. Found by random search: 5 colors in 2-runs, optimal 10–11, at least 3
  multi-pours.
- **The near-fail is for a player who plays badly.** A ball-sort board keeps its free space
  constant, so the pressure comes from the MOVES limit and the round timer. The MOVES limit is not
  in the intake: confirm it with the user. Unattended, use the limit the recording shows; with none,
  only the round timer applies, and `notes.md` says so.
- **Last move:** `finalMove()` picks the winning pour with the fewest jellies into the fullest jar,
  so the highlight shows the lone red going into the three reds.
- **Honest result text**, always computed from the board:
  - one pour from solved: "SO CLOSE! N jelly / jellies left!" (N = jellies in that pour);
  - further: "NICE TRY! N jars to go!";
  - timer out: "TIME'S UP! N jars to go!";
  - idle timeout after some pours: an honest line for 1.4 s, then the end card.
- A slow player who keeps tapping reaches TIME'S UP at 42.3 s, end card 44.9 s.
- Feel: each jelly of a train rises, arcs 0.3 s, drops 0.13 s, 0.09 s behind the one in front, and
  squashes. Lift 0.12 s, lid 0.2 s.
- **Sound:** every pop ducks the music to 0.12 for about 0.9 s; a pour of 3+ ducks it to 0.26; the
  win to 0.15. The pop and win takes were limiter-boosted (`complete` −30.3 → −23.4 dB RMS). No
  sound may repeat faster than about 3 times a second (see Mistakes seen).

## QA bot pattern

- `qa()` exposes:
  - `jars` (client centers), `tap` (the jar the hint points at, -1 when not playing) and `hint`;
  - `balls` (state), `sel` (lifted jar), `busy` (an animation or transition is running), `board`;
  - `movesLeft`, `pops`, `result`, `lastMove`, `banner`, `cta`;
  - `progress` (pours made; stays 0 for an untouched viewer) and `clock` (the round timer).
- `active`: click `jars[tap]` every 0.9 s. Wins at 35.8 s.
- `fail`: plays Board A like `active`; on Board B it pours a one-color stack back and forth between
  the two empty jars until MOVES runs out. Ends "NICE TRY!", end card at 39.7 s.
- `STORYBOARD`: hook (1.2 s), first pop, LEVEL 24, fourth pop, last move, result, end card.
  `STORYBOARD_IDLE`: hook at 0.1 s and 1.5 s, still waiting at 6 s, end card.
- Rule checks: `hook_moves_without_input` 4.1%, `idle_never_autoplays` (max progress 0),
  `idle_timeout_endcard_by_15s` (10.0 s), `touch_once_then_idle_reaches_endcard` (10.9 s).

## Asset map

Image rows use an instruction-editing image model; pick it with `recommend`.

| Element                                                                                               | Source                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Backdrop                                                                                              | image edit of the screenshot: jars, jellies, mascot and HUD removed; "the center of the scene must be empty"                            |
| 5 jellies + mascot                                                                                    | image edit of the screenshot as a transparent sheet: "exactly the jelly balls from image 1, only the color changes"                     |
| Glass jars                                                                                            | code: back and front glass layers, rim ellipse, two highlight strips. A jar sprite never matched the screenshot's glass                 |
| Gold lid, LEVEL plank, progress panel and jar icons, coin pill, gear, tray with UNDO / +JAR / RESTART | screenshot crops. Baked numbers painted out (row-profile fill) and redrawn                                                              |
| Logo                                                                                                  | intake logo, keyed off its teal background                                                                                              |
| Pop payoff (lid, confetti, coins rolling, icon filling, mascot cheer)                                 | the recording's pop moment (about 5.3–6.5 s); the lid drops from just above the jar, not from the top of the screen as in the recording |
| Hand                                                                                                  | shared image hand, `PA.draw.hand`                                                                                                       |
| Callouts, banners on plates, confetti, MOVES and timer pills, end-card shelf                          | code                                                                                                                                    |
| Font                                                                                                  | Lilita One (OFL), subset to 5 KB                                                                                                        |
| SFX and music                                                                                         | sound-effect model: pick, drop, complete, illegal, win, fail; music model: a 30 s loop cut to 29.4 s                                    |

## Mistakes seen

- **A frozen hook.** The fix is a live waiting screen (hand loop, hop, pulse, breathing jellies:
  3.9–4.1% of pixels change), never a move made for the viewer.
- **An untouched viewer sees no pop and no LEVEL 24.** That is the cost of never autoplaying; the
  end card has to sell the game alone. Give it the title, the shelf and PLAY FREE.
- **Hard-coded result text** was wrong for players who wasted moves. Ask the solver.
- **One bloop per jelly, 0.09 s apart** (about 11 a second) breaks the 3-per-second sound rule; the
  build that passed QA still does it. Play one bloop per pour, pitched by its length, or space them
  at least 0.33 s.
- A pop callout ("YUMMY!") sat on the last jelly at the near-fail. Clear callouts once the last move
  starts.
- A result banner at 0.42·h covered the jar it talked about. Put banners in the top band. Fade the
  hook line when any result banner appears.
- A square logo ran into the end-card title. Use `logoMaxH`, or an `art(c, layout)` callback for a
  custom shelf.
- `PA.after` timers survived Replay. Use a generation guard (`later()`) and `PA.clearTweens()`
  before `reset()`.
- Old `story_idle-*` frames from earlier builds stay in `qa/`. Clear the folder before a re-run, or
  a reviewer reads frames of a game that no longer exists.
