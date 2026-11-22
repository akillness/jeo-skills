# Kits — reusable blueprint modules

## Scope: reusable construction, not an art ceiling

Use a kit when its geometry and behavior fit the intended object. Adapt it or use custom/sourced
geometry when another route fits better. Reusing a low-level operation does not require reusing its
finished shape. Hero/background roles and Blender availability do not decide the construction route.

The T0–T4 labels below describe this library's pipelines and recorded proofs. They do not rank all
3D art, measure anatomical accuracy, or constrain what the agent can build outside the kit library.
An unproved kit tier must not be claimed as proved; another construction method remains available.
Visual quality is inspected at the actual delivery scale, independently of the pipeline label.


A **blueprint** is three things that must agree: a catalog record, a module in this folder, and a
proof made of real captures. Find the ones that fit the look you already chose:

```sh
python3 scripts/design-context.py "<objective>" --blueprints --look knowledge.style-hand-painted
python3 scripts/resolve.py knowledge.blueprint-timber-cottage
```

`--blueprints` filters on each record's `fits_looks` and returns the whole compatible set sorted by
id — a filter, not a ranking, so nothing here is scored. `resolve.py` then prints the asset path,
the tunable parameters, the socket names and a starting snippet. This folder holds the modules
themselves.

These are authored creative starting points, not measured buildings, plants or creatures. Nothing
here certifies historical construction, botanical accuracy or structural behaviour.

## Layout

```text
kit-core.js         shared helpers: material cache, seeded RNG, bevelled box, inset panel,
                    pierced wall, instanced scatter, socket / collider descriptors
kit-walk.js         gait maths shared by the walkers, re-exported through kit-core.js
_harness/           the offline proof page (index.html, main.js, blueprint-views.js,
                    viewer-contract.js)
primitives/         9 composition parts consumed by buildings — no records
buildings/          6 building blueprints          props/     8 prop blueprints
nature/             4 plant and rock blueprints    creatures/ 2 walking figures
layout/             village-layout.js — plans lanes, plots and scatter zones; no record
gltf/               2 Blender-authored GLB heroes and their loader wrappers
blender/            export-village-assets.py — the bpy script both GLBs come out of
```

## Using a kit in your scene

Copy `kit-core.js`, `kit-walk.js` and the module you want **out of the skill folder** into your
project — the same rule as the rigs and the scaffold — keeping the relative path between them
(`kit-core.js` next to the folder that holds the module), then:

```js
import { create } from './kits/buildings/timber-cottage.js';

const { group, sockets, colliders } = create({ width: 4.2, depth: 3.4, storeys: 1, seed: 1 });
scene.add(group);
```

Every module exports one factory — `create` unless the record's `asset.factory` says otherwise —
and returns `{ group, sockets, colliders }`:

- `group` is a `THREE.Group` centred on its footprint with `y = 0` on the ground plane.
- `sockets` are `{ name, position_m, normal }` descriptors in the group's local space. Attach a
  chimney pot, a sign or a lean-to through `attach(group, sockets, name, child)` rather than by
  hand-placing world coordinates.
- `colliders` are axis-aligned `{ name, centre_m, size_m }` box descriptors for physics. They are
  deliberately not the render meshes.
- `animate?(dt)` is present on the watermill, the cart, the three swaying plants and both walkers.
  It returns `false` for `dt <= 0` and `true` when something moved.

`three` is imported by bare specifier. In a bundler or in Node that resolves through the dependency
tree; in a plain page supply an import map, the way `_harness/index.html` does.

## What each group holds

**`primitives/`** — `bevelled-box`, `inset-window`, `door-with-step`, `timber-frame`,
`roof-tile-strip`, `chimney`, `stairs`, `railing`, `sign`. They carry no record and no capture of
their own: each is proved inside a building's capture (`timber-frame` and `roof-tile-strip` in
long-hall and watermill, `stairs` on round-tower, `railing` on stone-bridge's parapet, `chimney`
on long-hall, `sign` on long-hall and market-stall, the rest everywhere). `bevelled-box` also
exports `lighten(color, amount)` and `darken(color, amount)`, the two helpers every palette uses.

**`buildings/`** — `timber-cottage`, `long-hall`, `watermill`, `round-tower`, `market-stall`,
`stone-bridge`. `watermill` returns `animate(dt)`, which turns the wheel hub and nothing else.

