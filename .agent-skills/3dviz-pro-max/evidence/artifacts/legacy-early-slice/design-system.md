# Small Worlds: design system

## Look statement

- **Feeling:** gentle, unhurried, expectant — a miniature at the last warm minute of the day.
- **Time of day / setting:** late dusk over a fictional river island; the sun sits low behind the
  inn, the practicals have just been lit.
- **References:** the paper-lantern hour on a river town quay; a lit architectural model under
  workshop lights; hand-painted tin-toy villages.
- **Palette:** `#1f2f45` sky zenith · `#b58c66` horizon band and fog · `#769174` island meadow ·
  `#f3d4a0` plaster and cream walls · `#674838` timber · `#167c88` water (accent) ·
  `#ffda85` mote and lantern emissive (the only surfaces above the bloom threshold).
- **Key light:** warm `#ffe2bb` DirectionalLight, intensity 2.2, from behind the inn at roughly
  −4 / 9 / 6 m; cool `#d6ebff`→`#52615a` hemisphere at 1.05 and a `#9bbaff` fill at 0.85.
- **Camera:** 39° FOV, home view at (15, 12, 17) m looking at (0, 1, 0); orbit 4–40 m,
  max polar 86°. Focus views tween over 0.9 s; the creature view follows its actor.
- **Signature technique:** every practical (7 lantern bulbs, 15 drifting motes) is authored above
  the 1.0 linear bloom threshold and nothing else is, so the glow marks exactly what is lit.
