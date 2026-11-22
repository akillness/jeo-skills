# Blender Expert Skills

Agent skills that make Claude (Claude Code) or Codex work in Blender 5.2 like the experts in about
200 Blender videos (Blender Studio, Blender Conference, top instructors). Start with
`scenario-blender-expert/SKILL.md` (the router).

## Status

- 15 skills. Thirteen are distilled from about 200 expert videos (Blender Studio, Blender Conference
  2019 to 2026, top instructors): `scenario-blender-expert` (router: execution channel, expert loop,
  review sheets `bx_review`, mesh audit `bx_audit`, live brushes `bx_gui`, Blender 5 API traps, bpy
  reliability) and `scenario-blender-sculpting`, `scenario-blender-retopology`,
  `scenario-blender-uv-baking`, `scenario-blender-texturing-shading`, `scenario-blender-hair`,
  `scenario-blender-rigging`, `scenario-blender-animation`, `scenario-blender-previs-storyboard`,
  `scenario-blender-geometry-nodes`, `scenario-blender-lighting-rendering`,
  `scenario-blender-grease-pencil`, `scenario-blender-hard-surface`, each with a tested
  `bx_<domain>.py`. The fourteenth, `scenario-blender-blockout`, builds camera-locked blockouts that
  guide a render-to-real video pass through the Scenario Blender Plugin. Its `bx_blockout.py` and
  `bx_kits.py` have no headless suite here; they ran in Blender 5.2.1 during the live validations
  under Provenance. The fifteenth, `scenario-blender-export`, writes engine-ready FBX, GLB, USD and
  STL files from presets and re-imports each file to check it.
- Evidence: blind-graded written scenarios, with skills won 7 of 7 against the same model without
  them; execution tests better on retopology and bake + material, on par or better on sculpting
  after refactor, on par on a bouncing ball; all 12 test suites pass headless on Blender 5.2.1.
- The delivery gate `bx_audit.deliverable()` has a live suite in Blender,
  `tests/scenario-blender-expert/test_live_gate.py`: planted defects, clean fixtures, a glTF round
  trip and the fixes the router documents. It also ran on 188 GLBs from an earlier engine-import
  test and two generated chests; renders with and without back-face culling confirmed its
  z-fighting, inside-out and inward-face findings there.
- Face shape sets (`bx_rig.SHAPE_SETS`, `shape_set`, `shape_report`) have a live suite in Blender,
  `tests/scenario-blender-expert/test_live_face_shapes.py`, including FBX and GLB round trips. The
  ARKit, viseme and Roblox FACS lists were read from the vendor pages on 2026-10-18.
- `bx_rig.weight_report`'s mirror check has a live suite in Blender,
  `tests/scenario-blender-expert/test_live_weights.py`, with Blender (`.L`/`.R`) and engine
  (`_l`/`_r`) side names. Before it, engine names compared each group with itself and reported 1.0.
- `bx_rig.apply_pose_as_rest` has a live suite in Blender,
  `tests/scenario-blender-expert/test_live_pose_rest.py`: a posed mesh with a shape key and a
  Subdivision keeps both shapes within 1e-5 m and its modifier order. It also checks that 5.2.1's
  `modifier_apply` still refuses a mesh with shape keys, the reason the helper exists.
- The rigging P16 gate numbers (a body moved onto a shared skeleton) come from a seeded sweep on a
  Rigify Basic mannequin, 5 poses up to 25 degrees, on 2026-11-21. It measured 0.0007 mm with B-bone
  segments at 1, merged bones turned together and world-space deltas; 21, 29 and 96 mm with one of
  those missing; 16 mm after a 4-influence cap. That sweep script is not in this repository.
- Known limits: headless sculpting reaches concept quality (finished surfaces need real brushes in a
  live session); hair-curve and Grease Pencil draw strokes cannot be scripted; procedural retopology
  still needs a human pass on the finest face loops.

## Install

```bash
npx skills add scenario-labs/skills --skill scenario-blender-expert scenario-blender-animation scenario-blender-blockout scenario-blender-export scenario-blender-geometry-nodes scenario-blender-grease-pencil scenario-blender-hair scenario-blender-hard-surface scenario-blender-lighting-rendering scenario-blender-previs-storyboard scenario-blender-retopology scenario-blender-rigging scenario-blender-sculpting scenario-blender-texturing-shading scenario-blender-uv-baking
```

The installer puts the skills side by side, which the specialists need: they import the lead skill's
`scripts/`. In the installer picker (`npx skills add scenario-labs/skills`), the family is the
"Expert tools: Blender" group. Update with `npx skills update`.

## Requirements

- Blender 5.2 LTS (tested on 5.2.1). Python tools live in each skill's `scripts/` (`bx_*.py`); the
  router's `scripts/` (`bx_audit`, `bx_review`, `bx_gui`) are shared by the others, so keep all
  folders side by side.
