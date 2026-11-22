---
name: scenario-maya-retopology-uv
description: 'Use when turning a dense sculpt, scan, ZBrush export or AI-generated mesh into animation-ready or game-ready topology in Maya without a mouse ("clean up this AI mesh", "retopo this character", Quad Draw, Retopologize), testing it deforms before rigging (bad elbow or wrist bend, lids popping through the eyes), or unwrapping UVs, cutting seams, setting texel density, mip-safe padding, UDIMs, lightmap UVs, stacking mirrored shells, or preparing a low poly and cage for baking. Keywords: edge flow, eye and mouth loops, Unfold3D, bake prep.'
license: MIT
---

# Maya retopology and UVs

Expert retopology is a loop plan with the fewest polygons that still deform: landmarks first, rings
around eyes and mouth, three loops per joint, poles where nothing moves, a bend test that says whose
fault a bad crease is. Expert UVs spend texels where the camera looks, at a density derived from the
closest shot, with padding that survives mips. Without a mouse the agent reuses approved topology,
builds from data, and measures then renders every stage. If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).
Toolkit: [`scripts/mx_retopology_uv.py`](scripts/mx_retopology_uv.py)
(`import mx_retopology_uv as RU`), built on mx_audit, mx_review and mx_run.

**Status (2026-09-24):** every Maya call is **not yet run in Maya** (not installed); 99 pure and 40
fake-Maya checks pass offline. First run `tests/code/maya-retopology-uv/run_all.sh`, then fix what
`job_probe_commands` reports.

## Stance (the expert delta)

- **Landmarks first, big polygons, then fill like a puzzle.** FlippedNormals: starting small is "a
  terrible way to work"; loose is recoverable, tight is not (9N4rG5qHWgk [00:01:05] [00:02:07]). The
  loop map is data before any vertex; a template fit is gated at base density before spans are
  added.
- **Reuse approved topology.** FlippedNormals carry one perfect hand, ear or base mesh to every
  model ([00:10:11]); Jessica Dru Johnson's standard base cut face skinning from three days to 30
  minutes (ZiYEO49B768 [00:58:51]). Quad Draw substitute: `RU.fit_template`.
- **No automatic topology on what deforms.** On a face it "will look normal, but it's not"
  (FlippedNormals [00:23:15]); automatic is for parts that do not animate ([00:22:13]). Retopologize
  serves props, armor plates, static cloth; on a torso or loose coat it is a flagged start that must
  pass the deformation gate.
- **Isolate and bound deformation.** Concentric rings around eyes and mouth, one control plus two
  support loops per joint, a flat loop from lip corner to jaw corner against shearing (Jessica
  [01:15:51] [01:30:10]), equal lid loop counts (FlippedNormals [00:21:41]). Poles in still areas or
  skin folds ([00:12:45]); triangles only in cavities; never n-gons: ZBrush triangulates them and
  blend shapes break ([00:05:31]).
- **Test the bend before handoff, blame the right artist.** antCGi: loops running along a joint
  (wrist, ankle, hip crease) are the modeler's fix; volume lost at a correctly looped hinge is the
  rig's, for correctives; prove it by swapping topology under identical weights (x07USYlvu2o
  [00:10:27] [00:16:24]). Fit lids over the real eyeballs, with enough loops to curve over the
  cornea on a blink ([00:15:18]; RlNnp4qQIrU [00:08:24]). Shear (Jessica [01:13:06]) judges face
  hinges; on limbs a linear blend shears even perfect rings [added, measured].
- **Retopologize traps (Maya 2027 Help).** `polyRetopo` re-runs on edits and file open: delete
  history; Pause the node while changing several attributes. Preprocess Mesh (default on) smooths
  detail: noisy 100k+ triangle input only. Hard surface 1 / 1 / 0. Never half a mesh. Edge component
  tags steer flow.
- **Texel density from the closest camera.** Paulino: frame the reference piece at the closest shot,
  double its screen pixels, round to a power of two, Get/Set on every shell (iL2iXizf9xM
  [00:02:33]). Film: one density, UDIMs. Games: uniform, scale up the head, stack mirrored shells
  (MLC s_KLbTUdKms [00:10:57]).
- **Padding is a mip problem; bake prep is geometry.** 4 px between shells, 2 px to the border,
  doubled per mip step; Room space stays 2 px (Maya 2027 Help). Hard edges on UV seams, one
  triangulation for bake and export, the whole mirrored model baked with mirrored UVs one tile over
  (Polycount), a low that hugs the high (On Mars YDu9pYMkkSM [00:17:45]).