- **Deliberately absent from this look:** no reflection or refraction pass on the water, no depth
  of field, no night-time relight. A miniature the viewer orbits freely has no single focal plane
  to defend, and a diorama that goes dark stops being inspectable. Both are available as *other*
  looks the page can be asked for — see [Catalog looks](#catalog-looks-2026-09-09) — but this is
  the look every committed capture and every showcase frame is composed under.

Source records: `knowledge.style-lantern-festival-riverside` (gradient sky, fog = horizon band,
bloom 1.0 / 0.35 / 0.6, ACESFilmic, camera band), `knowledge.lighting-mood-dusk-golden-hour`
(warm low key against a cool fill, RoomEnvironment at low intensity), plus the records already
listed in [scene-spec.json](scene-spec.json).
Departures from their `defaults.values`:

| Record value | Shipped | Why |
| --- | --- | --- |
| fog density 0.045 | **0.014** | Those records describe a 1:1 river town. This island is ±7.7 m and the home camera sits 25 m out, where 0.045 leaves only 28% transmittance — the whole village would be haze. 0.014 gives 94% at the 18 m near shore and 81% at the 33 m far rim. |
| environment intensity 0.25 | **0.30** | The scene has no sky dome, so the RoomEnvironment carries all of the bounce that the retired hemisphere intensity used to fake. |
| exposure 0.9 | **1.15** | Key, hemisphere and fill were all lowered (3→2.2, 2→1.05, 1.7→0.85) to hold every diffuse surface under the 1.0 bloom threshold; exposure buys the value back after the tone map. |
| sky horizon `#f2a55c` / `#5a4b7a` | **`#b58c66`** | Measured on the shipped 1280×720 overview: the record's brighter band read at mean luma 177 against 151 for the buildings, i.e. the background outshone the hero. `#b58c66` puts the band at 157 and the tower at 151, with the frame's brightest pixels (240) on lit village surfaces. |

## Atmosphere and post

`scene.background` is a 1×256 vertical `CanvasTexture` gradient (`#1f2f45` → `#b58c66`,
`SRGBColorSpace`); the renderer no longer requests an alpha buffer, and the CSS radial gradient
behind the canvas stays only as a pre-paint fallback. `scene.fog = FogExp2(#b58c66, 0.014)` —
the same colour as the horizon band, so the far rim dissolves into it instead of stacking against
it. `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` supplies `scene.environment` at
`environmentIntensity 0.3`.

Post is pmndrs `postprocessing` 6.39.4, wired through a copy of the skill's
`templates/rigs/post-stack.js` kept next to the scene as [post-stack.js](post-stack.js):
`BloomEffect` (`luminanceThreshold 1.0`, `intensity 0.35`, `radius 0.6`, `mipmapBlur`),
`VignetteEffect` (offset 0.35, darkness 0.22), then a `ToneMappingEffect`
(`ToneMappingMode.ACES_FILMIC`) last in one merged `EffectPass`.

The tone map lives in the stack because three only applies `renderer.toneMapping` to frames drawn
straight to the canvas (`WebGLRenderer` forces `NoToneMapping` whenever
`_currentRenderTarget !== null`), and every composer pass draws into a render target. So
`renderer.toneMapping` is set to `NoToneMapping` while the stack is alive and exposure rides on
`renderer.toneMappingExposure`, which the renderer uploads to the effect shader through three's
`<tonemapping_pars_fragment>`. Measured on two builds of the same frame (stack on vs stack off,
see [validation-report.md](validation-report.md)) three mid-scene patches matched within
1.9–3.3%. One known difference: an sRGB `scene.background` is `toneMapped = false` on the canvas
path but *is* tone mapped inside the composer, so the sky reads about 11% deeper with the stack on.
That is the version the palette above was tuned against.

Only the 15 motes (`emissiveIntensity 2`) and the 7 lantern bulbs (`emissiveIntensity 1.4`) are
authored above the threshold. With both set to 0 and rebuilt, no diffuse surface glows and the
lantern silhouettes go crisp: bulb core luma falls 206 → 171 and its 14–26 px halo 179 → 169.

## Palette actually used

| Hex | Role | Where |
| --- | --- | --- |
| `#1f2f45` | sky zenith, deepest value | gradient background |
| `#b58c66` | horizon band, fog | gradient background, `FogExp2` |
| `#52696a` / `#3c515b` | island body, under-terrace | landscape cylinders |
| `#769174` | meadow surface | island cap |
| `#d4b992` / `#b0a390` | path ribbon / instanced pavers | walking paths |
| `#f3d4a0` | plaster and cream walls | inn, mill, glasshouse |
| `#674838` | timber frames, beams | every building |
| `#a8a7ad` | dressed stone | plinths, sills, tower courses |
| `#577f7b` / `#b36563` / `#c96567` / `#93c5b8` | inn / mill / mushroom / glasshouse roofs | one hue per building so the silhouettes read apart |
| `#3e7467`–`#94ae83` | conifer and broadleaf foliage | trees, instanced blades |
| `#167c88` | water (accent, the only high-saturation family) | pond and stream |
| `#ffd798` + emissive `#ffbe6a` | lantern practicals | 7 lantern arms |
| `#ffda85` + emissive `#ffb459` | drifting motes | 15 motes |
| `#ffd9a8` | hover ring | picking affordance |

Three hue families (cool blue-green, warm ochre-timber, foliage green) plus the turquoise water as
the single accent. Roughness spans 0.16 (glass roof) · 0.25 (telescope brass) · 0.38–0.4 (door
hinges, bearings) · 0.58 (water) · 0.65 (default) · 0.82 (building boxes) · 0.95 (yard deck).

## Instancing and shared materials

There is exactly **one** material cache on the page and it lives in `kits/kit-core.js`.
`scene-kit.js` is an adapter over it (`materialFor` → `kit-core.materialFor`), so a look the
village authors by hand and the same look inside a blueprint are one material. Options that
kit-core's key does not describe — `map`/`normalMap` (village-water animates its own UV offsets),
`transparent`/`opacity` (the glasshouse panes) — are one-off materials by construction.
`dispose()` frees geometry, textures and those one-offs, and deliberately leaves cache entries
alive: they are owned by the cache, not by the group being torn down, so the next scene is handed
a live material rather than a disposed one. Callers must still pass differences as options —
mutating `obj.material` leaks into every mesh sharing that look.

Decorative repeats are `InstancedMesh` throughout: six fields the village drives itself (52 shore
boulders on `nature/rock-cluster`'s shape, 224 path pavers, 68 reed blades on `nature/reeds`'s
blade, 24 grass blades, 49 flower stems, 49 petals = 466 instances) plus 70 more inside the
blueprints themselves (roof tile courses, fence rails, barrel staves, crate planks, tree canopies)
carrying about 1 236 instances. Placement jitter is mulberry32 with a fixed seed, so two builds
draw the same frame. Colliders, `groundHeight` and `supportAt` are unaffected by any scatter: a
200-sample before/after harness over the island returned identical support results after the
rebuild (`0/200` differences).

## Interaction map

| Control | Selector | Changes | Visible confirmation |
| --- | --- | --- | --- |
| Click a building or creature on the canvas | `#world` | camera focus + sidebar selection | hover ring and pointer cursor, then the tween and `aria-pressed=true` on the matching sidebar button |
| Inspect the mill / pond | `#village-mill`, `#village-pond` | named view | 0.9 s camera tween |
| Open inn door | `#village-door` | door state + view | leaf swings, label flips to "Close inn door" |
| Pause motion | `#pause` | ambient motion | label flips, motes and wheel stop |
| Reset view | `#camera-reset` | camera | returns to the home overview |

A pointer that travels more than 5 px between `pointerdown` and `pointerup` is an orbit, not a
selection: `OrbitControls` claims the pointer down and clears any running focus there, so the
picker can only decide on the way up. While a focus tween or a follow is active,
`body[data-focus="true"]` fades the scene badge and the drag hint out of the frame.

An editorial field guide with one local scene. The audience is curious adults; the scene offers clear, discoverable activities. This is pilot evidence for a draft skill, not a showcase of catalog breadth.

## Shared visual language

Midnight blue surrounds a warm editorial sidebar. Georgia headlines give each subject a chapter-like introduction; compact system sans-serif controls remain practical. Desaturated coral, mint, lilac and honey tie the models together without giving each scene the same silhouette. Soft directional lighting and a fixed initial three-quarter camera make spatial relationships readable. Orbit and zoom are available; reset view restores a deliberate composition. On narrow screens, the canvas moves above the controls.

## Composition

**Latent Village:** layered rocky island with timber inn, copper-domed observatory, working watermill, mushroom cottage and transparent glasshouse. Roof courses, masonry seams, window frames, benches and herbs reward close inspection. Four distinct articulated animals use conservative environment collision volumes; focus buttons expose both architecture and creatures. Motion is controlled locomotion, not an aerodynamic or ecological simulation.

## Interaction and accessibility

Native buttons and labeled sliders support keyboard use. Buttons have visible focus rings; labels and numerical text supplement color. Ambient motion can pause, and reduced-motion starts the village still and shortens user-triggered turns. Global pause freezes all scene animation, while orbit and focus navigation remain usable. An explicit play/turn action resumes motion; reset cancels pending work without requiring a resume. The canvas has an accessible name but is not a full nonvisual equivalent of the scene. Mobile layout and rendered label occlusion require browser observation.

## Grounding and runtime

Three.js and Vite run locally with pnpm; assets are procedural, with no remote fonts or model downloads at runtime. Pixel ratio is capped at 1.5. Sources and their exact claim scope are in scene-spec.json. Current records were not selected from an established catalog: this custom pilot was built while the standalone entry and references were being drafted.

Draft skill guidance that helped: separate factual research from rendered verification; authoritative puzzle state; singular matrices as valid inputs; conditional design synthesis. Mandatory comprehensive entity inventories or source fields for the fictional village would add work without improving this artifact. Three concise claim mappings suffice here.

## Retired scenes (historical)

The matrix deformation, the 3×3 face-turn cube and the Object Lab were removed on 2026-09-08 by maintainer decision; their design notes and their recorded observations remain only in the [validation report](validation-report.md).

## Latent Village catalog application (2026-09-07)

Object construction drives the refinement: mill hub/axle/bearings and sluice are connected moving parts; the inn door rotates about its jamb within a real opening. The cargo has slats, braces, straps and fasteners with a declared enclosing collider. Species silhouettes remain; actual travel drives gait, bounded heading changes and neutral resting poses. Roads have a flat walking ribbon and bevelled shoulders.

Dedicated inspection angles keep the mill, door and cargo readable after arbitrary orbiting. Cargo uses a high view to clear surrounding foliage. Numerical cargo height measures the rotated box underside above the platform, and rest includes angular speed. Decorative plant scatter excludes the yard. Material choices remain stylized procedural colors/roughness rather than authored texture maps.

Water appearance uses a persistent pond and flat stream surface at a shared authored level, with restrained translucent marks above it. Flow affects cue phase and mill response, not stored coverage. Inspect the pond provides an independent shoreline/coverage view.

Current strength is a normalized authored setting, not measured discharge or pond volume. Its control explains this scope and resumes motion when edited, including from Pause. Small water marks have increased contrast without changing the filled surface. Hidden documents stop animation scheduling; paused views render only on changes until camera damping settles. Static XZ bounds filter impossible terrain raycast candidates before exact support checks.

Water surface detail uses two shared 128×128 periodic textures: a restrained color pattern and a subtle normal map. Both are generated once per village instance, aligned in world XZ across pond/stream, and animated by UV offsets only. Mipmaps limit distant pattern shimmer. The existing flat filled geometry remains unchanged; there are no reflection render targets, refraction passes, fluid solvers or per-frame texture uploads. Visual acceptance of this refinement is left to the user; no headless render was requested or run.

## Built on the kit blueprints (2026-09-08)

Every building, prop and plant is now assembled from `examples/early-slice/kits/**`, whose 36
module files are byte-identical copies of the skill's `templates/kits/` (`diff -rq` reports only
the README, the proof harness and the Blender script as skill-only). What comes from where:

| Landmark | Blueprints used | Authored here, and why |
| --- | --- | --- |
| Copper Kettle Inn | `kit-core.wallWithOpenings`, `primitives/{inset-window, timber-frame, roof-tile-strip, chimney, sign}` | the hinged leaf (`inn-door-pivot`), because `door-with-step` welds its leaf into the opening and this is the one door a control opens; the porch posts and the copper lantern |
| Moonwatch Observatory | `buildings/round-tower` | the brass telescope, its mount and the finial: the blueprint has no instrument |
| Willow Watermill | `buildings/watermill` (scaled 0.42, yawed 180° so the wheel faces the stream and the mill view) | the sluice gate assembly and the axle drive key — a driven gate is not in the blueprint |
| Morel Cottage | `primitives/{door-with-step, inset-window}` | the whole fruiting body: stalk, cap, gill ring and spots. No blueprint models a mushroom |
| Sunleaf Glasshouse | `buildings/market-stall` | the glazed shell, its frame bars and the herb beds: transparent panes are not in the catalogue |
| Island planting | `nature/{tree-round, tree-conifer, rock-cluster, reeds}` | the flower drifts and path pavers keep their authored scatter: no blueprint covers them |
| Yard props | `props/{barrel, crate, well, fence-run, clothesline, lantern-post}` | the seven pole lanterns stay authored — `lantern-post` costs 29 draw calls each, and one of them, at the bridge head, is enough to prove the blueprint |
| Moon deer | `creatures/quadruped-walker` | posed by `village-locomotion.js`; see below |