- Headless runs: `blender --background --factory-startup --python-exit-code 1 --python script.py`.
  Real sculpt/paint brushes need a live Blender window (e.g. through an MCP bridge).

## Provenance

Ported from
[edemaistre/blender-expert-skills](https://github.com/edemaistre/blender-expert-skills/tree/v0.1),
built on 2026-09-24, with these changes: the `scenario-` prefix on every skill name, this
repository's frontmatter (`name`, `description`, `license`), no version line in the skill bodies,
the sibling-install line in each `SKILL.md`, and paths into the build project made relative.

`scenario-blender-blockout` was written for this repository on 2026-10-16 from the author's own
blockout workflow: rewritten for the Scenario Blender Plugin's local Scenario MCP server, every
plugin tool and argument checked against the plugin's `docs/MCP.md`, and a new toolkit. It was
validated live four times on PR 243: once on the headless channel and the hosted route on Blender
5.0.1, then three times on the plugin's Render Video lane on Blender 5.2.1 with plugin 0.11.0. Those
runs changed:

- `K.walk_path`: planted feet. The legs are solved per frame so each stance foot stays put while the
  body passes over it (it slid at about body speed before), with level soles and a hip bob. A stride
  past 0.5 h plants for 0.5 h and slides the rest.
- The toolkit import drops copies an earlier run left in Blender's Python, which reused a stale kit.
- `K.figure`: shins end at the ankle, and the rough capsule's base sits on z = 0 (it floated 4 cm).
- `K.vehicle`: dark red rear blocks.
- `B.solid_view`: Material by default.

The bicycle kind and `K.pedal` came from issue 304: the application tests on PR 294 had no bike
build or rider recipe to follow. They were checked headless in Blender 5.2.1: the bike's length,
ground contact and marked front at every fidelity and at size 0.8, the feet on the pedals every
frame, the pelvis on the saddle and the hands on the bars for 1.75 m and 1.4 m riders, and one hero
per ridden bike in `K.movers`. Which cast style holds a pedaling motion in a video model is not yet
tested.

The delivery gate in `bx_audit.py` was written for this repository on 2026-10-18. A comparison with
[EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (MIT) prompted it: that
repository's QA check catches deliverability defects (floating parts, z-fighting, inside-out parts,
unapplied scale) that `audit` did not grade. No code was copied.

On 2026-10-19 `K.figure` gained a cast style (`capsule`, `featured`, `jointed`, `mannequin`),
independent of the set's fidelity, and `walk_path` a capsule gait (a step bob, a sway, swinging arms
and props). Example 4 was rebuilt in each style and rendered through Seedance 2.5, MiniMax H3 Max 3D
to Video and LTX 2.3 Render to Real; the findings are in the skill's `references/cast.md`. A figure
built without `style` or `fidelity` is now a capsule (it was a jointed figure).

`scenario-blender-export` was written for this repository on 2026-10-18. Its live suite,
`tests/scenario-blender-expert/test_live_export.py`, exports a crate and a skinned, animated
character with every preset and re-imports each file in Blender 5.2.1. The same files were imported
into Unity 6000.3.21f1 (batch mode) and Godot 4.7.2 (headless); the results are in the skill's
`references/engines.md`. The `unreal` and `roblox` presets were not imported into those engines.

On 2026-10-20 the application test (`/skills:validate`) had a fresh agent take a generated chest to
Unity, Godot and Roblox with `scenario-blender-export`. Its five findings were fixed:

- `round_trip()` compares the image maps on each material; `extra_maps()` writes the metallic and
  roughness maps an FBX drops after a glTF import;
- `ground()` sets a generated mesh's real size and puts its pivot at the center of its base;
- the gate step names the route for open borders and edges shared by three or more faces;
- a headless Godot check sits in `references/engines.md`;
- `bx_review.review()` takes `culling=True` (`scenario-blender-expert`).

On 2026-10-26 a third run took a generated side table to Unity with LODs, Unreal with a convex
collision mesh, and three.js. Its findings were fixed:

- `lods()` welds the seams a glTF import splits before decimating; unwelded, LOD1 and LOD2 cracked
  and the gate only warned about loose vertices;
- `collision()` caps a convex hull at `max_verts=64`; the full hull of the table had 12,270 faces;
- `references/engines.md` quotes Epic on Auto Generate Collision with a UCX mesh and on sRGB for
  masks.

On 2026-11-07 `export()` gained `skipped_settings`: a preset setting listed in `OPTIONAL` that the
running exporter lacks is skipped and reported, and any other missing setting still raises. The
`web` preset's meshopt option arrived with Blender 5.2, and the Scenario Blender Plugin also runs on
5.0 and 5.1. `web` exported a cube on Blender 5.0.1 and 5.1.2 without meshopt and passed the round
trip; on 5.2.1 it still writes `EXT_meshopt_compression`.

Paths such as `tests/...` inside the references point to the test evidence on the build machine.
They are provenance only; the skills do not need them to run.