**`props/`** — `barrel`, `crate`, `lantern-post`, `fence-run`, `cart`, `well`, `clothesline`,
`signboard`. `cart` also returns `animate(dt, speed)`, which rolls its wheels and returns `false`
for `dt <= 0`. `lantern-post` glazes its head with emissive geometry and creates **no light
object**: attach a light at its `lamp` socket if the look needs one. `fence-run` takes `length_m`
and `posts` and ends exactly on its length, so two runs butt together without a doubled post.

**`nature/`** — `tree-round`, `tree-conifer`, `rock-cluster`, `reeds`. Each returns `instancing:
{ geometry, material, hueJitter }` — hand it to `THREE.InstancedMesh`, or to `scatterInstances`
with a `hue` per placement, to plant a field from one draw call. The rock shape is normalised to a
unit box standing on `y = 0`; the reed blade stands on `y = 0` with its tip at `y = 1`, so an
instance scale is the height in metres. `tree-round`, `tree-conifer` and `reeds` return
`animate(dt)`, aliased as `sway(dt)`, which returns `false` for `dt <= 0`; `rock-cluster`
deliberately has no `animate` — a boulder does not sway.

**`creatures/`** — `quadruped-walker`, `biped-walker`. `create()` returns the rig posed mid-stride
plus `animate(dt)`, `setRoute(points, loop)` and `state`. The gait is procedural, never clip data:
`animate` advances the phase by *distance travelled / stride length*, so a planted foot holds its
world position instead of skating. The three shared helpers behind that — `twoBoneIk`, `footCycle`
and `routeStep` — live in `kit-walk.js` and are re-exported by `kit-core.js`, so a third walker is
a rig plus a `pose()` function and nothing else.

**`layout/village-layout.js`** — no record and no factory. It exports `planVillage({seed, radius,
plotCount, pathWidth})` → `{paths, plots, scatterZones}`, plus `place(plan, footprint_m, taken)`,
`nearestPathPoint(plan, point)` and `pathRibbon(plan)`. Plots face the nearest lane, and the whole
plan is seeded: the same seed produces the identical plan in Node and in the browser.

**`gltf/` — Blender-authored heroes.** Two hero assets are modelled in bpy and shipped as GLB
rather than as procedural modules: `stone-guildhall.glb` (8.0 x 6.57 m, 8 908 tris) and
`iron-lantern.glb` (3.55 m tall, 1 944 tris). Load them through their wrappers, which normalise a
GLB to the same kit contract:

```js
import { create } from './gltf/stone-guildhall.js';
const { group, sockets, colliders } = await create({ scale: 1 });
```

**`create` is the one exception in the kit library: it returns a Promise**, because the geometry
lives in a file. Everything else about the returned value is identical to a procedural module.

Sockets are not written in the wrapper. Each one is a Blender empty carrying `socket` and `normal`
custom properties, exported into glTF node `extras` by `export_extras=True` and read back from
`object.userData`, so an attachment point cannot drift away from the geometry. The proof harness
reads the same `extras`.

Regenerate either asset (no `.blend` is committed — the mesh is built from the script):

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
  --python skills/3dviz-pro-max/templates/kits/blender/export-village-assets.py -- \
  --asset stone-guildhall --out skills/3dviz-pro-max/templates/kits/gltf/stone-guildhall.glb
```

Draco is deliberately off: the offline proof harness vendors no decoder.

## Instancing and colour

`scatterInstances(geometry, material, placements)` builds an `InstancedMesh` on a **white-based
clone** of the material you pass and writes each instance's absolute colour with `setColorAt`.
That is what makes an unjittered instance render exactly the hex the module authored: three
multiplies `instanceColor` into the material colour, so an instanced field that carries its base
colour on both sides renders that colour *squared* — the trap this indirection removes. Write
palettes in the colour you want to see, and keep `hue` for the jitter.

## Quality tiers

A blueprint declares which qualities it can be built at. Only T2 is generated here; the rest are
declared by the record, never faked.

- **T0** — blockout proxy: a bevelled box at the record's `size_m`. No proof, no module run.
- **T1** — today's module: `create(params)`, flat colours, no textures. The default, unchanged.
- **T2** — the same module plus procedural surface: seeded albedo/normal/roughness canvases, vertex
  occlusion, ground dirt and edge wear. Runtime only, **no files ship**.
- **T3** — a Blender-baked GLB hero shipped beside the module (phase 9C).
- **T4** — an external asset. Schema only; nothing ships with this skill.

```js
import { buildKit } from './kit-core.js';            // re-exported from kit-surface.js
import { create } from './buildings/timber-cottage.js';