Three blueprint contracts are used as contracts, not as decoration:

- **Sockets.** The mill's wheel hub is found at the blueprint's `wheel` socket and re-hung under a
  pivot this scene turns. The kit's own `animate(dt)` is never called: the flow control is the one
  driver, and two drivers on one wheel is the bug that rule exists to prevent.
- **Colliders.** The observatory, mill and glasshouse solids come from each blueprint's
  `colliders` descriptors, not from its render bounds — a launder over a wheel or a canopy over a
  counter is not something to walk into. The result is 164 world boxes where the hand-built scene
  had 210, and the mill's solid is 11% smaller than the box its meshes occupy.
- **Instancing.** `nature/*` `instancing` handles plant the shore ring and the reed banks from one
  draw call each. They are *not* used for single trees: a lobe has to sit on its own branch, and
  the twelve trees are twelve seeded blueprint instances instead.

The three-tail fox, the dragon and the owl stay authored. `quadruped-walker` always builds horns,
hooves and one tail, so it cannot represent a three-tailed spirit fox without misdescribing it,
and no blueprint covers a winged dragon or an owl.

### Detail-ladder self-check

Counted off `captures/`, per band, at the framing the capture actually publishes. A count is what
is separable in that frame; where the frame shows a rhythm rather than countable items (paddles,
merlons) the number is the blueprint parameter and is marked as such.

