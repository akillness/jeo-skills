# Route-outs

`web-game-development` only owns Three.js/browser gameplay-architecture work
routed through the 19 upstream sub-skills. Route these adjacent jobs to the
repo's existing skills instead of stretching this pack to cover them. Each
entry below is grounded in a direct read of that skill's own `SKILL.md`.

## `unity-gamedev-skill-pack` — different engine, same "pack" shape

Curates external **Unity/C#** skill packs (Addressables, Cinemachine, GAS,
VContainer, UniTask, Wwise) into a reviewed internal package with provenance,
risk notes, and rollback. Route here whenever the engine is Unity, not
Three.js/browser. This is the closest sibling in shape — both are routing
packs over an external skill family — but the domains do not overlap: Unity
guidance must never be applied to a Three.js project, and vice versa.

## `game-performance-profiler` — Unity/Unreal frame-time triage

Routes Unity and Unreal frame-time complaints (profiler screenshots, `stat
unit`/`stat gpu` output, Steam Deck/target-device review packets) into a
bottleneck-first profiling brief. It is written for Unity/Unreal, not
Three.js/WebGL — for browser-game frame-time or draw-call problems, stay in
this pack and use `optimize-threejs-games` instead. Route to
`game-performance-profiler` only if the same studio also ships a Unity or
Unreal build and the complaint is about that build.

## `game-ci-cd-pipeline` — Unity/Unreal build automation

Designs or repairs Unity Build Automation, Jenkins, TeamCity, or GitHub
Actions pipelines for **engine cook/package builds**, naming a signal tier
(fast branch-gate CI, nightly/package-candidate, release/certification)
first. It is Unity/Unreal-scoped. For a Three.js/browser project's release
packaging and deploy verification, stay in this pack and use `ship-web-games`;
for its build/test CI wiring, treat this as a generic web CI/CD concern
outside both packs unless the project also has a Unity/Unreal build.

## `game-build-log-triage` — Unity/Unreal editor and cook logs

Triages Unity/Unreal editor, build, package, cook, compile, and CI logs into
the first actionable failure. It is scoped to Unity ("Editor.log") and
Unreal ("UHT/UBT failed", cook errors), not browser/Node build tooling. A
failing Three.js/Vite/webpack build stays inside standard web tooling or
`ship-web-games`'s release-sequence checks, not this skill — route here only
for a co-located Unity/Unreal build failure.

## `game-demo-feedback-triage` — engine-agnostic playtest triage

Triages mixed playtest/demo feedback (Steam Playtest responses, creator
reactions, survey comments, bug lists, performance findings) into a
prioritized fix brief. This one is **not** Unity/Unreal-specific — it applies
directly to a Three.js/browser demo's playtest feedback too. Route here when
the task is "what should we fix first from this pile of feedback," and keep
`test-playable-web-games` for turning the resulting priorities into
deterministic regression proof.

## `steam-store-launch-ops` — Steam store page and launch-window strategy

Turns Steam store-page, wishlist, demo, Next Fest, and launch-window
ambiguity into a launch brief (page-promise audit, wishlist-signal check,
demo-readiness gate, event-timing workback, launch-ops runbook). Route here
for Steam marketing/launch-ops questions regardless of engine; keep
`ship-web-games` for the technical deploy/verify sequence of the browser
build itself.

## `perfectpixel` — AI-generated 2D sprite sheets

Generates character + animation sprite sheets (walk/run/attack/magic, 8
directions) and exports engine-ready bundles (spritesheet, `manifest.json`,
Aseprite JSON, per-state GIF/APNG, individual frame PNGs) from a text
description. Route here when the concrete need is generating new 2D pixel-art
sprite assets; then hand the result to `build-hybrid-game-assets` inside this
pack to decide how the sprite sheet gets integrated as runtime 2D UI media
versus a 3D representation.

## Quick decision list

| Signal in the request | Route to |
| --- | --- |
| Engine is Unity or Unreal (any concern) | `unity-gamedev-skill-pack`, plus the matching Unity/Unreal-specific skill below |
| Unity/Unreal frame-time or profiler capture | `game-performance-profiler` |
| Unity/Unreal build/cook/CI pipeline design | `game-ci-cd-pipeline` |
| Unity/Unreal red build/cook/editor log | `game-build-log-triage` |
| Sorting mixed playtest/demo feedback (any engine) | `game-demo-feedback-triage` |
| Steam store page, wishlist, Next Fest, launch timing | `steam-store-launch-ops` |
| Generating new 2D pixel-art sprite sheets from text | `perfectpixel` |
| Everything else Three.js/browser gameplay | Stay in `web-game-development` |
