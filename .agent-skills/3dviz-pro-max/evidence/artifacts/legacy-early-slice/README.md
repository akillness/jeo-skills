# Small Worlds — archived early slice

This directory preserves the public evidence from the retired Latent Village app. It is an
historical artifact, not an installable or runnable example. The source witness, report, design
notes, machine-readable observations and original captures remain together so the recorded claims
can still be audited after the application runtime is removed.

- [Kit blueprints used, and what is authored here](design-system.md#built-on-the-kit-blueprints-2026-09-08)
- [Design decisions](design-system.md) — look statement, atmosphere and post numbers, palette
- [Scene state and source grounding](scene-spec.json)
- [Actual checks and limitations](validation-report.md)

## Quality tiers

Every landmark and every named yard prop is built through the kit contract's `buildKit(create,
{tier, surface})` at **T2** — seeded albedo, normal and roughness maps drawn at page load plus
vertex-baked occlusion — and hangs in a `THREE.LOD` beside a **T0** blockout proxy. The Willow
Watermill also loads the Blender-baked **T3** hero `kits/gltf/watermill-t3.glb`, which draws from
9.49 m out, where its wheel's rotation is no longer legible; nearer than that the procedural build
draws, because the bake is frozen and the wheel is this scene's one mechanism. The instanced
background (shore ring, reed banks, pavers, flower drifts, fence run) stays **T1** and is never
wrapped in a LOD: one `InstancedMesh` is one draw call at any count. A host with no 2D canvas —
every Node test run — builds the whole village at T1 instead, and says so through
`window.__viewer.tiers()`.

The tier of every object class, the switch distances and the three departures from the
recommendation are in [design-system.md](design-system.md#quality-brief-2026-09-09); the
before/after draw calls are in [validation-report.md](validation-report.md).

`?level=N` in the URL pins every landmark to one LOD level — `?level=1` on a two-level landmark
draws its blockout. It is a debug flag; nothing in a shipped view uses it.

The occlusion bake is cached in `localStorage` (`village-ao-cache.js`, ~101 kB for the whole
village, one byte per vertex), keyed by module id, params, tier, surface settings and a signature
of the geometry itself, so an edited kit re-bakes rather than restoring a stale bake. It takes the
page from 2.26 s to **0.48–0.54 s** page-to-first-frame on a warm cache; the numbers are in
[validation-report.md](validation-report.md).

## Looks

`?look=<id>` puts the village under one of five catalog looks — sky, fog, environment, lights,
tone mapping, post, and for one of them the lens — each copied from a style-profile or
lighting-mood record's `defaults.values`, with every retuned number named and explained in
`village-look-table.js`. `?mood=<id>` accepts only the lighting moods. Both take the short id or
the full record id; an unknown id warns and falls back to the default.

| | |
| --- | --- |
| `?look=dusk-golden-hour` | the default: warm low key, cool fill, `#b58c66` horizon — every committed capture |
| `?look=ghibli` | painted blue sky, high soft key, blue-filled shadows ([look-ghibli.png](captures/look-ghibli.png)) |
| `?look=tilt-shift` | 22° telephoto, no fog, a depth-of-field band that tracks the orbit target ([look-tilt-shift.png](captures/look-tilt-shift.png)) |
| `?mood=night-lantern` | no sun; a point light in each of the seven lantern heads ([look-night.png](captures/look-night.png)) |
| `?mood=overcast` | a cloud deck as the whole source, no cast shadow ([look-overcast.png](captures/look-overcast.png)) |

The look is in the tab title, in `window.__viewer.stats().look` and in `window.__viewer.look()`.
Full table and departures: [design-system.md](design-system.md#catalog-looks-2026-09-09).

## Captures

Three frames from the shipped build, taken headless at 1280×720 **on the GPU** with
`python3 ../../skills/3dviz-pro-max/scripts/capture.py --dir dist --gpu --all-views --click "#village-door" --settle-ms 1400 --motion-check 2000 --expect-motion --out captures`.
The 1400 ms settle matters: the focus tween runs 0.9 s, and at the script's 300 ms default every
named view is captured mid-tween.

| | |
| --- | --- |
| [overview.png](captures/overview.png) | the home view of the whole island; the mill draws its baked T3 hero here |
| [mill.png](captures/mill.png) | the Willow Watermill close view, inside the switch distance, so T2 with the wheel turning |
| [fox.png](captures/fox.png) | the follow camera on the three-tail fox |

[capture-log.json](captures/capture-log.json) records the whole run — ten views, one click, per-file hashes, an empty console log, the `--expect-motion` result, the capture mode and the WebGL renderer string. These frames were drawn by `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`; earlier revisions of this example were captured in SwiftShader, so they are not like-for-like with the older frames. One reading on one machine is not a hardware performance claim. The scene publishes `window.__sceneReady` and `window.__viewer = {views, setView(name), stats(), look(), tiers(), pinLevel(n)}` for the capture script; `window.__renderStats()` reports `renderer.info` for the whole composited frame.

Buildings, props and planting are assembled from `kits/`, whose module files are byte-identical
copies of the skill's `templates/kits/` (its README, proof harness and Blender script are not
copied). `scene-kit.js` is an adapter over `kits/kit-core.js`, so the page has one
material cache. The watermill's wheel is the blueprint's own hub, found at its `wheel` socket and
turned by this scene's flow control — the kit's `animate(dt)` is never called, because two drivers
on one wheel is exactly the bug that rule prevents. What no blueprint covers — the hinged inn door,
the mushroom cottage, the glasshouse panes, the telescope, the three-tail fox, the dragon and the
owl — is authored here and named in the [design system](design-system.md#built-on-the-kit-blueprints-2026-09-08).

These local artifacts began as pilot work while the standalone skill was being drafted. They do not establish broad catalog coverage or benchmark the completed skill. All geometry is procedural; no copied model assets or remote runtime assets are required.

## Retired scenes

The matrix deformation, the 3×3 face-turn cube and the Object Lab were removed on 2026-09-08 as a maintainer scope decision: the slice keeps one scene it can keep validating. Their twelve source and test files are gone, so their earlier passed check-run events were retired through correction events in `evidence/dataset-changes/early-slice-scene-retirement/` rather than rewritten. The observations stay readable as history in the [validation report](validation-report.md).

## Latent Village interactions

Adjust Current strength to slow or stop the wheel and visible current (not the water level). Moving the slider resumes paused motion. Use Inspect the pond or Inspect the mill to examine its response, inspect the mill, or open the inn door. Drop cargo releases a slatted timber crate into a contained yard; Nudge crate applies an off-center impulse once it settles. Show cargo collider reveals its enclosing solver shape. Creature buttons focus the four residents and report movement status. Reset village restores objects, routes, motion and mechanical parameters; Reset view only restores the camera.

The village applied the [catalog walkthrough](../../../evals/skill-behavior/village-application/README.md). Gait follows actual travel and residents take authored rests. Ground movement checks support and static clearance; this is not full foot IK or interacting creature rigid bodies. The wheel uses an authored flow response, not fluid simulation. The inn doorway is an inspection feature; creatures cannot enter it. Full bridge traversal remains outside the verified route set.

Rendering sleeps while the document is hidden and when a paused view settles; orbiting or editing controls requests new frames. Active rendering is capped at 60 frames/s with a 1.5 pixel-ratio cap and 1024px shadow map. These are work limits, not a measured hardware performance guarantee.
