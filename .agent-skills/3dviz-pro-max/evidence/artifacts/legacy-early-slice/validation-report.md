# Catalog looks and the occlusion cache — 2026-09-09

Two changes, no change to what the village *is*. (1) The page now wears one of five catalog looks,
chosen by `?look=<id>` / `?mood=<id>`, each copied from a record's `defaults.values` with every
retuned number named in [village-look-table.js](village-look-table.js). (2) The T2 vertex-occlusion
bake is cached (`village-ao-cache.js`), so the first frame stops paying for a bake that cannot
change between two loads of the same build. Geometry, materials, physics, colliders, support,
locomotion, water, the workshop cargo, the render loop and the tier policy are untouched, and
`kits/**` is still a read-only mirror.

## What ran

```sh
pnpm test        # 188/188 pass, 0 fail, 0 skipped  (170 pre-existing, unmodified + 18 new)
pnpm build       # exit 0 - index-*.js 819.47 kB (gzip 224.94), was 805.91 / 219.58
python3 ../../skills/3dviz-pro-max/scripts/capture.py --dir dist --gpu --all-views \
  --click "#village-door" --settle-ms 1400 --motion-check 2000 --expect-motion --out captures
#   exit 0 - 10 views, 1 click, console_errors [], page_errors [], motion.differs true,
#   capture_mode gpu, ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)
# one per look, into a scratch directory:
python3 ../../skills/3dviz-pro-max/scripts/capture.py --dir dist --gpu \
  --query "plate=1&look=<id>" --view overview --settle-ms 1400 --out <scratch>/look-<id>
python3 ../../scripts/check-docs.py    # from the repository root
```

The capture line is **10 views + 1 click**, not the 8 + 1 of the tier revision: `layout` and
`bridge` were added to the viewer contract for the showcase after that run. Every PNG in
`captures/` comes from this run, at the default `dusk-golden-hour` look, so the committed frames
match the committed code.

## Page to first frame, same host and renderer (M4 Max, ANGLE Metal, 1280×720)

Measured with [.local/first-frame.py](.local/first-frame.py): three loads in **one browser
context**, so `localStorage` survives between them, reading `performance.now()` at
`window.__sceneReady`.

| Load | Before (no cache) | After (cache) |
| --- | --- | --- |
| 1 — cold | 2,451 ms | 2,441 ms (bake 1,710 ms, then harvest + one 101 kB write) |
| 2 — warm | 2,258 ms | **535 ms** |
| 3 — warm | 2,218 ms | **475 ms** |
| occlusion, five landmarks | 1,663–1,685 ms every load | 1,710 ms once, then **5.5–5.8 ms** |

**−79% on a warm cache**, against a target of under 1,000 ms. A cold load is unchanged within
noise: the harvest and the single `localStorage` write cost under 60 ms against a 1.7 s bake.
The whole village is **103,869 bytes** of cache across 14 entries (5 landmarks, 9 props) — one
byte per vertex, against a 2 MB budget; over budget the cache would stay in memory and say so.

**What is cached, and how it can go stale.** Only the baked shade, which is a scalar: every writer
in `kits/kit-surface-ao.js` multiplies r, g and b by the same number, so one byte per vertex at a
1/255 step carries the whole result — below the step of the 8-bit framebuffer it is drawn into,
and 4× smaller than the `Float32Array` it came from. The key is the module id, its canonical
params, the tier and the surface settings (seed, size, ao samples/radius/dirt, family map). Before
an entry is applied, the group's **geometry signature** — per-geometry vertex counts plus a strided
hash of the positions — has to match the one stored with it, so editing a kit module or the
village's own assembly misses and re-bakes instead of restoring a stale bake. `AO_CACHE_VERSION` is
the manual escape hatch for a change that leaves the geometry identical and changes the bake.

## Looks