const cottage = buildKit(create, {
  width: 4.2, seed: 1,                               // ordinary module params
  tier: 'T2',
  surface: {
    families: { '#e5dccb': 'plaster', '#6b4f34': 'wood', '#8d5a4a': 'roof-tile',
                '#9c6a55': 'stone', '#b3aa9c': 'stone', '#a07a52': 'wood' },
    seed: 1, size: 1024, anisotropy: 4,
    ao: { samples: 24, radius_m: 0.45, ground_dirt_m: 0.6 }
  }
});
cottage.group;  cottage.info;  cottage.dispose?.();   // info carries tier, timings and skips
```

**A raw `create({ tier: 'T2' })` returns T1.** No module has a tier branch — `watermill.js` is at
the 200-line ceiling and `timber-cottage.js` one under it — so the branch lives in `buildKit`, and
a module that is handed a `tier` parameter simply ignores it.

`families` maps a **palette hex to a family**, so the mapping is data on the record, not code in
the module. An unmapped colour keeps its flat material: T2 degrades visibly, never silently, and
`info.surface.unmapped` lists every colour that stayed flat.

Seven families, with the starting tile pitch each repeats over (metres):
`wood` 0.6 · `plaster` 1.2 · `stone` 0.8 · `roof-tile` 0.35 · `metal` 0.5 · `fabric` 0.4 ·
`fur` 0.25 (short directional strands with tone patches, in `kit-surface-draw-organic.js`; it is
the one family with no repeating structure, which is why it survives magnification onto a limb).
The albedo is grey and multiplies `material.color`, so a red roof stays red and cream plaster stays
cream: the family supplies the pattern, the module's palette supplies the hue. The roughness map is
a multiplier too, and `applySurface` divides `material.roughness` by its mean so T2 is not glossier
than T1.

Repeat is chosen per mesh, measured not assumed: `ExtrudeGeometry` (every `bevelledBox`,
`wallWithOpenings` and gable in this tree) emits UVs in **metres**, so one repeat of `1/tile_m`
covers a tile; `CylinderGeometry` and friends emit 0..1, so the repeat is the mesh's own size over
the pitch. A geometry may declare its own scale in `geometry.userData.uv_m` (metres per UV unit);
the harness measures it for every glTF asset at load, because a Blender atlas packs a whole
building into 0..1 and no ratio heuristic can tell that from a normalised primitive. Two meshes
that need different repeats get different texture instances — a repeat lives on the texture, not
on the material.

Textures are cached on `family|seed|size` (and again on the repeat), so a village of twenty
cottages draws each map once. `applySurface` returns `{ materials, unmapped, uv, dispose() }`;
`dispose()` releases the **material clones only** — the textures belong to the cache and outlive
any one build, which is why they are never disposed twice. There is no cache eviction: the maps
live as long as the page.

`SSAOEffect` does exist in the pinned `postprocessing` build, but nothing here uses it: the proof
harness bans post-processing, so a post-only occlusion could never be proved by a capture.

### LOD and tiers at runtime

`lodFor()` (in `kit-lod.js`, re-exported from `kit-core.js`) puts the tiers you built into one
`THREE.LOD`, so a scene can hold three qualities of the same object and pay for one:

```js
import { lodFor, blockout, buildKit } from './kit-core.js';
import { create } from './buildings/timber-cottage.js';

const lod = lodFor({ T2: buildKit(create, { tier: 'T2', surface }).group,
                     T1: buildKit(create, {}).group,
                     T0: blockout(record).group },
                   { distances: { T2: 0, T1: 8.83, T0: 27.2 }, hysteresis: 0.08 });
