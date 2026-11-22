# Thornvigil specifics

Repo: `git@github.com:MengTo/thornwake.git`; standalone checkout `/Users/mengto/Downloads/Projects/thornwake` and its worktrees. Follow `AGENTS.md`:
- standing authorization to commit, push and publish;
- the 50 MB upload limit, with sizes reported in exact bytes;
- a changelog entry with real 2880×1800 screenshots;
- provenance recorded in a follow-up commit after publishing.

Publishing to Netlify `thornvigil` needs the Codex session; this Mac has no Netlify CLI or token.

## Where the motion lives

| File | What |
|---|---|
| `src/player-native/sword-attacks.mjs` | Knight/pilgrim strike baker: `pilgrimKeys` for quick (`attack`) and heavy (`long_hit`), `QUICK_CUT_FINISH`, `WRIST_BEND`, `FOREARM_ROLL`, `reachFor`, `arcAbout`, kinetic-chain lead |
| `src/player-native/skill-performances.mjs` | Performances: `bowShot`, `bowPower` (keys `[time, ease, channels]`), `drawBow()`, `LOOSES`, staff and spell moves |
| `src/bow-anchor.js` | `BOW_ANCHOR` in the head bone's frame (+X left, +Y forward, +Z down): `[-.045, .05, .075]`, under the jaw beside the chin |
| `src/player-native/arm-anatomy.mjs` | `armAnatomy`, `elbowFlexion`, `boneTwist`, `createArmSolver` (`solve`, `wrist`, `present`, `orient`) |
| `src/player-equipment-grips.js` | Finger poses (fist, relaxed, hook); `apply({ carry, open, hook })` |
| `src/player-actor.js` | `drawHook()`: the window in which the drawing hand holds its hook |
| `src/combat-rules.js` | `RULES` clocks: light 0.3/0.16/0.46, heavy 0.67/0.2/0.7, shoot 0.55/0.04/0.4, powerShot 0.95/0.04/0.55 (startup/active/recovery) |
| `src/game-player.js` | `gamePlayerMotion` (action time to motion time); the in-game bow string and arrow (`stringBow`) |
| `src/player-starter-gear.js` | Characters-page bow string and seat |
| `docs/combat-animation-standard.md` | The standard (rules 1–22) |

## Tests

These are the files to run after any motion change:
- `tests/arm-ranges.test.js` (rules 15–20; slow, about 2–3 min)
- `tests/bow-shots.test.js`
- `tests/knight-strikes.test.js`
- `tests/sword-attacks.test.js`
- `tests/player-shield-mount.test.js`
- `tests/player-arm-anatomy.test.js`
- `tests/skill-performances.test.js`
- `tests/game-player.test.js`
- `tests/archer-skill-vfx.test.js`
- `tests/player-idle-action.test.js`
- `tests/notebook-classes.test.js`
- `tests/player-strike-smear.test.js`
- `tests/player-rest-poses.test.js`
- `tests/changelog.test.js`

The full suite is `node --test tests/*.test.js`. As of 2026-10-01, 14 asset and props tests fail on `main` for reasons unrelated to motion (Waystone rasters, creature GLB quantization, props budgets, the camera scale, the troll and others). Compare against that list rather than expecting zero failures.

## Tools (`scripts/tools/`, installed into `.dream-loop/moves/`)

| Tool | Use |
|---|---|
| `keydesign.mjs R '[u]' '[f]' '[b]'` | Hand target and checks from anatomical intents |
| `armcheck.mjs <gender> <class:move,...> [trace]` | Worst joint ranges and skin stretch/crush per region over every frame; `trace` prints the R arm per frame |
| `at.mjs <gender> <clip> <t...>` | Fist position and blade direction at motion times (knight clips) |
| `knight-measure.mjs <gender> [attack,long_hit]` | Face (front view) and head gaps, tip height, board pierce, fist behind the board, pelvis turn, tip speed peak |
| `anchor.mjs <gender> <shoot\|powerShot>` | Draw hand and elbow per frame in world space and in the head frame, distance to the anchor |
| `drawfit.mjs` | Full-draw elbow height against the arrow, raise, flex, max raise, both shots and both bodies |
| `face.mjs` | Nose, chin, jaw corner, back of the skull and crown in the head bone's frame (from the bound mesh) |
| `jumps.mjs <gender> <class> <type> [from] [to]` | Per-frame joint jumps over 12° in a baked performance clip |
| `baketime.mjs` | Bake cost per performance (prewarm anything over about 100 ms) |
| `setup.js` / `play.js` / `shot.js` / `host.html` | Capture helpers (see `review.md`) |
| `msheet.py` / `psheet.py` | Judge sheets |
| `ab-pack.py` | Blind A/B set builder |
| `vidcompose.py` + `encode.swift` | Side-by-side review videos (AVFoundation; there is no ffmpeg on this Mac) |