## Establish first

| Input               | Why it changes the plan                                                                           | Default when the brief is silent                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Purpose             | film cage subdivided at render vs real-time triangles plus bakes                                  | real-time                                                                |
| Deformation, engine | face rig, blend shapes; one extra mouth-corner span forced a fifth influence (Jessica [00:59:24]) | face and limbs deform; 4 influences, confirm with scenario-maya-rigging  |
| Budget              | triangles from the lead (Polycount); "exactly as high as needed" (FlippedNormals [00:13:46])      | propose one from screen coverage, as an assumption                       |
| Closest shot        | texel density                                                                                     | 1920 x 1080, 85 mm on the head (Paulino)                                 |
| Textures            | map size, 0-1 or UDIM, lowest mip, strategy (optimized, technical, continuous)                    | games: 0-1 seen at a quarter size; film: 4K UDIMs; characters continuous |
| Template, eyes      | base mesh; eyeballs to fit lids on                                                                | ask scenario-maya-modeling for a primitive-blocked base and eyeballs     |
| Pose                | neutral face, relaxed A-pose, eyes forward (Jessica [01:00:30]; antCGi e74KphYwMww [00:07:39])    | report a posed source                                                    |

**Clothes fused to the body (AI meshes).** Tight garments become body topology with loops on the
garment lines; loose layers get their own tube or template projected onto the fused source [added];
plates may slide but the torso stays one piece (Jessica [00:44:17]); wrinkles that never animate go
to Retopologize or the bake (FlippedNormals [00:22:13]).

## Workflow

1. **Intake, read only.** `mx_audit.audit(source)`; the source stays the bake source.
   `RU.prep_source` makes the working copy (weld, soften, report non-manifold); a broken source is
   rebuilt or used only as projection target (P2). Orient by the transform (cm, Y-up, +Z front, feet
   at 0). GATE: numbers written; clay sheet looked at.
2. **Map.** Landmarks, ring counts per opening, joint stations, flows (mouth corner under the cheek;
   neck along the sternocleidomastoid, clavicle to skull back, antCGi RlNnp4qQIrU [00:09:32]
   [00:37:43]), a method per part. GATE: the map is JSON before any geometry.
3. **Build per part.**

   | Part                                   | Method                                               | Call                                                              |
   | -------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
   | Face, head, hands, body with a base    | landmark fit                                         | `RU.fit_template`                                                 |
   | Limbs, fingers, sleeves, skirts, tails | plane sections, 1 + 2 loops per joint                | `RU.limb_stations`, `RU.build_tube`                               |
   | Props, armor plates, static cloth      | Retopologize                                         | `RU.retopologize(mesh, faces, hard_surface=...)`                  |
   | Torso or face without a base           | primitive base from scenario-maya-modeling, then fit | Retopologize only as a flagged start for Quad Draw (gui-paths.md) |

   Then cavities: mouth bag, nostrils, eye pouch (FlippedNormals [00:25:16] [00:27:22]). GATE:
   `mx_audit.verdict` clean per part.

4. **Relax, center, mirror.** `RU.relax_project`, `RU.snap_center`, `RU.mirror_half` (weld 0.001,
   antCGi QW8w15J00Ok [00:02:56]); combine symmetric parts (e74KphYwMww [00:24:32]). GATE: no center
   drift, symmetry 100%.
5. **Gate the topology.** `RU.retopo_report` plus wire and clay sheets in the source's views.
6. **Deformation-ready gate, before UVs** (antCGi unwraps after it).
   `RU.deform_test(mesh, chain, bends, review_dir=...)` per limb (elbow and knee at 90 and 130
   degrees, wrist, ankle, hip; twist judged mid-limb, never at shoulder or wrist, x07USYlvu2o
   [00:08:40]), `kind="hinge"` for jaw open, `RU.lid_check(head, eyeball)`. Proxy weights, no
   skinCluster: binds are scenario-maya-deformation's. GATE: no `topology` verdict, lids ok, pose
   sheets looked at; `rig` verdicts travel as notes; prove a fix with `RU.compare_variants` (P19,
   P20).
