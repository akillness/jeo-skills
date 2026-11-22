# Lanternfall: design system

## 1. Look statement

- **Feeling:** gentle, expectant, communal
- **Time of day / setting:** civil dusk, no sun above the horizon; the only key light is practical
- **References (traits, not titles):** dusk photography of a lantern-lit river town (practical
  density, 1 lantern per 2.5–4 m of frontage); hand-painted animation night exteriors (a two-stop
  painted sky, no stars); watercolour game art (value grouping into three masses)
- **Palette:** `#1b2a4a` sky zenith / deepest shadow · `#5a4b7a` sky horizon, cool fill ·
  `#f2b25c` lantern paper (primary warm) · `#c8642e` lantern frame, roof tile, accent warm ·
  `#e8d9b8` ochre plaster catching lantern light
- **Key light:** no key — a cluster of practicals. 8 lantern-post lamps at 34–75 cd and 4 hanging
  paper lanterns at 46 cd, all decay 2. Rim: DirectionalLight `#8a7bb8` 0.85 from azimuth 210°,
  elevation 14°, the only shadow caster besides one lantern. Fill: HemisphereLight
  `#5a4b7a` / `#2a1f1a` at 0.8.
- **Camera:** 42° FOV, eye height ~1.6–2.6 m in the walking views, orbit 3–62 m, polar 42–88°
- **Signature technique:** the river is a planar mirror under two scrolling ripple layers, so every
  lantern near the water appears twice — once in the air, once in the water.
- **Deliberately absent:** stars, a moon disc, cyan water, rainbow lanterns, any real place name.
  The town, the river ("the Selm") and every business are invented.

Source records: `knowledge.style-lantern-festival-riverside`, `knowledge.lighting-mood-night-lantern`
(through `rigs/lighting-night-lantern.js`), `recipe.fantasy-village-diorama`, and the blueprint
records listed in §5.

**Departures from `defaults.values`:**

| Value | Record | Built at | Why |
| --- | --- | --- | --- |
| `fog.density` 0.045 | style | 0.016 | The record is tuned for a single street. A 47 m-wide village needs the far bank and the landmark to survive; at 0.045 everything past 20 m was one flat mass. |
| `lights.fill.intensity` 0.35 | style | 0.80 | The record's own check is that with every emissive off, the bridge, roof line and gate still read. At 0.35 across this many metres they did not — first capture pass showed unlit buildings as black silhouettes. |
| `lights.rim.intensity` 0.40 | style | 0.85 | Same reason; the rim is also the scene's only wide shadow caster, and shadows are what keep buildings off the "floating" list. |
| `camera.orbit` 4–22 m, polar 60–92° | style | 3–62 m, 42–88° | The record assumes a walkable street. This artifact is also explorable from above, so the orbit has to reach an overview; 92° polar would put the camera under the terrain. |
| Lantern paper `emissiveIntensity` 3.0 | style | 1.8 | At 3.0 with bloom the paper clipped to white; the look wants warm amber above the bloom threshold, not blown highlights. |
| Dynamic light cap 12 | style | 12 (kept) | Unchanged. Lantern posts 5, 9 and 10 and every string lantern past the fourth are emissive-only. |

## 2. Representation

**Illustration.** Nothing here is a simulation or a data playback. The authoritative state is the
authored site plan (`world/village-plan.js`) plus each walker's `state` object (position, heading,
phase, waypoint) inside the kit walkers. The animation displays that state: gait phase advances by
distance travelled over stride length, the mill wheel turns on `dt`, ripple maps scroll on `dt`.
Nothing invents state the model does not hold.

## 3. Factual grounding

No factual claims. Every building, boat-less quay, business and place name in this scene is
fictional; the architecture is a village-kit composite, not a record of any real settlement,
period or construction method. The kit modules are authored creative starting points and certify
no historical construction, botany or structural behaviour. No citation applies.

## 4. Composition and scale cues

- **Hero:** the Ferryman's cottage (T3 Blender-baked), on the square where the practicals cluster.
  Second focal mass: the stone bridge; the landmark is the watch tower.
- **Scale cues in frame:** 2.0 m doors on every cottage, a 1.75 m walking figure on the square,
  a 0.35 m lantern diameter, a 0.94 m barrel, a 1.2 m quay drop to the water.
- **Depth layers:** foreground cottages / bridge and river / fogged hills and bluff, separated by
  FogExp2 `#3a3560` at the sky-horizon colour, so far roofs dissolve rather than stack.
- **Silhouette rule kept:** the bridge arch is the only large curved mass; the tower (9.5 m on a
  3.4 m bluff) is the only element at 2× its neighbours, and it sits in the right third of
  `overview`.
- **Authored views:** `overview` (home; village, bridge, landmark, river reflections) ·
  `square` (market at eye level, a walker in frame) · `bridge` (quay, reeds, water, parapet) ·
  `mill` (wheel and its reflection from across the river) · `bluff` (tower and guildhall) ·
  `lane` (west lane and the two animals) · `cottage` (hero close-up).

## 5. Quality brief

From `scripts/host-probe.py` and `scripts/design-context.py --host --delivery web-desktop`.

- **Delivery target:** web-desktop
- **Host ceiling:** T3 — "Blender 5.2.1 >= 4.2 found via standard install path + --version"
- **Capture mode:** gpu — `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)`

