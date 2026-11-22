# Build lessons and known gaps

Lessons that held across the archetype builds. Genre-specific tuning, bot patterns and mistakes live
in each `archetype-*.md` guide.

## Game code

- **Act on pointerdown.** Set the move target or the tap result in `onDown`. A quick tap can press
  and release between two frames; acting on move or up loses it.
- **Keep your own `started` flag** and clear it in `reset()`. `PA.input.touched` survives Replay,
  and the game must wait again after Replay. The template does this.
- **Clamp actors to a traced floor polygon** of the plate, inset per actor size, so nobody walks on
  walls, water or the HUD.
- **A 4-direction walk is 2 rows mirrored.** Draw the front and back rows, mirror them for the other
  side, and step frames by distance walked (one frame per about 26 px), not by time.
- **A boss drops in onto the floor** (about 0.65 s from above, with a shake). It never pops in
  mid-air or under the HUD.
- **Auto-fire always targets the boss** once it is on screen. Helpers must not reward hugging the
  boss: slow their hits on it, or the losing path wins.
- **Pieces at the game's scale.** Measure piece sizes on the frames and match them. A thin swarm, a
  carpet of tiny units, or a payoff on the horizon reads as off-model. In 3D, match the camera
  framing instead: the hero's screen size and position and the horizon height.
- **The PLAY FREE pill in plain logical coordinates,** so `PA.pillRect` is right.
- **Redraw every number baked into HUD crops.** Paint it out with row-profile fills, then draw it
  live.
- **Crop off or lock every non-functional control** in HUD crops (a pause tab, unused ability
  buttons). A locked control shows a padlock and a toast, never a CTA. Locked abilities double as
  the tease.
- **Banners clear of the hero:** the top band when the hero is low, the lower band when it is high.
- **Timed or moving hint targets** (an air jump, a closing gap) use
  `PA.draw.hintHand(c, at, null, {urgent: true})`.
- **`PA.hit` under a transformed context** registers the coordinates it is given and fails silently.
  Pop the transform before drawing buttons.

## Physics and levels

- **One shared simulation module.** Put the level, the physics and the hint table in `src/sim.js`,
  which runs in the ad and in Node. Include it before `game.js` with a second `<!-- include: -->`.
- A Node script that plays the route finds unreachable ledges and loops before any browser run. It
  can also enumerate every move order of a puzzle and write the hint table.
- **Scrolling levels are drawn in code.** For a level taller than the screen:
  - draw the blocks into one offscreen canvas at boot, from colors sampled on the frames;
  - scroll a camera that follows the hero, clamped to the level;
  - draw the plate behind it at about 0.25 parallax.

## Libraries

- Vendor any library locally, pin it, and tree-shake it. Never load from a CDN: `build.py` refuses
  external references.
- An include whose path ends in `.min.js` or sits under `vendor/` is not scanned for `fetch` or
  storage calls. Zero network requests at run time is still checked by `qa.py`.
- Keep `vendor/package.json`, the lock file and the built bundle. `node_modules` is restorable with
  `npm ci`.

## Known gaps in the runtime and scripts

These are not built. Work around them in the game's own code and write the gap in `notes.md`:

- `PA.input` tracks one pointer. A game whose controls need two thumbs collapses to one finger (see
  [unknown-genre.md](unknown-genre.md)).
- No `PA.world(w, h)` to center a fixed-size world on non-9:16 screens.
- No `PA.camera` for follow, clamp and world-to-screen in scrolling levels (about 15 lines per
  game).
- No plate-space helper (`toPlate` / `toLogical` with a contain fit): about 40 lines per plate-based
  game, described in [archetype-merge.md](archetype-merge.md).
- One-axis QA bots (crowd runner, lane shooter) need the game's drag gain to convert `move`.
- No plate inpaint step for static road markings the game redraws scrolling.
- Paint-outs of baked HUD numbers are hand-written Pillow code.
- No helper fits a path to a mask for loop and track genres.
- None of the bundled fonts is pixel-style. A pixel-art HUD needs the user's font or another OFL
  pixel face.
- `asset_download` returns one signed URL per asset. Keep take counts low, then regenerate only the
  bad ones.