7. **UVs.** Seams as edge loops (`RU.loop_keys`, `RU.cut_seams`): neck base, head slits, inside the
   mouth, sleeve line, back of the arm, wrists, waist, inner legs, boot tops, soles (MLC [00:01:37]
   to [00:08:05]); cloth on its real seams (Paulino [00:05:16]). `RU.unfold`, `RU.optimize`; limb
   shells `RU.orient_shell` then `RU.straighten_rows` (MLC [00:04:49]);
   `RU.mirror_uvs(mode="mirror")`. GATE: planned shells, no folds, distortion in band.
8. **Density and packing.** `RU.density_from_camera` (film) or `RU.density_for_budget` (games);
   `RU.set_texel_density` (head bias in games); `RU.layout(scale_mode="off")` with `RU.mip_padding`;
   UDIMs, or `RU.mirror_uvs(mode="stack", offset_u=1.0)` for game bakes, never where AO or a logo
   differs; `RU.lightmap_set`. GATE: `RU.uv_report` ok; UV and `RU.checker_review` sheets looked at.
9. **Bake prep.** `RU.harden_uv_borders`, `RU.bake_check`, `RU.make_cage` or
   `RU.project_to_surface`, `RU.bake_copy`, `RU.overlap_review(low, high, out)` (P21). GATE: high
   inside the cage, hard edges only on seams, one triangulation, silhouettes match.

AI character end to end: procedure P18.

## Numbers

| Item                | Value                                                                                                                                                                                     | Relative to, source                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Joint loops         | 1 control + 2 support; knuckles 3 each                                                                                                                                                    | each bend (Jessica [01:15:51] [01:17:34])                |
| Lids, lips          | upper count = lower count                                                                                                                                                                 | FlippedNormals [00:21:41]; antCGi RlNnp4qQIrU [00:05:22] |
| Mirror, center      | weld custom 0.001; drift band 1e-4 to 1e-2 cm, snap to 0                                                                                                                                  | antCGi QW8w15J00Ok [00:02:24]; FlippedNormals [00:19:06] |
| Retopologize        | hard surface 1 / 1 / 0; Preprocess for 100k+ tris; tolerance under 10% is slow                                                                                                            | Maya 2027 Help                                           |
| Texel density       | 2 x screen px at the closest shot, power of two                                                                                                                                           | Paulino [00:02:33]                                       |
| Maps, padding       | 4K tiles, odd shell at half scale on 8K; 4 / 2 px, x2 per mip (2048 seen at 512: 16 / 8)                                                                                                  | Paulino [00:05:48]; Maya 2027 Help                       |
| Hard edges, mirror  | every UV seam, bends over ~45°; mirrored UVs 1 unit over                                                                                                                                  | Polycount                                                |
| Deformation [added] | joint loop within 20° of the bone, no spiral over 15°, 0.8 of an ideal ring's area kept; hinge mean shear under 10°; faces under 0.3 area collapse; an ideal ring under 0.7 is a rig note | organic digest; scenario-maya-deformation                |
| Lids [added]        | nothing inside the eyeball at rest or blink, vertices and edge midpoints; gap under 0.1 eye radius                                                                                        | antCGi x07USYlvu2o [00:15:18]                            |
| Gates [added]       | deviation under 10% of mean edge; UV area ratio 0.5 to 2, anisotropy under 2; density within 10%; packing 0.7; 3+ clean rings per opening; silhouettes differ under 2%                    | this skill                                               |

## Quality gates

In code (MAYA, not yet run in Maya):

```python
rep = RU.retopo_report("body_geo", "scan_high", openings={"eye_L": {"point": (3.2, 163, 8.5)}},
                       joints={"elbow_L": {"center": (45, 140, -2), "axis": (1, 0, 0), "radius": 6}})
dt = RU.deform_test("body_geo", [shoulder, elbow, wrist, hand_tip],
                    [{"name": "elbow_130", "joint": 1, "angle": 130, "axis": (0, 1, 0)}])
lid = RU.lid_check("body_geo", "eyeL_geo")
uv = RU.uv_report("body_geo", 4096, smallest_mip=1024, target_density=20.48, images_dir="/abs/out/uv")
print(rep["fails"], dt["verdict"], lid["fails"], uv["fails"])     # full arguments: procedures.md
```