scene.add(lod);
```

- **Distances are metres** and belong to the proof log: `view_distances_m` in
  `evidence/kits/<id>/proof-log.json` says where each tier was actually looked at (cottage: close
  8.83 m, far 27.2 m). Tiers are added nearest first, and each must be strictly farther than the
  one before it or `lodFor` throws rather than silently hiding a level.
- **Hysteresis is a fraction, not metres.** 0.08 means a level already on screen holds for another
  8 % of its switch distance, which is what stops a slow orbit flickering between two tiers.
- **A demand-driven loop must call `lod.update(camera)` itself** before rendering. `autoUpdate`
  stays `true`, so a scene that renders every frame through `WebGLRenderer.render` needs nothing;
  a scene that only redraws on change does, because nothing else advances the LOD.
- **Never wrap an instanced background in a LOD.** One `InstancedMesh` is one draw call at any
  count; a LOD per repeat adds a per-frame update and removes no draws. Eval run 3 measured 4,773
  draw calls at 5 fps with every object built as its own mesh — that is the cost this rule avoids.
- `blockout(record)` is the T0 proxy: one bevelled box at `tiers.T0.size_m`, generated, never
  shipped and never proved. It exists so placement, collision and draw-call budgets can be settled
  before any tier is built.

### Hero tier (T3)

Two kits ship a Blender-baked hero beside their module: `gltf/timber-cottage-t3.glb` and
`gltf/watermill-t3.glb`, each with a `.js` wrapper that loads it and republishes the module's sockets
from the GLB's node extras. Nothing is re-modelled in Python: `scripts/hero-tier.py` drives the proof
harness to export the module's own geometry through `THREE.GLTFExporter`, then
`blender/export-hero-tier.py` joins it, shades it by angle, bevels every arris, smart-projects one UV
atlas, multiplies the record's `tiers.T2.families` noise into each base colour and bakes colour,
ambient occlusion and roughness with Cycles. Occlusion is folded into the colour map *and* exported,
so a runtime with no `aoMap` still sees the contact. Re-running with the same module, params and bake
settings prints `"cache": "hit"` and launches nothing; without Blender the run reports
`{"status": "unavailable"}` and the local bake capability stays at T2. A proved T3 GLB already shipped with the skill remains available for direct reuse without Blender. This does not limit custom or sourced assets. T3 buys bevels, a UV atlas and baked light;
it does not buy authored topology, and a single atlas is softer at close range than T2's tiled maps.

## Rules for a new kit module

1. One file, one blueprint, at most 200 lines, kebab-case name, opening `//` header comment that
   names the subject and its three detail-ladder bands.
2. Import nothing but `../kit-core.js` (or `../../kit-core.js` from a nested folder).
3. Build in detail-ladder order — silhouette, then medium, then fine, with the starting numbers in
   `knowledge.hero-detail-ladder-defaults`. A module whose fine band is only a texture has not
   earned a record.
4. Take a `seed` parameter and route every random choice through `seeded(seed)`, so a proof run is
   reproducible and two seeds are visibly two different objects.
5. Real geometry for real features: bevels are chamfered edges, openings are holes in a wall with
   thickness, repeats are `InstancedMesh` with per-instance jitter.

## Proving a kit

```sh
python3 scripts/kit-proof.py --record knowledge.blueprint-timber-cottage
python3 scripts/kit-proof.py --record knowledge.blueprint-cart --motion-check 400
```

That serves `_harness/` with a vendored copy of `three`, drives headless Chromium through the four
named views (`far`, `mid`, `close`, `detail`), writes the PNGs and `proof-log.json` under
`evidence/kits/<record-id>/`, and appends the `check-run` evidence event. `scripts/validate.py`
then refuses the record unless every declared capture exists with the digest the log states.

`--motion-check MS` adds a fifth capture, `close-motion.png`: the close view again after the page
advances `animate(dt)` by `MS` of simulated time in fixed 1/60 s steps. It is skipped for a
blueprint with no `animate`, and the run exits 5 if the two frames are identical. Advancing in
fixed steps rather than on the wall clock is what keeps a motion capture reproducible; a page
opened by hand animates on the wall clock instead, so a creature walks and a wheel turns.

Two optional keys under a record's `proof` steer the framing, and both are read by the harness:

- `detail_socket` — the socket the `detail` view aims at. Without it the harness takes the first
  socket named `detail`, `chest`, `harness`, `lamp` or `door`, then the module's first socket,
  then the front face of the bounding box. The aim is raised by 0.35 of the model height onto the
  built surface, unless the socket already sits in the upper half of the model.
- `max_close_m` — a cap in metres on the `close` distance, which is otherwise `0.78 ×` the
  bounding-sphere fit. The smaller of the two wins, so the cap can only bring the camera nearer:
  it is how a 12 m building keeps its fine band readable instead of 2 px wide.