| Hero | Silhouette | Medium | Fine |
| --- | --- | --- | --- |
| Willow Watermill (`mill.png`, close view) | gable + tiled roof + the wheel and launder breaking the -X end | 5 features: rims and spokes, paddles (14 by parameter), timber frame with braces, four recessed windows with sills, launder trestle | 5 features: iron rim straps, hub bolts, roof course laps and one slipped tile, sill drip lines, the barrel's four hoops and rivets |
| Copper Kettle Inn (`overview.png`, `fox.png`) | steep gable, chimney above the ridge, porch breaking the eave line | 5 features: exposed frame posts and braces, recessed windows, hanging sign on its bracket, porch tile courses, plank door with strap hinges | 4 features: peg heads on the frame, door plank gaps and ring handle, sign eye hooks, lantern glazing |
| Moonwatch Observatory (`overview.png`, `mill.png`) | battered shaft, crenellated crown, cone cap with a banner, outside stair | 4 features: merlon rhythm (12 by parameter), corbel ring, string courses, arrow slits on their spiral | 3 features: chamfered merlon caps, worn tread nosings, the telescope's three-legged mount |

The mill close-up is the frame that carries the ladder; the observatory's fine band is read at
overview distance and is honestly at the edge of legibility there.

## Quality brief (2026-09-09)

This is section 5 of the skill's `templates/docs/design-system.md` shape, filled in from
`python3 ../../skills/3dviz-pro-max/scripts/host-probe.py` and from what the village
actually builds. Tier names are the kit contract's: T0 blockout proxy, T1 module, T2 module plus
procedural surface and baked occlusion, T3 Blender-baked GLB, T4 external asset.

- **Delivery target:** web-desktop. One page, one scene, orbit between 4 m and 40 m, 1280×720 at a
  1.5 pixel-ratio cap.
- **Host ceiling:** T3 — "Blender 5.2.1 >= 4.2 found via standard install path + --version"
  (probe on Apple M4 Max, 40 GPU cores, 48 GB, macOS 26.5.1, Node 24.13.1, Chromium installed).
- **Capture mode:** gpu — `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)`,
  as recorded in `captures/capture-log.json`. Every earlier revision of this example was captured
  in SwiftShader, so the shipped frames changed renderer in this revision as well as tier.

| Object | Role | Recommended | Built at | Why it departs |
| --- | --- | --- | --- | --- |
| Willow Watermill (body) | hero | T3 | **T2 to 9.49 m, then T3** | the bake is frozen and this wheel is the scene's one mechanism, so the baked hero draws only past the distance where a turning wheel is legible |
| Willow Watermill (sluice, axle) | hero control | T2 | T2, outside the LOD | a control that vanishes at 10 m is a bug; these are authored and have no blueprint |
| Copper Kettle Inn | hero | T3 | T2 | no hero is baked for it: it is assembled from seven primitives, not from one blueprint |
| Moonwatch Observatory | mid ground | T2 | T2 | — |
| Morel Cottage | mid ground | T2 | T2 | — |
| Sunleaf Glasshouse | mid ground | T2 | T2 | — |
| Well, 4 barrels, 2 crates, clothesline, lantern post | mid-ground props | T2 | T2 | — |
| Fence run | background | T1, instanced | T1 | — |
| 12 trees | background | T1, instanced | T1, one module each | the `instancing` handle carries one canopy lobe, not a tree; planting a wood from it means authoring a trunk, which is what the kit rebuild removed |
| Shore ring, reed banks, pavers, flower drifts, grass | background | T1, instanced | T1, `InstancedMesh` | — |
| Creatures | mid ground | T1 | T1 | `creatures/*` records declare no T2 families; the fox, dragon and owl are authored here |
| Every landmark's blockout | layout | T0 | T0, past the orbit ceiling | a grey box inside 40 m would be in a shipped frame; see below |

**Where a tier switches.** Only the five landmarks are wrapped in a `THREE.LOD` (`lodFor`), with
hysteresis 0.08. Distances are the proof logs' own framing ratios — `far = 2.4 ×`, `mid = 1.2 ×`,
`close = 0.78 ×` the frame-filling fit distance, and `fit = 2.92 ×` the bounding-sphere radius,
which reproduces `view_distances_m` in both hero proof logs to under 1 %. They are re-derived from
what this village built rather than copied in metres, because every kit here is scaled to doll
size (the mill is 0.42):