Capture setup:
- Start the receiver from the checkout: `node scripts/changelog-capture-receiver.mjs .dream-loop/moves 6163`.
- Host page: `http://localhost:5173/.dream-loop/moves/host.html` (dev server: `preview_start thornwake-dev`).
- Characters page: `/characters.html?wardrobeReview=1&class=<cls>&tab=moves&capture=1&photo=1`.
- In play: `/?review=character&class=<cls>&action=moves&view=side&photo=1&hud=0`.

## Live-rig snippet (in-play review URL, in-app browser)

```js
for (let i = 0; i < 80 && !(window.game && window.world && window.__stepFrames && document.querySelector('[data-game-move="Idle"]')); i++) await new Promise(r => setTimeout(r, 500));
document.querySelector('[data-game-move="Idle"]').click(); await new Promise(r => setTimeout(r, 1500));
const game = await import('/src/game.js'); window.game.status = 'playing'; window.game.effects = []; window.game.projectiles = [];
const name = o => o.userData?.nativeName || o.name, sets = [];
window.world.scene.traverse(o => { if (o.isBone && name(o) === 'forearm.R') { let top = o; while (top.parent?.isBone) top = top.parent; const find = n => { let r = null; top.traverse(b => { if (!r && b.isBone && name(b) === n) r = b; }); return r; }; sets.push({ s: find('upper_arm.R'), e: o, h: find('hand.R') }); } });
game.startAction(window.game, 'light', window.game.player.angle); window.__stepFrames(1, 1e-4);
const V = o => o.getWorldPosition(new o.position.constructor()), before = sets.map(x => V(x.h));
window.__stepFrames(1, 1 / 30); const moved = sets.map((x, i) => V(x.h).distanceTo(before[i])), set = sets[moved.indexOf(Math.max(...moved))];
const out = []; for (let f = 2; f <= 24; f++) { window.__stepFrames(1, 1 / 30); const s = V(set.s), e = V(set.e), h = V(set.h);
  out.push(`${f} flex=${(e.clone().sub(s).angleTo(h.clone().sub(e)) * 57.3).toFixed(0)} reach=${(h.distanceTo(s) * 100).toFixed(0)}cm`); } out.join('\n')
```

## State after the pass (2026-10-01)

- **Releases.** 1.0.71 (`ff569df2`), 1.0.72 (`d721aa07`) and its anchor fix (`08914d81`) are pushed to `main`, but not yet published.
- **Final scores**, lower of the two critics:

  | | Characters page | In play |
  |---|---|---|
  | Knight quick | 5 | 6 |
  | Knight heavy | 6 | 5 |
  | Archer quick | 6 | 6 |
  | Archer power | 4 | 6 |

- **Faults both critics name**, all body and timing rather than arms:
  - Knight:
    - The quick strike's wind-up is an upright "salute" raise, not a cocked chamber.
    - The heavy re-raises to vertical before the strike (a double wind-up).
    - The buckler forearm reads as a stump (the mount design).
    - A frozen hold after impact.
    - The lunge is set before contact.
    - The buckler drops at the end of the heavy.
  - Archer:
    - On the Characters page the chest is square and she swings 90° after the release.
    - The power shot's aim flips during the raise, and it barely differs from the quick shot.
    - In play, the hand passes the back of the neck for 1–2 frames after the loose.
  - These are the next targets toward 8/10.
