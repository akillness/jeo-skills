# Lifecycle and Handoffs

Order multi-skill work along this lifecycle. Each stage names the upstream
sub-skill(s) that own it, grounded in the scraped upstream material. Do not
start a later stage's polish before the stage it depends on is defined —
combat feedback (VFX/audio) presumes a combat verb exists; ship presumes
test-playable proof exists.

## 1. Prototype

Owner: `build-isometric-arpg`.

Establish one coherent playable loop first: title/menu, character choice,
movement, one encounter, reward, progression, continuation. Inspect the
current game entry point, scene loop, content model, controls, save model,
and tests before adding scope. Build in vertical slices, starting with
movement, camera, collision, target selection, and pause/restart.

## 2. Systems

Owners: `build-game-camera-controls`, `build-threejs-enemy-systems`,
`tune-enemy-ai`, `design-action-combat`, `build-game-inventory`.

Define the reusable machinery before authoring content on top of it:
- camera targets, bounds, zoom range, occlusion policy
- portable enemy content contracts (IDs, stats, move IDs, AI hints) separate
  from runtime instance state
- enemy decision state machines (idle → investigate → pursue → attack →
  recover → retreat → defeated)
- combat verbs: startup/active/recovery, contact authority, defense,
  interruption
- inventory/loot/equipment transaction contracts (atomic swaps, no-loss
  persistence)

## 3. Content

Owners: `author-game-levels`, `build-game-monster-system`,
`design-game-encounters`.

Author the actual world and encounters on top of the systems above:
- flat, readable routes with separated collision/navigation/visual layers and
  motivated lighting
- individual monster rigs conforming to the shared socket/collider/animation
  contract from `build-threejs-enemy-systems`
- arenas, enemy composition, spawn pacing, objectives, boss phases, and
  reward cadence composed from the combat verbs already defined

## 4. Assets

Owners: `build-hybrid-game-assets`, `build-vesperfall-review-assets`.

Choose the right runtime representation (imported mesh, procedural geometry,
generated 2D media, or `img2threejs` reconstruction) before wiring content to
it, and preserve provenance, scale, sockets, collision, and budgets. Use
`build-vesperfall-review-assets` specifically when the task is a Vesperfall
catalog entry needing a transparent PNG plus a truthful live-model review
route.

## 5. Feel

Owners: `create-game-vfx`, `build-game-audio-feedback`,
`build-mobile-threejs-games`.

Add readable feedback only once the system/content it communicates already
exists: telegraph/contact/success/failure/status VFX, prioritized audio cues
for input/windup/contact/block/miss/damage, and mobile-specific control/HUD
adaptation (safe areas, orientation, non-drag alternatives).

## 6. Perf

Owner: `optimize-threejs-games`.

Measure a deterministic representative encounter (device, viewport, quality,
frame-time sample, draw calls, triangles, texture count) before changing
behavior, diagnose whether the limiting side is CPU or GPU, and apply
low-risk fixes first. Validate the same gameplay path after every change.

## 7. QA

Owner: `test-playable-web-games`.

Map the full player journey (launch, new game, controls, core action, enemy
encounter, reward, inventory/progression, save/continue, loss/retry, pause,
settings, completion) across desktop, touch portrait/landscape, and reduced
motion. Prefer deterministic seedable fixtures over grinding through the
campaign; a green build is not gameplay proof by itself.

## 8. Release

Owners: `ship-web-games`, `build-game-changelog`.

Release only a verified commit: run focused tests/lint/type checks/production
build/diff checks, package and deploy the exact validated commit, then poll
deployment status and prove the production game separately from local
readiness. Keep the in-game changelog's newest ledger entry synchronized with
the version actually deployed.

## Cross-cutting: map editor and mobile

`build-game-map-editor` and `build-mobile-threejs-games` are not tied to one
lifecycle stage — the map editor is a director tool layered over whichever
production world/encounter/enemy definitions already exist (inspect the
repository before adding a parallel source of truth), and mobile concerns
(controls, HUD, performance) should be checked at every stage from prototype
through QA rather than bolted on at the end.
