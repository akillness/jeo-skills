# Archetype: platformer (portrait climb)

One build of this pattern passed the skill's QA (19 of 19 base checks, fake ad containers in
headless Chromium). The source was a landscape gameplay recording of a side-view platformer: the
hero hops up ledges and curls into a ball to dunk through hoops. The landscape level was **re-sliced
into a portrait tower climb** (12 tiles wide, about 3 screens tall). **2.5D from frames**: the game
renders in 3D, but its camera is a fixed side view, so a plate, code-drawn voxel blocks and sprites
read the same at phone size. Hook "HOP UP AND DUNK!". Active run: 3 dunks, end card at 37.2 s.
Untouched: the end card at 10.0 s by the idle timeout. Meta 603 KB, Google ZIP 422 KB.

## Controls

- **Tap where you want to land.** On the ground the hero hops toward the tap, aimed to come down on
  the tapped point when it is reachable. A tap in the air (once per hop) is the air jump, re-aimed
  at the new tap, with the game's cyan ring.
- This replaces the game's ◀ ▶ + A virtual pad: one finger instead of two thumbs. That is **drift**;
  say so in the brief and ask the user (see "Virtual-pad games" in
  [unknown-genre.md](unknown-genre.md)).
- Act on pointerdown. Before the first touch: the hero breathes on the start ledge, hoop 1 glows
  above, and the hand loops a tap on the first ledge.
- The hint hand taps the next landing spot from the level's route table. For the air jump it uses
  the `hintHand` `urgent` cue (the spot is only valid while the hero is in the air).

## Beat sheet (35–45 s)

| Time after the first touch | Beat                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0–5 s                      | 2 hops, an air jump into hoop 1: **DUNK!** (slow-mo, net swish)                                                                            |
| 5–15 s                     | Spike trench: a red button builds the bridge (or an air-jump shortcut); climb to hoop 2: DOUBLE DUNK!                                      |
| 15–28 s                    | A key over a gap (air jump needed); the lock column vanishes; climb to the top hoop: **MEGA DUNK!** (shake, flash, confetti, ducked music) |
| result                     | 3 dunks: "LEVEL 1 CLEAR! NEXT: LEVEL 2"; otherwise "SO CLOSE! 1 hoop to go!" or "NICE TRY! n hoops to go!"                                 |
| end card                   | dunks, hops, time; a locked LEVEL 2 card built from pieces the recording shows later (switch blocks, lock column)                          |

Endings: 3 dunks (goal), a 40 s cap, the idle timeout. Spikes cost time, never the game: the hero
pops and respawns at the last checkpoint after 0.8 s. An untouched viewer's end card says "CAN YOU
DUNK 3?" with no row of zeros.

## Tuning that made win and near-fail reliable

- **One route table, one sim.** The level (tiles written bottom row first), the physics and the
  route table live in `src/sim.js`. A Node check (`analysis/check_route.js`) plays the route and
  `render_route.py` draws a route map. The game, the hint hand and both QA bots use the same table.
  Four route bugs were caught in the sim before any build.
- **The 3-row step rule:** gravity 2600, hop vy -1120 (apex about 240 px), so one hop climbs 3 rows
  of 60 px tiles. Alternate ledges left and right every 3 rows, so a hop never bonks the ledge
  above. Air jump vy -1060, vx ≤ 600.
- Damp vx on the landing bounce, or the hero rolls off small steps. Match route steps by the hero's
  footprint, not its center, so resting on a corner still counts.
- A dunk: the hero crosses the rim line moving down within ±40 px of the rim center.
- **A short level needs a declared length.** A good human clears this level in about 17 s of play.
  Either set `ACTIVE_LENGTH = (lo, hi)` in `qa_bot.py`, or let the good bot rest before each tap
  (here 1.5 s, "reading the ledge") to land in 33–52 s. Don't pad the level.
- Add empty rows above the last goal so it never sits under the HUD.

## QA bot pattern

- `qa()` exposes:
  - `tap` (the route's next landing spot while resting) and `air` (the air-jump spot while
    airborne), both in client px;
  - `ground`, `vy`, `rest` (seconds at rest), `dead`, and `up` (a hop in place);
  - `progress` = clock + hops + dunks.
- `active`: air-jump at `air` once `vy > -160` (near the apex); otherwise tap `tap` after 1.5 s of
  rest.
- `fail`: a careless player. It taps every 2 s, every other tap is a hop in place, and it never uses
  the air jump. It ends with 1 of 3 dunks.
- Bots may read any snapshot field (`vy`, `rest`), not only tap targets.
- Storyboard: hook, first hop, each dunk, an air jump, the switch, the key, result, end card.

## Asset map

Pick each model with `recommend`.

| Element                                                                   | Source                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Far jungle backdrop (parallax 0.25)                                       | image edit of `f_11.0`, `f_5.0`, `f_26.0`; everything but the far jungle removed                                |
| Hero: ball ×2, stand, leap, cheer                                         | character sheet (transparent, from an image model) from `f_5.0` (curled), `f_11.0` (standing), `f_22.0`         |
| Hoop, sunflower, palm, key, lock, red button                              | prop sheet from `f_5.0`, `f_22.0`, `f_26.0`                                                                     |
| Purple voxel blocks, grass tops, blue stone, spikes, dotted switch blocks | code: faux-3D voxels (front face, lit top, dark side) in colors sampled from `f_11.0`, `f_19.0`                 |
| Cyan trail, air-jump ring, hoop poles                                     | code, matched to `f_4.1`, `f_5.0`                                                                               |
| Logo                                                                      | image model from the game name, `f_5.0` + `f_11.0` as style references, flat gray, keyed (the studio gave none) |
| Font                                                                      | Fredoka Bold (bundled); the game's pixel font has no OFL match                                                  |
| SFX: hop, air, dunk, ouch, key, switch, win, fail; music                  | sound-effect model, 1 take each (dunk boosted 10 dB); music model, 30 s (the recording is silent)               |

## Mistakes seen

- **Thin floating ledges** where the source level has chunky walls and stairs. Draw blocks as solid
  as the frames.
- The MEGA DUNK banner covered hoop 3. Move banners to the lower band when the action is in the
  upper half.
- An end-card stat in a unit the game never uses ("31 m"). Show the game's own numbers (dunks, hops,
  time).
- The landscape side-scroll squeezed into 720 px showed no lookahead. Re-slice the level along the
  portrait axis instead of letterboxing.