`?look=<id>` and `?mood=<id>`; unknown ids warn and fall back to `dusk-golden-hour`. The look owns
sky, fog, environment, lights, tone mapping, post and — for tilt-shift only — the lens; it owns no
geometry and no material. The table, with each look's source records and its departures, is in
[village-look-table.js](village-look-table.js) and summarised in
[design-system.md](design-system.md#catalog-looks-2026-09-09).

| Look | Frame | Size | What the frame actually shows |
| --- | --- | --- | --- |
| `dusk-golden-hour` (default) | [captures/overview.png](captures/overview.png) | 307 kB | unchanged from the tier revision — same composition, same warm key, same horizon band. This is the regression check on the cache: the quantised bake is not visibly different from the cast one. |
| `ghibli` | [captures/look-ghibli.png](captures/look-ghibli.png) | 266 kB | Reads as **hand-painted daylight, only partly as "painterly"**: the record's blue→pale sky gradient and its blue-filled (never black) shadows both arrive, and the 3.5:1 key-to-fill flattens the frame the way a painted background is flat. What does not arrive is the record's *value grouping* — the meadow is still the village's pale mint, not three painted green masses, and there are no cumulus card layers, because those are geometry. Honest verdict: the light is the record's, the painting is not. |
| `tilt-shift` | [captures/look-tilt-shift.png](captures/look-tilt-shift.png) | 329 kB | **Reads as a tabletop model.** A sharp band across the inn, tower and path with the mushroom cap and tree tops soft above it and the glasshouse, pond and foreground rocks clearly soft below; blur increases monotonically both ways from the band, which is the record's own check. The 22° lens flattens the island's perspective as promised. Missing: the record's +18% saturation / +10% contrast lift, so it reads as a *photographed* model rather than a *painted plastic* one. |
| `night-lantern` | [captures/look-night.png](captures/look-night.png) | 279 kB | **Reads as the record's objective almost exactly**: warm pools around each lantern head, readable surfaces inside them, and tinted (blue, not black) darkness between them and off the island edge. The lantern cores glow and nothing else does — bloom threshold 0.9 against the 0.9-ish emissive. The first version of this look, with the record's uncut `distance: 0`, was one flat yellow wash; the departure that fixed it is written down. |
| `overcast` | [captures/look-overcast.png](captures/look-overcast.png) | 236 kB | **Flat, soft and desaturated, with no hard cast shadow anywhere** — the record's objective — and objects still separate from the ground, because the T2 occlusion bake is doing the grounding the missing shadows would have done. It is the least dramatic of the five and that is the point; the risk here was the fog, and at the record's own 0.035 the island was a white veil. |

All four look frames are 1280×720 PNG, `plate=1` (no app chrome), `--settle-ms 1400`, GPU
(ANGLE Metal), captured from the same build as `captures/`. Their sha256:

```
6f6bdd1c51b3da256b5efa41950a02f421a191538a6a5a3bf3b592b289a54e0b  look-ghibli.png
40986667adf589be0753bc56af2ac1ef0dab04ff3966174374841ae47fe6b6d6  look-tilt-shift.png
ec30beb54e84e0d0c6109080841864aa2da3f65f1b657b48d058573136434694  look-night.png
24a745d88d4c88540acd7f3fb6f976069a3717ed2a0ab9a2e4ebf8690763ca32  look-overcast.png
```

The full run also picked up the per-view quality block `capture.py` gained in this phase:
`unusable_views: []`, every one of the ten views `usable: true`, luma means 0.43 (overview) to
0.63 (pond), no near-black view and no near-plane wall.

## What is honest to push back on

- **A look is lighting, not art direction.** Four of these five records also describe geometry,
  materials and composition, and none of that is applied. `tilt-shift` gets its lens because a
  lens is a camera setting; `ghibli` does not get its clouds.
- **Only `overview` is proved per look.** The other nine views were captured under the default
  look only. `tilt-shift` in particular focuses on the orbit target, so the close views work, but
  they are not in evidence here.
- **The default look is byte-different from the tier revision's frames** even though it is the
  same look: the AO is now quantised to 1/255 and the bundle changed. It is not visibly different.
- **The cache trusts its own signature.** A geometry change that keeps every vertex count *and*
  every 64-sample strided position hash would restore a stale bake. Bumping `AO_CACHE_VERSION` is
  the answer if that is ever suspected.
- **Two modules were split to stay under 200 lines**, both re-exporting everything they moved so
  no call site changed: `village-tiers.js` → `village-tier-surface.js` (the T2 build path: surface
  settings, `tierFor`, `buildAt`, the bake), and `village-ao-cache.js` → `village-ao-codec.js`
  (the pure half: key, byte format, geometry signature).

# Built at mixed quality tiers — 2026-09-09

The five landmarks and the eight named yard props are now built through `buildKit(create, {tier,
surface})` at **T2** (procedural albedo/normal/roughness maps plus vertex-baked occlusion), each
landmark is wrapped in a `THREE.LOD` beside a **T0** blockout proxy, and the Willow Watermill also
loads the Blender-baked **T3** hero `kits/gltf/watermill-t3.glb`, which draws from 9.49 m out. The
instanced background stays **T1** and is not wrapped in a LOD. Physics, support, locomotion, water,
the workshop cargo, the render loop, the post stack and every collider mechanism are untouched;
`kits/**` is a read-only mirror and was not edited.

Tier policy, the family maps and the switch distances live in `village-tiers.js` and
`village-tier-families.js`; the reasoning is in [design-system.md](design-system.md#quality-brief-2026-09-09).

## What ran

```sh
pnpm test        # 170/170 pass, 0 fail, 0 skipped  (159 pre-existing, unmodified + 11 new)
pnpm build       # exit 0
python3 ../../skills/3dviz-pro-max/scripts/host-probe.py --out <scratch>/host.json
#   quality_ceiling T3 (Blender 5.2.1), capture_mode_expected gpu (darwin, --use-angle=metal)
python3 ../../skills/3dviz-pro-max/scripts/capture.py --dir dist --gpu --all-views \
  --click "#village-door" --settle-ms 1400 --motion-check 2000 --expect-motion --out captures
#   exit 0 - 8 views, 1 click, console_errors [], page_errors [], motion.differs true,
#   capture_mode gpu, ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)
```

Both readings below are on the **same host and the same renderer** (Apple M4 Max through ANGLE
Metal, headless Chromium 1280x720): the "before" column was measured on the shipped revision-8
build before any of this revision's edits, not carried over from the SwiftShader logs.

## Before and after

| Measure | Before (revision 8) | After (revision 9) |
| --- | --- | --- |
| Draw calls, overview | 2,902 | **2,330** (−19.7%) |
| Draw calls, fox | 2,060 | **1,774** (−13.9%) |
| Draw calls, mill (close view) | 1,955 | 1,955 (unchanged: T2 adds no draw call) |
| Triangles, overview | 335,679 | 340,491 (+1.4%: the baked hero is 12,598 where the module was 10,604) |
| Triangles, mill | 213,443 | 213,443 |
| Frame time, overview | 8.3 ms median / 8.4 p90 | 8.1 ms median / 8.4 p90 — **vsync-bound at 120 Hz on this host, before and after** |
| Page to first frame | 0.45 s (same build forced to T1) | **2.37 s** (1.70 s of it the occlusion bake) |
| `index` chunk | 740.93 kB (gzip 200.10) | 805.50 kB (gzip 219.37), +8.7% |
| New assets | — | `watermill-t3.glb` 1,996.80 kB + a 45.88 kB GLTFLoader chunk |
| Build output | 3.6 MB | 5.5 MB |
| Node tests | 159 | 170 |
| Distinct textured materials | 0 | 60 across the five landmarks (21 / 13 / 9 / 3 / 14) |
| Capture mode | swiftshader | gpu |

The overview saving is one object: the mill's 287-mesh assembly is replaced by the baked hero's
single mesh past 9.49 m, and a mesh costs two draw calls (colour + shadow). Nothing else on the
island can be cut the same way — the remaining landmarks have no bake, and a blockout at the home
view is 90 px tall, so the T0 level is clamped past the 40 m orbit ceiling. **Under 2,000 was not
reached**: it would take either three more Blender bakes or blockouts in the shipped frame.

## What was observed

Frames read at 1280×720 from `captures/`, against the revision-8 frames of the same three views:

- **`mill.png` (T2, 7.4 m — inside the hero's switch distance).** The plaster now carries a tooth,
  the mill's plinth reads as coursed ashlar rather than a grey block, the roof planks separate, and
  the barrel beside the wall shows wood grain across its staves and darkened hoop shadows. The
  wheel, paddles, hub and axle still turn: this is why the bake is not the nearest level. Honest
  cost: T2's albedo multiplies the base colour, so the cream plaster reads a step greyer and
  cooler than the flat revision-8 wall.
- **`overview.png` (T3 at 26 m).** Same composition, same landmark places and heights. The mill's
  roof now shows individual tile courses with relief, its timber framing reads from the home view
  for the first time, and there is contact darkening under the eaves. The silhouette is identical
  to the module's, because the bake is that module's own geometry — nothing pops in shape at the
  switch, only in surface. No black seams, no z-fighting, no missing faces on the hero.
- **`fox.png`.** The follow camera holds the fox; the inn porch behind it shows tile courses,
  timber grain, the well's stone blocks and a grained barrel. Creatures are unchanged (T1).
- **Tier switch, inspected directly** with `window.__viewer.pinLevel(n)` at the mill view: T2 and
  T3 differ in wall brightness (the bake is warmer and lighter) and in roof relief (the bake is
  stronger), and the T3 wheel is darker and softer than the procedural one. The change is visible
  but the silhouette holds; hysteresis is 0.08. The switch is at 9.49 m and the home view is at
  26 m, so **nothing pops at the overview distance**.
- **T0 proxies** were confirmed to draw only under `?level=N`: pinned, the mill becomes one
  bevelled box at its measured bounds. At the shipped camera range they never draw.
- **No regression found** in water, cargo physics, creature routes, picking or the door: all 159
  earlier tests pass unmodified, and the capture run reports an empty console.
- **The hero GLB was re-baked mid-run** by the record work happening in parallel
  (`kits/gltf/watermill-t3.glb`, 1,915,772 bytes, sha256 `81a4cdc9b674…`, 12,598 triangles). The
  shipped frames are from that bake; an earlier capture set against the previous 1,996,796-byte
  bake was discarded rather than published.

## Limits of this revision

- One reading per view on one machine (Apple M4 Max). Frame time is vsync-bound at 8.3 ms both
  before and after, so this revision makes **no frame-rate claim** in either direction: the
  draw-call and triangle counts are the measurement, not the ms.
- T2 coverage is uneven and is published rather than hidden. `window.__viewer.tiers()` reports the
  colours that stayed flat: 42 of the watermill's, 28 of the inn's, 18 of the observatory's. The
  watermill's own T2 proof log shows the same 37-colour list, because that module jitters a hue per
  plank and tile while a record maps base palette colours only. Glass, foliage, water, the fruit
  and the lantern flames are unmapped **on purpose**.
- The occlusion bake costs 1.70 s at page load (Morel Cottage 0.69 s, Sunleaf Glasshouse 0.63 s —
  both authored, sphere-heavy shells). At the records' own 13 samples it is 3.65 s.
- The mill's kit is displayed at 0.42 scale, so its T2 tiles read about 2.4× finer than the pitch
  the proof captured; `buildings/watermill.js` has no size parameters, so a uniform group scale is
  the only fit. No visible tiling artefact at any shipped view, but it is not the proved pitch.
- The T3 bake is frozen by construction: it carries no `animate(dt)`, its wheel cannot turn and its
  occlusion is baked for one wheel orientation. That is the whole reason for the distance split.
- `captures/mill.png` (537 kB) and `captures/fox.png` (520 kB) are over the 400 kB line the earlier
  revision kept; they are shipped as captured, because re-encoding would invalidate the digests in
  `capture-log.json`.

# Rebuilt on kits — 2026-09-08

The village's buildings, props, planting and the moon deer's mesh were rebuilt on the shipped kit
blueprints in `examples/early-slice/kits/**` (36 module files, byte-identical copies of the
skill's `templates/kits/**`). Physics, colliders as a mechanism, support, locomotion, water, the workshop
cargo, the render loop and the post stack were not touched.

## What ran

```sh
pnpm test        # 152/152 pass, 0 fail, 0 skipped  (146 pre-existing + 6 new)
pnpm build       # exit 0
python3 ../../skills/3dviz-pro-max/scripts/capture.py --dir dist --all-views \
  --click "#village-door" --settle-ms 1400 --motion-check 2000 --expect-motion --out captures
# exit 0 - 8 views, 1 click, console_errors [], page_errors [], motion.differs true
node .local/support-parity.mjs   # 200 groundHeight/supportAt samples, before vs after
```

`--settle-ms 1400` is not decoration. The focus tween runs 0.9 s and `capture.py` settles 300 ms by
default, so at the default every named view is captured mid-tween; the first run of this pass
produced a "mill" frame that was still most of the island. The previously shipped captures used
1400 ms for the same reason.

## Before and after

| Measure | Before (revision 7) | After (revision 8) |
| --- | --- | --- |
| Node tests | 146 pass | 152 pass (146 unmodified + 6 new) |
| `index` chunk | 686.49 kB (gzip 180.83) | 740.88 kB (gzip 200.09), +7.9% |
| physics chunk | 2,854.92 kB | 2,854.92 kB, unchanged |
| Draw calls, overview | 1800 | 2902 (+61%) |
| Draw calls, fox | 1255 | 2029 (+62%) |
| Draw calls, mill | 1060 | 2075 — **not like-for-like**, the view was re-aimed at the wheel |
| Triangles, overview frame | not recorded for this view | 335,679 |
| Scene objects | 907 meshes + 5 InstancedMesh / 410 instances | 1368 meshes + 94 InstancedMesh / 1859 instances |
| Distinct materials | 169 | 314 |
| World colliders | 210 | 164 |
| `groundHeight`/`supportAt` | — | 0/200 sample differences |

The draw-call rise is the price of blueprint detail and is published rather than trimmed: a kit
tree is 8–13 meshes where the authored cone tree was 4, and `props/lantern-post` alone is 29. That
cost is why six of the seven pole lanterns stayed authored and only the bridge-head one is a
blueprint, and why the shore ring and the reed banks use the blueprints' `instancing` handles
instead of their groups.

## What was observed

Frames read at 1280×720 from `captures/`:

- **`mill.png`** — the mill close-up now carries a readable detail ladder. Silhouette: gable, tiled
  roof, and the wheel with its launder breaking the -X end. Medium: wheel rims and spokes, paddles,
  the timber frame's posts and braces, four recessed windows with sills, the launder trestle.
  Fine: iron rim straps, hub bolts, lapped tile courses with one slipped tile, sill drip lines, and
  a coopered barrel with four hoops beside the wall. Before the rebuild the same view showed the
  mill as one of five buildings across the island at roughly 300 px wide.
- **`overview.png`** — the island still reads as one composition: inn, mushroom cottage, tower,
  mill and glasshouse in the same places, at the same heights, with the same silhouette roles. The
  tower gained crenellations, string courses and a banner; the mill gained a storey; the glasshouse
  gained a striped market counter in front of its panes.
- **`fox.png`** — the follow camera holds the three-tail fox. The moon deer walks behind it on the
  `quadruped-walker` rig: split hooves, muzzle, ears and horns are all separable at this distance.
  The kit well, two barrels, the fence run and the reed clumps are in the same frame.
- No regression found in water (`.local/captures-after-full/pond.png` shows the pond and stream at
  the same level, with the same marks and ripples), in the cargo yard (`cargo.png` shows the crate
  in its reserved yard) or in creature routing: all four creatures roam, and the 60-second replay
  in `village-physics.test.js` passes unmodified.

## What was not observed

- No GPU, mobile or frame-rate check. Every number here is one SwiftShader reading.
- No before/after triangle comparison for the overview view: revision 7 recorded draw calls but not
  triangles for it.
- The pond, door and cargo frames were read once each from `.local/`; only the three shipped frames
  were worked over the checklists.
- Nothing here certifies that the blueprints are historically or botanically accurate. They are
  authored creative starting points, and this scene is a fictional miniature.

## Checklist results for this revision

`templates/checklists/visual-anti-slop.md` (16 items) and `inspection-per-frame.md` (13 items),
worked over `captures/{overview,mill,fox}.png` plus the click frame in `.local/`. Lighting, sky,
fog, post and camera were not touched by this pass, so the four toggle items are carried from
revision 7 and marked as carried rather than re-run — a carried pass is not a fresh observation.

| # | Anti-slop item | This revision |
| --- | --- | --- |
| 1 | no single PointLight key | carried from rev 7 (lighting untouched) |
| 2 | no untinted white ambient | carried from rev 7 |
| 3 | every light has a job | carried from rev 7 |
| 4 | one hero at highest contrast | pass — in `mill.png` the lit mill wall and wheel are the brightest area; the island behind sits lower |
| 5 | background never flat | pass — gradient sky, sampled top vs bottom differ (rev 7 measurement, sky unchanged) |
| 6 | fog with three depth layers | carried from rev 7; the three layers are visible in `overview.png` (near rocks, village, far treeline) |
| 7 | scale cue in frame | pass — the inn's 1.15 m door leaf, the well and the barrels are in `fox.png` and the click frame |
| 8 | at most three hue families + accent | pass — cool blue-green, warm ochre-timber, foliage green, turquoise water accent. The market canopy's red is the one new hue and it is inside the ochre family at reduced value |
| 9 | non-focal saturation capped | not re-measured this pass; the item's own ill-posedness (no lightness floor) is unchanged |
| 10 | bloom threshold ≥ 1.0, emissives above it | carried from rev 7; the kit lantern-post adds emissive glazing at intensity 1.7, which is above the threshold and is a practical, not a diffuse surface |
| 11 | camera not dead-centre at eye level | pass — every named view is a three-quarter with a raised eye |
| 12 | FOV in band | carried from rev 7 |
| 13 | three distinct roughness values | pass — 0.16 glass, 0.25 brass, 0.35–0.4 iron, 0.65 default, 0.78–0.94 timber and stone |
| 14 | no uniform grid, no identical clones | pass — the twelve trees are twelve seeds, the shore ring and reed banks carry per-instance rotation, scale and hue jitter, and the fence posts lean per instance |
| 15 | nothing frozen | pass — `--motion-check 2000 --expect-motion` exit 0, `differs: true` |
| 16 | detail ladder on the hero | pass — counts in [design-system.md](design-system.md#detail-ladder-self-check); the mill close-up carries 3 / 5 / 5 |

| # | Per-frame item | This revision |
| --- | --- | --- |
| 1 | console clean | pass — `console_errors: []`, `page_errors: []` |
| 2 | horizon or sky present | pass |
| 3 | three depth layers | pass in `overview.png` |
| 4 | hero highest contrast | pass in `mill.png` |
| 5 | labels readable at 1280×720 | pass — sidebar readouts read at 100% |
| 6 | no z-fighting | **not checked** — needs orbiting, and no orbit pass was run this revision |
| 7 | hero not clipped by the near plane | **not checked** at `minDistance` |
| 8 | nothing floats | pass with a caveat: the island itself is a deliberate floating diorama, and the shore boulders sit against its skirt, as they did before |
| 9 | scene is alive | pass — motion check, and all four creatures roam in the 60 s replay test |
| 10 | controls change visible state | pass — the door click frame shows the leaf swung out of a real opening and the button label flipped to "Close inn door" |
| 11 | reset restores the home view | not re-run this revision |
| 12 | reduced motion respected | not re-run this revision; the code path is unchanged |
| 13 | frame time noted | not measured — SwiftShader only |

## Decisions a reader should be able to challenge

- **The moon deer's rig is 1.7× the blueprint's default scale.** At the blueprint's own
  proportions the locked-stride envelope (1.0 m radius) could not route out of the pond meadow, and
  the creature stood still for the whole replay. At 1.7× the deer is the same 1.2 m tall it was
  before and roams 6.5 m in 30 s. The alternative was to revert the deer, per decision D-11.
- **The fox, dragon and owl keep their authored meshes.** `quadruped-walker` always builds horns,
  hooves and a single tail; a three-tailed spirit fox built from it would be a different animal.
  No blueprint covers a winged dragon or an owl.
- **`planVillage()` is unused.** A seeded plan sites its own plots, which would move every landmark
  that `village-picking.test.js`, the focus presets and the capture views name. Only the layout
  module's `nearestPathPoint` is used, to keep the flower drifts off the lanes.
- **Two crates, a well, a clothesline and a fence run were moved** from their first placements
  because they closed navigation gaps the fox and the dragon need. That is a real constraint of
  adding props to a scene whose routes are already tight, and it is why the props now sit inside
  the building solids they belong to.

# Atmosphere, instancing and picking — 2026-09-08

## What ran

| Check | Method | Result |
| --- | --- | --- |
| Unit tests | `pnpm test` (`node --test *.test.js`) | 33 pass, 0 fail (27 existing + 6 new in `village-picking.test.js`) |
| Production build | `pnpm build` | passed; `index-*.js` 686.70 kB (gzip 180.85 kB), CSS 5.03 kB, physics chunk `village-workshop-physics-*.js` 2,854.92 kB unchanged; Vite's >500 kB advisory still prints |
| Captures | `capture.py --dir dist --all-views --click "#village-door" --settle-ms 1400 --out captures` | 7 views + 1 click at 1280×720, `console_errors: []`, `page_errors: []`, `ready_timeout: false`, Playwright 1.62.0 |
| Viewer contract | Playwright `window.__viewer` probe | `views === ["overview","mill","pond","door","cargo","fox"]`; `setView("nope") === false`; `window.__sceneReady === true` |
| Tone map applied once | same probe, `window.__renderStats().toneMapping` | `0` (`NoToneMapping`) on the renderer, so the only tone map is the `ToneMappingEffect` at the end of the `EffectPass` |
| Tone map is correct | two builds of the same frame, stack on vs `post = null` | mid-scene patch luma: canvas centre 166.99 / 161.62 (+3.3%), island mid-left 167.29 / 164.09 (+2.0%), lower meadow 165.68 / 162.63 (+1.9%) — all inside the ±5% budget |
| Bloom has one source | disable-emissive rebuild (motes, lantern bulbs and window panes at `emissiveIntensity 0`) | no diffuse surface glows; lantern bulb core luma 206.0 → 170.8 and its 14–26 px halo 179.0 → 169.4 |
| Canvas picking | Playwright pointer probe on the built page | hover over the observatory sets `cursor: pointer` and draws the ground ring; click selects it (`aria-pressed` flips on landmark 1, description swaps); a 60 px drag selects nothing; a click on empty sky selects nothing and clears the cursor |
| Draw calls | `window.__renderStats()` with `renderer.info.autoReset = false` | overview 1800 calls / 289,271 triangles; mill 1060 / 172,207; fox 1255 / 209,653; 17 shader programs. Counts cover the shadow pass, the colour pass and the post passes of one composited frame |
| Scene composition | Node module probe | 907 individual meshes + 5 `InstancedMesh` covering 410 decorative instances (was 1,317 individual meshes); 169 distinct materials, 145 of them from the shared cache (was one material per mesh) |

## What was observed

All frames are **software-rendered** (headless Chromium on SwiftShader, 1280×720). Colours and
antialiasing on GPU hardware will differ; nothing here is a frame-rate or hardware claim.

- The background is a gradient in every frame that includes sky: deep `#1f2f45` at the top of the
  canvas through a `#b58c66` band at the horizon. Measured on `captures/overview.png`: zenith band
  mean luma 41.3, horizon band 156.8, buildings 145.8 with a maximum of 240.3, observatory 150.5.
  The brightest pixels in frame sit on lit village surfaces, not on the sky.
- Three depth layers read: near shore mean 143.9, buildings 145.8, far island rim 117.3. Lowering
  the density from 0.02 to 0.014 between builds moved the far rim and the horizon read and left the
  near field alone, which is the separation the fog is there for. A fog on/off A/B was not captured.
- The motes and lantern bulbs glow rather than reading as opaque balls; see the halo around the
  lantern bulb under the mill awning in `captures/mill.png`.
- `captures/mill.png` frames the waterwheel, hub, bearings and sluice at 4.7 m — the default
  300 ms capture settle was not enough for the 0.9 s focus tween, so captures use `--settle-ms 1400`.
- Clicking the mill from the sidebar or from the canvas focuses it; the recorded probe used the
  observatory because it is unambiguous at overview distance.
- `captures/fox.png`: the follow camera keeps the three-tail fox framed, but the moon deer walks
  through the same lane and overlaps it in this frame. Both creatures cast contact shadows.
- The scene badge and the drag hint fade out while a focus tween or a follow is running
  (`body[data-focus="true"]`) and fade back when the tween lands.

## Captures kept

| File | View | Size |
| --- | --- | --- |
| [captures/overview.png](captures/overview.png) | home view, whole island | 248 kB |
| [captures/mill.png](captures/mill.png) | Willow Watermill close view | 328 kB |
| [captures/fox.png](captures/fox.png) | follow camera on the three-tail fox | 316 kB |
| [captures/capture-log.json](captures/capture-log.json) | the full run: 7 views + 1 click, hashes, console log | 2 kB |

`capture-log.json` records all eight frames of the run. The other five (`default`, `pond`, `door`,
`cargo`, `click-0-village-door`) were inspected and then left in the ignored `.local/` directory
rather than committed.

## Checklist results

`templates/checklists/visual-anti-slop.md`, run on `captures/overview.png` and `captures/mill.png`:

| # | Item | Result |
| --- | --- | --- |
| 1 | No single PointLight as key | pass — key is a DirectionalLight; there are no PointLights |
| 2 | No untinted white ambient | pass — hemisphere `#d6ebff` / `#52615a` |
| 3 | Every light has a job | pass — key casts the shadows, hemisphere fills the north faces, fill separates the shaded side; the environment carries bounce |
| 4 | Hero at the highest contrast | pass with a caveat — the brightest pixels (240) are on lit village surfaces, but the horizon band's *mean* (157) is still 4% above the observatory's (151). Deliberate: a dusk band that dark enough to lose would stop reading as dusk |
| 5 | Background never flat | pass — 1×256 gradient plus fog |
| 6 | Fog with three depth layers | pass — 144 / 146 / 117 near / mid / far |
| 7 | A scale cue in frame | pass — the inn door leaf is a stated 1.03 m in the scene's own units and the yard crate a stated 0.44 m collider box; the island itself is a stated ±7.7 m miniature |
| 8 | At most three hue families plus an accent | pass — cool blue-green, warm ochre-timber, foliage green, plus turquoise water |
| 9 | Non-focal saturation ≤ 45% | **opt-out** — the pond and stream are `#167c88` (~70% S). Water is the accent this island is built around and it is focal in two of the six views; every other non-focal surface is under the cap |
| 10 | Bloom threshold ≥ 1.0 with emissives above it | pass — threshold 1.0, only motes and lantern bulbs above it, verified by the disable-emissive rebuild |
| 11 | Camera not dead-centre at eye level | pass — home view (15, 12, 17) m onto (0, 1, 0), a three-quarter down-angle |
| 12 | FOV 35–50° | pass — 39° |
| 13 | Three distinct roughness values | pass — 0.16, 0.25, 0.4, 0.58, 0.65, 0.82, 0.95 |
| 14 | No uniform grid, no identical clones | pass — every scatter carries per-instance rotation, scale and ±4% hue jitter |

`templates/checklists/inspection-per-frame.md`, run on all eight frames of the capture run:

| # | Item | Result |
| --- | --- | --- |
| 1 | Console clean | pass — `console_errors: []`, `page_errors: []` |
| 2 | Horizon or sky present | pass in overview / mill / door / fox; **not applicable** in pond and cargo, which are authored top-down inspection views with no sky in frame |
| 3 | Three depth layers | pass in the overview; the close views are deliberately two-layer |
| 4 | Hero highest contrast | pass — see item 4 above |
| 5 | Labels readable at 1280×720 | pass — the sidebar readouts and button labels were read at 100% |
| 6 | No z-fighting | pass — no flicker on the coplanar path/ribbon or the stream's polygon-offset surface |
| 7 | Hero not clipped by the near plane | pass — `OrbitControls.minDistance` 4 m clamps the focus tweens, near plane 0.1 m |
| 8 | Nothing floats | pass — every creature, building and scatter instance has a contact shadow |
| 9 | Controls change visible state | pass — the `#village-door` click frame shows the leaf swung open and the label flipped to "Close inn door" |
| 10 | Reset restores the home view | pass — `setView("overview")` returns to the framing of `overview.png` |
| 11 | Reduced motion respected | pass — `prefers-reduced-motion` starts the village paused; not re-captured in this pass |
| 12 | Frame time noted | **not measured** — software rendering makes any number here meaningless |

## Limits of this pass

- Software renderer only; no GPU, mobile or frame-rate claim.
- The draw-call numbers are a single reading per view on one machine, not a benchmark.
- The before/after comparison of the whole skill is not part of this pass.
- No new check of the physics, water or support behaviour: those tests were re-run unchanged and
  the atmosphere work does not touch their inputs.

# Updated demo validation — 2026-09-07

## Scene retirement — 2026-09-08

The matrix, cube and Object Lab scenes were removed from this slice by maintainer decision. Twelve files went with them: `cube-scene.js`, `cube-state.js`, `cube-playback.js`, `matrix-scene.js`, `matrix-model.js`, `matrix-playback.js`, `object-lab-scene.js`, `object-lab-model.js`, `object-lab-physics.js`, `models.test.js`, `playback.test.js` and `object-lab-physics.test.js`.

Current state, observed on 2026-09-08: `pnpm test` runs 27 Node tests, 27 pass, 0 fail; `pnpm build` passes. Only Latent Village remains, and `main.js` imports `village-scene.js` alone.

Every section below that mentions the matrix, the cube or the Object Lab is historical. Those observations were real when recorded but their artifacts no longer exist, so they cannot be reproduced. Their five passed `check-run` events were retired through correction events in `evidence/dataset-changes/early-slice-scene-retirement/`; no existing event line was rewritten.

## Current implementation checks

- 17 Node tests passed, including recorded-history solve, cancellation/reset, speed-change continuity, matrix playback and collision-aware village motion. Production build passed.
- Village regression reproduces the original owl/inn overlap near 18.02 seconds. A 60-second deterministic scene replay checks static collider clearance and sampled rendered bounds, proves each actor travels more than three world units, and checks zero-delta pause. Separate checks cover acceleration bounds and swept contact against a thin wall.
- Independent review repeated the tests and checked a 120-second authored-route replay without mutual creature-envelope overlap. This is an application correctness check, not a performance benchmark or exhaustive proof for future layouts.
- Parent Chrome observation: an 18-move Random scramble completed, Solve animated the recorded inverse and returned to visibly solved faces and the Solved status. Village overview renders distinct buildings, a transparent framed glasshouse, small articulated creatures, pond and bridge. Individual object framing remains subject to the selected camera view.
- Earlier parent browser observations established matrix Play progression, stopping at 1, and exact singular selection at 0.50. Next step now lands on the next quarter milestone. A camera adjustment frames the full family; final narrow-layout verification is still pending.

## Physical and visual limits

Environment collisions use conservative axis-aligned bounds derived from scene geometry. Creature envelopes include animated extremities and yaw. Hovering and ground support are authored controllers; no aerodynamic forces, deformable bodies or general rigid-body solver are claimed. Creature-to-creature separation is checked for the authored routes, not handled by dynamic contact. Abrupt new terrace routes need a swept support transition before being advertised as supported.

The model geometry retains detailed subparts at a smaller animal scale to fit the lanes. Landmark and inhabitant buttons allow close inspection. Decorative plants and light motes are non-solid. No mobile, frame-rate or host-install certification is claimed. Vite emits its bundle-size advisory; this is not a build failure.

## Historical first-slice observations

The following observations refer to the earlier artifact revision and do not supersede the updated checks above.

# Early-slice validation

Observed by implementation agent, 2026-09-07. Parent browser observations are attributed separately below.

| Check | Result | Evidence |
|---|---|---|
| Model tests | Passed, 9 tests | `pnpm test` in this directory |
| Production compilation | Passed | `pnpm build`; 13 modules transformed |
| Package installation | Passed | `pnpm install`; independent pnpm-lock.yaml |
| Actual browser render | Observed by parent at 1280×720 | Matrix, cube and corrected village observations below |
| Pause | Passed | Button changes to Resume motion; paused cube turn used for reset check |
| Orbit/zoom, narrow layout | Not checked | Requires further browser observation |
| Matrix slider and singular midpoint | Model passed; parent browser check passed | Parent observed t=0.50 and t=1 |
| Cube undo and reset during animation | Undo and reset of a paused in-progress turn observed | Reset cancels pending action and rebuilds exact solved pose |
| Primary sources | Read relevant passages | MIT lecture 20/30 transcripts; WCA 12a1 |

Tests cover six faces followed by their inverse and four repetitions, a mixed sequence with exact reverse, integer/bijective piece positions, a known R corner destination, and signed triple-product volume for t=0,0.25,0.5,0.75,1 (tolerance 1e-12). They do not claim all browser integration, arbitrary imported-state legality or solver correctness.

Build emits the standard bundle warning: one minified chunk is approximately 522 kB (133 kB gzip). This lightweight pilot includes Three.js eagerly. No performance testing was requested or run.

Run `pnpm dev` and use the URL Vite reports. The implementation session started at http://127.0.0.1:4174/ because 4173 was occupied. Hash routes are #village, #matrix and #cube.

The skill's proposed/source-checked/render-observed separation was useful. Tests are deliberately application-owned checks, not a certification of Three.js or cube group theory. No unresolved factual source questions; remaining browser gaps are described below.

## Parent browser observations

At 1280×720, parent observed matrix t=0.50 giving a plane and determinant 0; t=1 giving determinant -1.5 and reversed orientation. Parent observed cube R turning, overlapping turn buttons disabled, and Undo returning solved. Parent found oversized village bodies hiding their features; corrected scale overwrite in village-scene.js and rebuilt. Parent rechecked the corrected village: small creature forms and hearth are visible. Matrix Reset to identity returned the slider to 0, matrix to identity and determinant/volume to 1. With global pause active, an R turn entered Turning R with move buttons disabled; Reset cube returned Solved and re-enabled move buttons. Mobile is not yet tested. Sidebar has overflow:auto and remains scrollable when controls exceed the available height.

Explicit determinant source: [MIT 18.06 Lecture 20 transcript](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/650a197f93607b9751e0cc4b5a11b647_MIT18_06S10_L20.pdf), PDF pages 8–9 discusses absolute volume, handedness and rows/columns equivalence. This artifact's determinant claim is custom source-grounded work beyond a basis-only seed recipe.

## Object Lab: object construction and visible contact

Observed 2026-09-07 in desktop Chrome through native UI, with Three.js 0.180.0 and Rapier compat 0.20.0. The scene was added alongside the original examples to investigate the sanitized object-understanding feedback; it does not establish that every village object or knowledge record is now satisfactory.

- Render inspection showed separate timber slats, diagonal braces, dark straps, fasteners, a stamped plate and a seamed ball on a solid platform.
- Drop / reset produced an observed airborne frame (crate speed 2.29 m/s, height 2.53 m) and a later settled state near center height 0.70 m.
- The off-center Push action produced a visibly tilted crate and changed displacement/orientation. The initial weaker impulse was too subtle; the illustrative impulse was increased and re-observed.
- Show colliders displayed the actual enclosing box, sphere and floor shapes. The renderer uses exact solver poses while this overlay is enabled.
- Global pause held the accessibility-reported elapsed time at 79.3 seconds across observations. Drop / reset then resumed motion and reset elapsed time (observed 0.6 seconds after the action).
- The sequential integration test covers drop, ball rebound, settled floor contact, zero-delta pause, off-center angular response, reset, partial-step interpolation and actual friction parameter updates/rejection.
- Independent review found and resolved repeated debug-buffer allocation; the overlay now reuses its buffer and disposes it on capacity changes. Review also corrected a gear-ratio condition in the knowledge dataset.

Limits: illustrative SI parameters; one solid crate collider rather than board-level contacts; no fracture, deformable material or calibrated engineering model. Repeated pushes can leave the platform; reset restores bodies. No mobile-device or hosted-install check was performed. The Rapier lazy chunk triggers Vite's size advisory; this is a build warning, not a measured performance result. Native screenshots were inspected in-session, not saved as public demo assets. These observations are a bounded artifact check, not a model-quality benchmark.


## Latent Village: catalog application, 2026-09-07

Fresh implementation observations, separate from the historical prototype checks above. [Machine-readable checks and code fingerprints](village-validation.json). The [catalog walkthrough](../../evals/skill-behavior/village-application/README.md) is the preceding analysis, not runtime evidence.

Desktop Chrome headless rendered the local Vite app with SwiftShader at 1440×1000. The parent inspected overview, mill, opened door, cargo and fox frames. An additional 390×844 viewport showed a readable stacked layout and no horizontal document overflow. These are software-rendered browser observations, not hardware frame-rate or physical-device certification.

- The mill now exposes a detailed hub, fasteners, axle supports and sluice. At zero flow the observed output was 0.00 rad/s and sluice closed. Door opening revealed the recess through an actual split facade; the leaf remained on its hinge.
- Cargo was observed falling (3.43 m/s, 0.39 m above deck), then settled at 0.00 m/s near the deck. Nudge changed its motion; pause retained the same readout across observations. Reset restored 60% flow, 1.0 m release height, closed door and resting cargo. Numerical underside clearance accounts for box rotation; the rest predicate includes angular speed.
- Initial cargo/door camera frames were occluded. Dedicated directions resolved those inspections. Plant scatter was excluded from the delivery yard after flowers were seen intersecting its deck. Creature inspection now follows the selected resident; the fox stayed in frame after moving along its path. Manual orbit cancels following.
- All four scene switches loaded with the error panel hidden and no captured JavaScript exception. Other scenes' full interaction matrices were not re-observed in this pass.
- Sequential Node checks passed 32/32, including the retained 60-second creature roaming/static-clearance/envelope replay, support/step rejection, travel-driven gait, reset/pause, mechanics and actual Rapier contact/impulse configuration. Independent review added tipped-clearance and angular-rest regressions. Production build passed with the existing large-chunk advisory.

Limits: species geometry remains stylized procedural construction, without sculpted texture assets or full foot IK. Creature roots use authored locomotion and conservative static collision bounds; they are not mutually interacting rigid bodies. Mill flow is an authored control rather than CFD. Cargo uses one solid collider and illustrative parameters in a reserved yard. Bridge deck/approach support is tested, but end-to-end bridge crossing remains outside the verified route set. Screenshots and browser harness are local ignored files under `.local/latent-village/`; they are not published demo assets.


## Water surface correction (2026-09-07)

The preceding village pass missed water readability: testing flow phase and a wheel stop did not establish a readable, continuous lake. The old stream used a flattened tube with glossy partly metallic material, and moving marks sat above its surface. Its lit tube profile read as pale solid mass. Pond coverage existed in geometry; foliage, buildings and paths also occluded it, so the report does not claim every apparently empty pixel was missing water.

Replaced the stream with a stationary flat ribbon joining the persistent pond at a shared water level. Both use rougher nonmetal turquoise surfaces; thin, low-opacity marks and rings animate separately just above the surface. Dry-land plant scatter excludes the pond, and Inspect the pond exposes a dedicated high-angle view. Flow zero preserves the filled surface in this authored non-draining model.

The parent inspected actual 1440×1000 Chrome headless frames at zero and full flow: turquoise coverage remained, mill readouts were 0.00 and 0.90 rad/s, and small rings supplied motion without replacing the surface. The new regression raycasts pond interior, stream width and confluence while checking coverage across flow, pause and reset. Full sequential suite 33/33 and build passed. [Code fingerprints and observations](water-validation.jsonl). Local screenshots: `.local/latent-village/pond-zero.png`, `water-full.png`, `water-zero.png`. This is a stylized rendering fix, not a fluid solver.

Skill feedback is addressed in object reasoning and physical-interaction references. Three dataset revision proposals are saved with snapshots/hashes but remain unpromoted; canonical record/event counts are unchanged. Portable historical-revision provenance is tracked separately before promotion.


## Current control and render workload correction (2026-09-07)

User reported little visible slider response and excessive resource usage, then explicitly requested no headless checks. No browser rendering or performance benchmark was run for this correction.

The flow input previously changed model values without resuming global Pause. It now calls the same host resume action explicitly and is labeled Current strength, with an explanation that the percentage changes current/wheel speed rather than lake level. Surface marks have stronger local contrast while retaining the water footprint. Actual DOM-handler tests exercise zero/full input and reset against the scene's real models; perceived motion still needs the user's visual check.

The previous render callback drew continuously even during global Pause. A demand-driven RAF loop now stops after paused camera damping settles, suspends when the document is hidden, and invalidates for controls, input, resize and scene selection. Active drawing has a 60 fps ceiling, a 1.5 pixel-ratio cap and 1024px shadows. Static matrix/cube scenes expose whether playback needs animation. Static support XZ bounds skip impossible raycast candidates while preserving exact remaining queries; cached bounds must be rebuilt if those surfaces change.

Sequential Node suite 41/41 passed, including deterministic scheduler/paused-input and support-equivalence tests. Production build passed after the matrix/cube idle-state wiring. These checks establish configuration and behavior, not a measured CPU/GPU reduction or visual smoothness. Local HTTP reads found 4173 serving a different version; 4174 and 4175 served the current control fix. Use the URL printed by the intended dev server.

## Lightweight water detail (user visual review pending)

User confirmed the 4175 slider changes wheel speed but the surface still reads as flat color. Added shared 128×128 procedural color/normal textures, world-XZ alignment and periodic UV motion, keeping persistent coverage. Textures are generated once; no per-frame upload flag or extra reflection/refraction scene pass is added. The normal texture is disposed with scene materials. Build passes. No headless, browser render or hardware measurement was run; the user will assess actual appearance. See the appended revision 6 entry in [water evidence](water-validation.jsonl).

Focused texture/coverage/control tests passed 4/4: stable shared texture buffers and upload versions through flow/pause/reset, aligned confluence UVs and color/normal disposal signals. These are code checks, not an observed rendering pass.

## Object Lab playground upgrade — 2026-09-08

This pass upgrades the two-body study to 37 dynamic bodies: crate, ball, 21 tower blocks, 13 dominoes and a steel pendulum. Source inspection confirms a fixed 120 Hz step, eight solver iterations, CCD on dynamic bodies, a spherical pendulum joint and a rod collider. The rod collider stops 0.2 m below the anchor to clear the joint housing; the visible rod retains its full length. Main-body friction, rubber restitution, gravity and playback speed are exposed separately. Reset restores poses and simulated time while preserving these parameters.

The parent inspected the actual visible browser at `http://localhost:4176/#lab` through CUA. These are bounded observations of this artifact revision:

- Overview and close views showed arena construction and wood grain.
- Swing & smash displaced upper tower blocks; Start dominoes produced a cascade reaching the last domino.
- Mouse dragging lifted the crate, with an observed readout of 3.79 m/s and center height 1.01 m.
- Pause displayed Resume motion. Pressing Home on the playback slider set 0.10× and resumed motion.
- The narrow 625px layout was corrected to place the scene above the controls.
- Collider overlay was inspected against the bodies, floor and gantry in overview. Switching to the matrix and back restored the lab and default controls.
- From Pause, setting gravity to zero and increasing friction to 0.70 each resumed motion.
- Read-only review found and resolved a narrow-screen camera-distance clamp and a stale drag-tether endpoint; final production build passed.

Production build passed. All 49 Node tests passed sequentially with `pnpm exec node --test --test-concurrency=1 *.test.js`. These are application checks, not solver certification, scientific material calibration or measured performance. The build retains its large-chunk advisory.

Limits: friction changes each dynamic body's main collider, not the pendulum rod's secondary collider; the floor stays at 0.65. Crate boards share one enclosing collider. Dragging is a bounded spring force at the center of mass, not a hand joint or board-level contact. Rubber restitution combines with its contact partner. No deformation, fracture or aerodynamic model is implemented; low retaining walls do not guarantee containment under repeated strong impulses. Wide/desktop layout and interactions beyond those listed were not freshly browser-verified in this pass. Older Object Lab observations above belong to their earlier revision and do not establish these unrun checks.

## Character scene removal — 2026-09-08

Removed the rejected character scene, its dedicated models, test and study document. Production build passes and includes no character-scene chunk. Remaining tests pass 48/48 sequentially; public documentation links and JSON examples pass. Visible-browser inspection confirms exactly four scene buttons and a loaded Object Lab.