| Landmark | fit | close | mid | far | Levels actually used |
| --- | --- | --- | --- | --- | --- |
| Copper Kettle Inn | 9.49 m | 7.40 | 11.39 | 22.78 | T2 at 0 m, T0 at 41 m |
| Moonwatch Observatory | 11.76 m | 9.17 | 14.11 | 28.23 | T2 at 0 m, T0 at 41 m |
| Willow Watermill | 7.91 m | 6.17 | 9.49 | 18.98 | T2 at 0 m, **T3 at 9.49 m**, T0 at 41 m |
| Morel Cottage | 7.15 m | 5.57 | 8.58 | 17.15 | T2 at 0 m, T0 at 41 m |
| Sunleaf Glasshouse | 6.90 m | 5.38 | 8.28 | 16.56 | T2 at 0 m, T0 at 41 m |

Three departures, each deliberate:

1. **No T1 level between T2 and T0.** A scene drops T2 when its tiles stop resolving. They do not
   here: at the 40 m orbit ceiling one metre is 25 px (720 px / 2·tan 19.5°), so the inn's 1.2 m
   plaster tile is 30 px and the mill's 0.15 m tile (0.35 m at 0.42 scale) is 3.8 px. A T1 copy
   would double the build, add a visible pop and remove no draw call — T1 and T2 are the same
   meshes. T1 is still a live path: it is what the village builds on a host with no 2D canvas
   (every Node test runs there), and `window.__viewer.tiers()` reports which tier was built.
2. **T0 is clamped past the orbit ceiling** (41 m) instead of switching at `far`. At the home view
   a landmark is 90 px tall; a blockout at 90 px is a broken frame, not an optimisation. The
   proxies exist for layout, collision budgeting and as the LOD's honest floor, and are drawn only
   behind the `?level=N` debug flag (`?level=1` on a two-level landmark shows its box).
3. **The baked hero is not the nearest level.** Stated above; it is the only way to keep both the
   T3 surface at the home view and the driven wheel at the mill view.

**Surface settings.** `seed 1, size 512, anisotropy 4, ao {samples 6, radius 0.45 m, ground dirt
0.6 m}`. The records' own proofs use `size 1024` and `samples 13`; this village builds fourteen
objects at page load rather than one, and the occlusion bake is the whole cost of T2 here — 3.65 s
across the five landmarks at 13 samples, 1.70 s at 6, of a 2.37 s page-to-first-frame total
(0.45 s with the same build forced to T1).

Since 2026-09-09 that bake is **paid once per build, not once per load**: `village-ao-cache.js`
stores the baked shade (one byte per vertex, ~101 kB for the whole village) in `localStorage`,
keyed by module id, params, tier, surface settings and a signature of the geometry itself, so an
edited kit re-bakes and a reload does not. Cold 2.44 s, warm **0.48–0.54 s**. That is also why
`samples 6` is now a smaller compromise than it was: raising it costs a first visit, not every
visit — but the departure stands until someone re-measures 13 samples against the frame.

**To go one tier higher:** a Blender bake for the inn, the observatory, the cottage and the
glasshouse. Two of those are assembled from primitives and one is authored geometry, so each would
need a blueprint of its own first. T4 is out of scope: nothing here fetches a remote asset.

**Not wrapped in a LOD:** every `InstancedMesh` field (shore ring, reed banks, path pavers, flower
drifts, grass, and the instanced rows inside the blueprints). One `InstancedMesh` is one draw call
at any count; a LOD per repeat would add a per-frame update and remove no draw.


## Catalog looks (2026-09-09)

The village wears one look at a time, chosen at page load: `?look=<id>` takes any entry below,
`?mood=<id>` takes only the ones whose source record is a lighting mood, and both accept the full
record id as well as the short one (`?look=knowledge.style-tilt-shift-diorama`). An unknown id
warns in the console and falls back to `dusk-golden-hour`, so a capture with a typo in it still
produces a frame and still says which frame it produced. The chosen look is in the tab title, in
`window.__viewer.stats().look` and in `window.__viewer.look()`.