| Object | Role | Recommended | Built at | Why it departs |
| --- | --- | --- | --- | --- |
| Ferryman's cottage | hero | T3 | **T3** | `gltf/timber-cottage-t3.glb`, the shipped Blender bake. |
| Stone guildhall | hero (east bank) | — | **GLB** | Blender-authored asset shipped with the kit; its record declares T2 *not-proved*, so it is reported as "the shipped GLB", not as a proved tier. |
| River mill | mid | T3 available | **T2** | Deliberate: the T3 bake is static and freezes the wheel. A mill whose wheel does not turn is a worse artifact than a slightly softer one. |
| 3 cottages, long hall, 3 market stalls, round tower, stone bridge | mid | T2 | **T2** | `buildKit(create, {tier:'T2', surface})` — procedural albedo/normal/roughness plus vertex occlusion, 512 px maps, 14 AO samples. |
| 10 lantern posts | mid | T2 | **T2** | 256 px maps, 10 AO samples — they are small and there are ten of them. |
| Well, cart, near signboard | mid | T2 | **T2** | 384 px maps. The three props a viewer walks up to. |
| Barrels, crates, fences, clotheslines, far signboard | background | T1 | **T1** | Middle distance; flat kit materials are honest there. |
| Trees, conifers, reeds, rocks | background | T1 | **T1** | Individual kit groups so they can sway. |
| Far-field scrub (64 canopy lobes) | background | T1 instanced | **T1** | One `InstancedMesh`, per-instance position/rotation/scale/hue jitter. |
| Terrain, river, lanes, paper lanterns, cords, selection ring, embers | — | — | custom | No blueprint covers them; written in `world/`. |

- **To go one tier higher:** the mill, long hall, tower, bridge and stalls have no shipped T3 bake.
  `scripts/hero-tier.py` plus Blender 5.2.1 (present on this host) could bake them; not run here.
- **T0 blockouts were not used:** placement came from an authored plan with explicit terrain pads,
  not from a blockout pass.
- **Not wrapped in a LOD:** the far-field scrub. One `InstancedMesh` is one draw call at any count;
  a LOD per repeat adds a per-frame update and removes no draws.

## 6. Materials

| Family | Roughness | Metalness | Reads as |
| --- | --- | --- | --- |
| terrain (vertex-coloured) | 0.97 | 0 | dry earth, mud at the water line, grass on the tops |
| lane ribbon | 0.88 | 0 | packed earth track |
| river mirror layer | — (Reflector shader) | — | still water holding the lanterns |
| river ripple layers | 0.14 / 0.26 | 0.08 | moving surface, two scrolling normal layers |
| plaster (T2) | ~0.85 | 0 | limewashed wall with grain |
| roof tile (T2) | ~0.7 | 0 | overlapping courses |
| lantern paper | 0.90 | 0 | lit paper, emissive 1.8 |
| ironwork | 0.35–0.5 | 0.15–0.55 | dark village iron |

Seven distinct roughness values are visible in the square and cottage frames.

## 7. Motion

- **Ambient:** river ripple maps scroll at 0.02 uv/s along 37° and 0.012 uv/s along 128°; seven
  paper lanterns sway on seeded sines of 3.2–4.8 s at ±3°; the mill wheel turns at 0.5 rad/s;
  seven trees and ~12 reed clumps bend on their own phases; nine embers drift over the square;
  two figures walk the lanes and two animals the west lane, at 0.63–1.15 m/s.
- **Triggered:** selecting a building tweens the camera to it over 0.9 s (interruptible — any drag
  cancels it) and lights a pulsing ring on the ground at its base.
- **Reduced motion:** with `prefers-reduced-motion` the scene starts paused; `dt` is held at 0, so
  every animator returns false and the first frame is a still, readable image.

## 8. Interaction map

| Control | Selector | Changes | Visible confirmation |
| --- | --- | --- | --- |
| Pause motion | `#control` | ambient motion on/off | label flips to "Resume motion", `aria-pressed` flips, water and lanterns stop |
| Reset view | `#reset` | camera to `overview`, selection cleared | frame matches `overview`, panel reads "Nothing selected" |
| View buttons | `#view-<name>` | jumps to a named view | frame changes; the same names drive `capture.py --all-views` |
| Building buttons | `#pick-<id>` | selects and focuses that building | button `aria-pressed`, info block fills, ring appears at the base |
| Click in the scene | canvas pointerup | selects the building under the pointer | same as above; a click on nothing clears |

## 9. Runtime limits

- three@0.180.0, vite@7.1.5, postprocessing@6.39.4; pixel ratio capped at 2; PCF soft shadows.
- Lights: 12 dynamic PointLights (the look's cap), 1 of them shadow-casting at 512 px; one
  DirectionalLight rim at 2048 px; one HemisphereLight. Total light objects: 14.
- Shipped assets: two GLBs (2.4 MB total) served from the build; no remote runtime assets, no
  remote fonts, no fetched textures. Every other map is drawn into a canvas at build time.
- Draw calls and frame time: **not measured**. The scene renders at 60 fps in a headless Chromium
  on an M4 Max (captures completed without timeout), but no counter was read.

## 10. Opt-outs from the anti-slop checklist

| Item | Why this scene departs |
| --- | --- |
| #4 hero highest contrast | The brightest regions are the lantern papers and their reflections, not the hero cottage — that is the look's stated value structure (only lanterns above 0.85 luminance). The hero is the highest-contrast *building*. |
| #12 FOV 35–50° | Kept at 42°, inside the band, although this is closer to an environment than a product. |
| #14 no uniform grid | The bridge deck's cobble courses and the tower's merlons are regular by construction; both are kit geometry where the repeat is the subject. |
