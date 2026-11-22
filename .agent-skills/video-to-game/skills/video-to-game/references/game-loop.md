# Build the game

Start from `templates/game.html`. One `index.html`, an `assets/` folder, Three.js from a pinned import map
(`three@0.160.0` on jsDelivr) and its examples (GLTFLoader, EffectComposer). No other library, no engine,
no build step: the file opens from any static server.

## A real loop, not a scene

- **Controls** in one line: arrows or WASD to move, Space for the main action (hold for the long version:
  glide, pour, charge), one more key at most. Gamepad too: left stick, A for the action, Start to begin.
- **A goal** the player understands without text: reach the lighthouse, wake every tree, rescue the villagers.
- **Progression**: the world changes as the player succeeds (color spreads, a new island, faster wind).
- **Feedback** on every action: particles, a camera nudge, a sound, the world reacting.
- **An end** and a restart (R or Start). A short calm ending shot beats a score screen.
- **Multiplayer** when the video shows it: local co-op on one keyboard (WASD + arrows) or AI teammates that
  play well enough to be shown in a trailer.

## The contract with the playtest

- `?autostart` skips the title, `?seed=N` fixes the level, and optional debug parameters can place the player
  (`?x=120`) or the camera (`?camd=24`) so a scenario reaches the key moment fast. The rendered game must stay the
  real one.
- `window.__game.state` returns read-only numbers a player would see on screen: phase, position, speed, grounded,
  the next obstacle or target. Scenarios read it to time their keys; they never write into the game.

## Camera

Reproduce the video's framing first, then make it playable: smooth follow with damping (`1 - exp(-k dt)`),
a little look-ahead in the direction of motion, a slight lag on height so jumps read, and no clipping into the
world. The hero stays big enough to read, near the center, as in the video.

## Performance

- 60 fps on a laptop is the target. Instancing for anything repeated (trees, rocks, grass tufts, birds),
  merged static geometry, shadows from one light with a tight frustum that follows the player.
- Texture sizes from the asset step (1K props, 2K terrain), mipmaps on, anisotropy 4 to 8.
- Measure: log `renderer.info.render.calls` and the frame time; drop the most expensive effect before cutting beauty.

## Text

The only text: a minimal title, one controls line, maybe an ending line. No tutorials, no HUD chrome, no fake
UI copied from the video. Counters, if any, are small icons in a corner.