A look owns **sky, fog, environment, lights, tone mapping, post and (only for tilt-shift) the
lens**. It owns no geometry and no material: a record's cloud cards, wet-quay puddle mask or
moulded-plastic clearcoat are modelling work, and the quality tiers above are unaffected.

| `?look=` | Record(s) | What arrives | Frame |
| --- | --- | --- | --- |
| `dusk-golden-hour` *(default)* | `knowledge.style-lantern-festival-riverside` + `knowledge.lighting-mood-dusk-golden-hour` | the look at the top of this document: warm 51° key, cool fill, `#b58c66` horizon and fog, exposure 1.15, bloom 1.0/0.35/0.6 | [captures/overview.png](captures/overview.png) |
| `ghibli` | `knowledge.style-ghibli-painterly-pastoral` | painted blue sky `#2f5f9e`→`#cfe3ef`, 52° `#fff2d8` key at 3.0 against a `#8fb8e0`/`#6b6a45` hemisphere at 0.9 (the record's 3.5:1, blue-filled shadows), fog 0.012, bloom 1.1/0.15 | [captures/look-ghibli.png](captures/look-ghibli.png) |
| `tilt-shift` | `knowledge.style-tilt-shift-diorama` | 22° telephoto, no fog at all, hard 58° `#fff6e2` key at 3.4 with a 2048 shadow map, and a `DepthOfFieldEffect` band that tracks the orbit target (range 5% of the focus distance, bokeh 4) | [captures/look-tilt-shift.png](captures/look-tilt-shift.png) |
| `night-lantern` | `knowledge.lighting-mood-night-lantern` (+ the festival style's light cap) | no sun: a 0.15 `#9fb4ff` moon, a 0.12 hemisphere, no environment, and a `#ffb46b` PointLight in each of the seven lantern heads; fog `#0b1526`, bloom threshold 0.9 so only the sources glow | [captures/look-night.png](captures/look-night.png) |
| `overcast` | `knowledge.lighting-mood-overcast-soft` | the cloud deck is the whole source: `#cfd8e6`/`#6a6f66` hemisphere at 1.2, a 0.6 directional *hint* with `castShadow` off, exposure 1.0, bloom 1.2/0.1 | [captures/look-overcast.png](captures/look-overcast.png) |

Every entry lives in [village-look-table.js](village-look-table.js) with its record ids and, in
`departures`, one line per number that is not the record's and why. Three departures are shared by
all five and are stated once at the top of that file: shadows keep the village's own ±13 m camera,
light directions are placed from the records' elevation/azimuth on a sphere around the island, and
no look touches geometry or materials. The largest per-look departures:

- **tilt-shift** scales every orbit distance by `tan(39°/2) / tan(22°/2) = 1.822`, so the record's
  telephoto arrives without recomposing the frame. LOD switch distances are scaled by the same
  factor, because a LOD switches on distance while what it is really keyed to is apparent size —
  without that the shipped 26 m overview lands past the 41 m T0 clamp and the frame is a field of
  blockout proxies (it was, once). The record's +18% saturation grade is **not** applied: this
  stack has no grade pass.
- **night-lantern** runs its practicals at 19 cd over 3.4 m rather than the record's 60 cd
  uncut, because the village's lantern heads hang at 1.36 m and not at the record's 2.4 m:
  `60 / 2.4² = 19 / 1.36²` is the same pool illuminance at the lamp's own height, and the 3.4 m
  range is the festival record's 6 m scaled by the same ratio. Uncut, seven pools over a 13 m
  island merge into one flat wash and the record's "space between lanterns falls away into tinted
  darkness" is lost.
- **night-lantern** and **overcast** both use less fog than their records (0.03 against 0.05,
  0.012 against 0.035). Both were captured at the record value first; the numbers are written for
  scenes the size of the records' own 12–25 m shadow extents, and at a 26 m orbit over a 26 m
  island they dissolve the far half of the composition.

**Adding a look** is a data change: copy a record's `defaults.values` into a new entry in
`village-look-table.js`, name the record in `records`, put every number you retune into
`departures` with its reason, and the table tests will check the record exists and that the entry
is complete.
