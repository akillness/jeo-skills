# Skill Routing Table

All 19 sub-skills live upstream at
[MengTo/Skills — agent-skills/game-development](https://github.com/MengTo/Skills/tree/main/agent-skills/game-development).
Descriptions below are grounded in the scraped upstream README and sub-skill
frontmatter. Fetch a skill with
`scripts/fetch-upstream-skills.sh --skill <name>` before following its
instructions — do not improvise its content from this table alone.

## Choose the narrowest matching skill

| Need | Skill | Use when (upstream-grounded) |
| --- | --- | --- |
| Complete playable vertical slice | `build-isometric-arpg` | Building or extending a playable isometric action RPG: game-loop architecture, camera/movement, zones, combat integration, content data, progression, saves, or a production-ready vertical slice. |
| Flat-world levels and lighting | `author-game-levels` | Authoring or revising readable, flat-world Three.js levels: movement/camera routes, collision/navigation, encounter zones, landmarks, objectives, pickups, motivated lighting, visibility, or deterministic level data. |
| Camera framing and controls | `build-game-camera-controls` | Implementing or tuning Three.js cameras: isometric framing, follow behavior, orbit/zoom limits, occlusion, lock-on, camera shake, touch camera controls, or camera regression tests. |
| Enemy content/moveset systems | `build-threejs-enemy-systems` | Building or refactoring reusable, data-driven enemy archetype/moveset systems: content schemas, model/rig conventions, move timing and contact contracts, runtime state boundaries, placeholder fallbacks, deterministic fixtures. |
| Monster rig/animation conformance | `build-game-monster-system` | Building, integrating, auditing, or refactoring rigged monsters: asset contracts, procedural/imported rigs, semantic joints/sockets, hurtboxes/attack volumes, combat animation states, enemy-runtime adapters, LODs, deterministic review fixtures. |
| Enemy behavior/decisions | `tune-enemy-ai` | Building, debugging, balancing, or testing combat enemy AI: aggro, target selection, navigation, spacing, attack choices, telegraphs, retreats, boss behavior, behavior-state machines, deterministic AI regression tests. |
| Combat verbs and timing | `design-action-combat` | Designing, implementing, tuning, or testing readable tactical action combat: attack timing, guard/dodge windows, hit contact, posture, lock-on, weapons, boss phases, combat feedback, deterministic combat tests. |
| Arenas, waves, and pacing | `design-game-encounters` | Designing, implementing, tuning, or testing action-game encounters: arena layout, enemy composition, spawn pacing, objectives, boss phases, reward cadence, encounter fixtures, difficulty validation. |
| Inventory, loot, persistence | `build-game-inventory` | Building or repairing inventory, loot, equipment, tooltips, drag-and-drop, persistence, progression systems: item schemas, pickup flows, stack rules, equipment slots, atomic swaps, save migration, no-loss regression testing. |
| Asset representation choice | `build-hybrid-game-assets` | Planning, creating, integrating, or auditing a hybrid asset pipeline: choosing among imported meshes, procedural 3D geometry, AI-generated reference art, 2D UI media, sprites, VFX, and performance-ready runtime asset delivery. |
| Vesperfall catalog + live review | `build-vesperfall-review-assets` | Building truthful Vesperfall asset-library review pairs from transparent PNG references and live Three.js/FBX/img2threejs models: adding a catalog asset, card-PNG plus inspector-model treatment, isolated model/moveset routes, provenance/grounding/test standardization. |
| Visual effects | `create-game-vfx` | Creating readable, performance-safe Three.js VFX: attacks, impacts, damage feedback, status effects, spell trails, particles, shaders, telegraphs, quality tiers, reduced-motion alternatives. |
| Audio feedback | `build-game-audio-feedback` | Designing or implementing responsive audio feedback: action sounds, combat layers, music states, spatial audio, mix priorities, mute controls, accessibility, mobile audio unlock, audio performance. |
| Mobile controls/HUD/perf | `build-mobile-threejs-games` | Building, tuning, or testing a Three.js game for mobile web: touch movement, action controls, target selection, touch inventory, safe areas, portrait/landscape layouts, responsive HUD, battery/performance budgets, real mobile browser QA. |
| Frame-time/draw-call diagnosis | `optimize-threejs-games` | Profiling, diagnosing, and improving Three.js/WebGL performance without regressing gameplay: frame-time drops, CPU/GPU pressure, draw calls, texture/geometry budgets, animation loops, adaptive quality, mobile performance, browser performance verification. |
| Full player-journey QA | `test-playable-web-games` | Testing a playable browser game end to end with deterministic fixtures and real browser evidence: gameplay QA, regression testing, controls, accessibility, responsive/mobile testing, save flows, console checks, performance smoke tests, release verification. |
| Release packaging/deploy proof | `ship-web-games` | Packaging, deploying, and verifying a playable game: release builds, asset delivery, private/public deployment, production smoke tests, browser proof, release notes, rollback readiness, cleanup of temporary QA resources. |
| In-game changelog/version UI | `build-game-changelog` | Designing, implementing, backfilling, auditing, and releasing in-game changelogs with contiguous versioning, deployment provenance, menu-state navigation, accessible toggle/close/Escape behavior, responsive release-ledger UI. |
| Production-linked map editor | `build-game-map-editor` | Building, extending, or auditing production-linked browser map editors for Three.js/isometric games: private director view, versioned editor document derived from authored placements, outliner/layer/selection/drag/snap/inspector/camera controls, enemy aggro/leash/patrol overlays, local draft import/export/undo/reset, IP+password session security, release without mutating live gameplay data. |

## Important boundaries (from the upstream README)

These are the exact upstream disambiguation rules — read them before combining
skills or assuming overlap:

- `build-threejs-enemy-systems` defines portable enemy **content** and
  runtime orchestration; `build-game-monster-system` owns individual **rig
  and animation conformance**; `tune-enemy-ai` decides **what an enemy should
  do**. All three are usually needed together for a new enemy, but none
  substitutes for another.
- `design-action-combat` defines individual **combat verbs and outcomes**
  (attack timing, contact, defense); `design-game-encounters` **composes**
  those verbs into arena pressure and pacing. Combat verbs come first;
  encounters consume them.
- `build-hybrid-game-assets` **chooses and integrates** asset
  representations (imported vs procedural vs 2D vs generated);
  `build-vesperfall-review-assets` proves **Vesperfall catalog and
  live-preview truth** specifically; `create-game-vfx` and
  `build-game-audio-feedback` **communicate gameplay state** through effects
  and sound, not asset selection.
- `test-playable-web-games` proves the **player experience** (deterministic
  fixtures, real browser playthroughs); `ship-web-games` owns the **release
  sequence and production read-back** (package, deploy, verify the live
  build). Test before you ship; shipping is not a substitute for playable
  proof.

## Skills without an explicit upstream boundary note

`author-game-levels`, `build-game-camera-controls`,
`build-mobile-threejs-games`, `build-game-inventory`, `optimize-threejs-games`,
`build-game-changelog`, and `build-game-map-editor` are not named in the
upstream "Important boundaries" section, but stay narrow by construction:
levels own world/collision/lighting, cameras own framing, mobile owns
touch/HUD/perf-budget surfaces, inventory owns item/loot/persistence,
optimize owns perf diagnosis, changelog owns the release-ledger UI, and the
map editor owns the paused director tool derived from production data. If a
task genuinely spans two of these, sequence them rather than merging their
instructions.