Topology: 0 n-gons, no `polyRetopo` history, 3+ clean rings and equal halves per opening, 3 loops
per joint band, triangles only in cavities, eyes denser than the cranium, no center drift, no
`topology` verdict. UVs: all faces mapped, no unintended overlap, padding at the lowest mip, density
on target, hard edges only on seams (games). Visual: wire and clay sheets (rings close, even
squares); pose sheets (creases where anatomy creases, no pinching); UV sheets; checker in three
views plus the closest shot; overlap diff images (red: high outside the low). Score with
[`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                            | Looks like                                     | Fix                                                                          |
| -------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Retopologize on a face                             | plausible grid, no rings                       | template fit; openings gate                                                  |
| `polyRetopo` history kept                          | mesh re-solves on edit or open                 | `RU.retopologize` deletes it                                                 |
| All hard edges on a scan or AI mesh                | Retopologize fails or crawls                   | `prep_source` softens all                                                    |
| Cleanup and Merge on internal faces                | endless non-manifold loop                      | select-mode Cleanup, delete by hand, or Boolean Volume (P2)                  |
| Wrist or ankle bend sent to the rigger             | loops along the joint patched with correctives | `topology` verdict: reroute loops across it, A/B                             |
| Clean rings rebuilt for volume loss                | same elbow collapse                            | `rig` verdict: corrective note for scenario-maya-deformation                 |
| Lids modeled without the eyeball                   | lid pops through on a blink                    | `lid_check`, add lid loops, refit                                            |
| Center drift; relax after UVs                      | mirror seam; textures swim                     | `snap_center` first; relax before UVs or `transfer_uvs`                      |
| Straighten UVs on a whole shell                    | "this mess"                                    | orient, align rows, pin, optimize the interior (MLC)                         |
| Unfold refuses a mesh that audits manifold         | Unfold3D aborts                                | it unfolds a triangulated copy: triangulate a duplicate, select-mode Cleanup |
| Layout Uniform after density; stacked unique bakes | density changed; mirrored AO                   | `scale_mode="off"`; stack by strategy, offset 1 tile                         |
| Half model baked, two triangulations               | center seam, zig-zag shading                   | whole mirrored model; `bake_copy`                                            |

## Handoffs

- **Receives** from scenario-maya-modeling (base meshes, eyeballs, `mx_validate(profile="model")`
  clean), scenario-zbrush-expert (real scale, neutral; posed sources go back), scenario-3d (FBX or
  OBJ [verify glTF]; its remesh only for static parts); loop faults back from
  scenario-maya-deformation with pose and numbers.
- **Delivers to scenario-maya-rigging and scenario-maya-deformation:** a new version, `<part>_geo`
  frozen without history, cm, Y-up, centered, feet on the grid, eyes separate and forward, mouth
  bag, symmetric parts combined; `retopo_report`, `deform_test` (rig notes: hinges needing
  correctives) and `lid_check` JSON, wire and pose sheets.
- **Delivers to scenario-maya-lookdev:** UV sets, px/cm, UDIM table, the bake package (high,
  triangulated bake copy, cage, offsets, tangent basis: MikkTSpace for Unreal and Unity; Arnold
  `normal_map` has a MikkTSpace mode from MtoA 5.6.1.1, Maya 2027.1), `uv_report` JSON.

## Maya 2027 notes

- Quad Draw is interactive only (Make Live first); its 2027 hotkey table is lost, so gui-paths.md's
  2018 panel is [verify]. `polyRetopo` flags are unsaved: `RU.call` passes only flags `cmds.help`
  lists. Flow Retopology (cloud, 2027.1) needs a sign-in: not headless. Reduce is decimation.
- Broken source: Mesh > Booleans Volume mode with a Voxel size (2026) rebuilds watertight but needs
  a second input; Mesh > Remesh evens the spread before Retopologize.
- Unfold3D is the default, refuses non-manifold meshes, pins unselected UVs (Legacy: selected only).
  Relax is Optimize > Legacy. Texel Density needs Map Size first; Measure has Pixel Distance.
- `dgaTension` (2026.3) measures stretch against a reference mesh for a heat map (`RU.tension_node`,
  attributes [verify]). A hand-made test bind leaves Skin Tools layers uninitialized (the default),
  so `skinPercent` floods work; on a skinned mesh delete Non-Deformer History, never History (antCGi
  [00:12:41]).

## References

- [`references/procedures.md`](references/procedures.md): full code P0 to P21 with test paths. Load
  before writing code.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, disagreements,
  deciding conditions. Load when planning a face, body, clothes, a deformation test or a mapping
  strategy.
- `references/critique.md`: the self-review rubric. Load at every review.
- [`references/gui-paths.md`](references/gui-paths.md): menus, hotkeys, tool settings (Quad Draw,
  Retopologize, test bind, UV Toolkit).
- [`references/sources.md`](references/sources.md): every source with credentials, URL and
  timestamps.
