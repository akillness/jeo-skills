---
name: scenario-3d
description: Use when generating or handling 3D assets through the Scenario MCP server, including text-to-3D or image-to-3D meshes, GPT-6 Astra 3D or Claude Opus 5.5 3D, GLB, FBX, OBJ, STL, or VOX files, PBR-textured or game-ready models, voxel models, multi-view reconstruction, editing a mesh by prompt, retexture, remesh, UV unwrap, auto-rigging a biped or quadruped, or retargeting an animation, previewing a mesh in the 3D viewer, or downloading a model for import into Unity, Unreal, Godot, or Blender.
license: MIT
---

# Scenario 3D Asset Workflows

## Overview

Generate a concept image first, then run image-to-3D: it has a larger catalog and more art direction
than text-to-3D (`txt23d`). Per-family contracts: `scenario-meshy`, `scenario-rodin`,
`scenario-sparc3d`. Walkable scenes and Gaussian splats: `scenario-3d-worlds`. PBR retexture of a
finished mesh or scene: `scenario-patina-retexture`. Inside Blender, through the Scenario for
Blender extension: `scenario-blender`. Connection and the core loop: the `scenario` skill. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

## Quick reference

| Step           | Tool                                                                           | Notes                                                                                  |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Find 3D models | `recommend` with the capability and the user's own words (`search` for a name) | Capabilities: `txt23d`, `img23d`, `3d23d`                                              |
| Inspect inputs | `model_schema_get`                                                             | Always call before `model_run`                                                         |
| Generate       | `model_run`                                                                    | Pass reference images as asset IDs                                                     |
| Wait           | `jobs_wait`                                                                    | Any `job_id` returned without assets goes in `job_ids`; never poll `job_get` in a loop |
| Preview        | `asset_display`                                                                | Interactive GLB/FBX/VOX/OBJ viewer on MCP App hosts                                    |
| Download       | `asset_download`                                                               | Returns a URL; save with `curl -L`                                                     |

## Worked example: game-ready treasure chest

- **Plan check.** Before step 1, run `recommend` for every later step (step 2, plus any rig or
  retexture). An entry marked `requires_plan_upgrade` fails with a 403
  (`ModelAccessRestrictedError`) only after earlier steps were paid: settle the upgrade or pick
  another member first. If the `img23d` call answers `ask_user` about existing concepts, take the
  concept-image branch: step 1 makes them.
- **Batch price.** Price per asset from one real concept: `dry_run` each candidate on it (later legs
  per step 4), times the count. At authoring time one LLM-based member quoted 1,300 CU at its
  default effort, a single-image Tripo generator 45. Past the plan's credits, each job's wait grows
  with its cost.

1. Generate the concept: pick a text-to-image model via `recommend` with the user's own words as
   `prompt`, then `model_schema_get` and `model_run`. Prompt a single centered subject on a plain
   background. Show a non-biped creature at eye level, from the side or three-quarters, every leg
   visible and clear of the body: top-down hides leg undersides and body height. A biped headed for
   a rig takes the pose in Rigging and animation. Upload a user's reference with `upload_asset` and
   pass its asset ID instead. Keep a reference on a plain background as is, and prefer it to a busy
   shot: removal keeps a glossy subject's reflections of the scene, which image-to-3D bakes into the
   texture. Remove a busy one's background first (`recommend` the removal) and pass that output's id
   instead. An isolated subject matters, a transparent cutout does not; an image field's
   `background_note`, when present, says the same.
2. `recommend` with `capability="img23d"` and the user's own words as `prompt`. Live members include
   the Hunyuan 3D, Meshy, Tripo, and Trellis families, and Scenario's own LLM-based 3D generation:
   GPT-6 Astra 3D and Claude Opus 5.5 3D (the cheaper at authoring time; compare both with
   `dry_run`). Those two LLM-based members alone:
   - reconstruct one object from 1 to 8 photos or renders into an editable mesh with named parts and
     per-part PBR materials;
   - suit props and hard-surface subjects, not characters or creatures;
   - price by `buildEffort`: `standard`, `high` (the default), `maximum`;
   - cap the exported triangle count with `faceBudget` (the game range in step 3);
   - change a result by editing it (see Refining meshes).
3. `model_schema_get`: inspect image inputs, polycount, PBR, and topology controls. Target 10k to
   50k triangles for this prop; never assume defaults meet that budget. Use only exposed controls:
   - **Numeric field:** read `min` and `max`, or the description when they are absent.
   - **Enum:** read `allowed_values` and their topology and count meanings (`scenario-rodin` covers
     `qualityMeshOption`). A quad count is not a triangle count.
   - **No face control, or the target is below its range:** generate, then remesh down if needed
     (Refining meshes). Never invent a face field; `scenario-sparc3d` covers members without one.

   Check the output's triangle count against the budget. At authoring time:
   - Tripo (`faceLimit`) and Meshy (`targetPolycount`, set where `scenario-meshy` says) reached both
     ends. At 10k, an eight-legged creature kept every leg and claw, and a chest its padlock and
     handles. Meshy's Smart Topology members capped lower, at 15k or 30k.
   - Hunyuan 3D (`faceCount`, from 40k) covers only the top of the range, and Trellis
     (`decimationTarget`, from 100k) starts above it. Remesh only for a target under the member's
     floor.

4. `model_run` with `parameters={"image": "asset_xxx", ...}` and `dry_run=true` to price it. Then
   run it for real with `wait=false` and pass its `job_id` to `jobs_wait` (`job_ids=["<job_id>"]`)
   until no `pending_job_ids` remain. A downstream step (rig, retexture) has no payload to `dry_run`
   until its input mesh exists: quote it from `recommend`, then re-price with `dry_run` on the real
   asset before launching.
5. `asset_display` the output `asset_id`, then `asset_download` and `curl -L -o chest.glb "<url>"`.
   Omit `format` when `asset_get` shows `properties.format` `glb`: it returns the stored original
   byte for byte. `format` converts to `glb`, `fbx`, or `obj`; pass `glb` for the LLM-based members,
   which store a Blender file. Ask for `fbx` for a Unity project without a glTF importer, and keep
   the GLB too: at authoring time the FBX embedded only two images, so it may miss PBR maps.

**Prompt-only build.** Both LLM-based members support `txt23d`. When the user wants no concept to
approve, skip step 1. In step 2, `recommend` with `capability="txt23d"` and the user's words as
`prompt`. Follow steps 3 to 5 with `images: []`; describe the object and name required parts in
`prompt`. A chest's `lid`, `body`, and `padlock` returned as those node names.

Multi-view models take several images of one subject; read the count and fields off
`model_schema_get`. Side fields follow the subject: on the Tripo multi-view members at authoring
time, `leftImage` was the character's own left (nose toward frame left), `rightImage` the mirror. A
sheet labeled by the viewer's side reverses them, and a swapped pair can fuse front and back into
one shell.

## Texture and lighting controls

Several image-to-3D families split texture from geometry. Read each dial in `model_schema_get`
before promising a look. Authoring-time examples from the Tripo members:

- `texture: false` returns a bare mesh and is a `cost_impact` field: the cheap path when the user
  textures in a DCC. `textureQuality` also moves the price; an empty texture version picker keeps
  the provider's default.
- `delight` strips lighting baked into the reference so the mesh relights in the engine. It
  defaulted to on; turn it off only when painted shading is the art style. The export stays a lit
  material either way: for no relighting at all, the user sets an unlit shader on import.
- `pbr`: the P2 generators defaulted it off (on forces texturing, billed as such); the 3.1
  generators and the texturing member defaulted it on, then ignored the texture parameters. Read its
  description and say which won.
- No Tripo member exposed symmetry: a result unlike the vendor's own app may come from an app-only
  setting.
- Geometry and texture take separate seeds (`seed`, `textureSeed`): hold `seed` and the image, vary
  `textureSeed` for texture variants on one shape.
- `autoSize` scales the output to real-world meters and defaulted to off: set `true` for a
  real-scale import. `dimensions` still reads the unit-normalized mesh (longest side 1.0), since the
  meters sit in the GLB's node transform: not a failure.

## Inspecting results

Hosts without MCP Apps get the `app_url` link instead of the viewer. The viewer's capture button
calls `capture_3d_view`, an app-only tool that posts an image `asset_id` of the current view into
the conversation. Reuse it as a generation reference or a similarity `search` image. Never call
`capture_3d_view` yourself: it needs PNG canvas data only the viewer has.

## Refining meshes

3D-to-3D utilities retexture, remesh, UV-unwrap, and segment parts: `recommend` with
`capability="3d23d"` plus the operation in the user's own words. Most take the source `asset_id` in
a `kind: "3d"` file field, usually `model` (also `mesh`, `file3d`, `sceneFile`). A 400
`Input model is required` or `Provide a reference image or a 3D model` means the mesh went in under
another name (an image field, or a URL).

The LLM-based members of step 2 also edit an existing mesh, prop or character:

- `sceneFile` takes its `asset_id` (any 3D model, returned in the same format), `images` stays
  empty, `prompt` states the change.
- `buildEffort` fits the change, not the object: `standard` for a recolor, `high` or `maximum` to
  add or reshape parts.
- Price follows `buildEffort`, not the mesh, and `recommend` priced no edit at authoring time: a
  `dry_run` on any project mesh quotes it.
- A recolor kept every part name and the face count. A reshape is uncapped (`faceBudget` ignored):
  it took a 4,817-triangle cat to 788,954, so plan a remesh before an engine.
- A replaced material keeps its old name; only added parts get new ones. The edit is generated:
  check what the prompt did not name against the source.
- GPT-6 Astra 3D's description also claimed Mixamo-named rigs, ARKit face shapes, animation loops,
  UV re-unwraps, and modular kits, so it competes in those `recommend` calls.

Splitting a finished mesh into parts is a contested lane, so it stays a `recommend` pick. At
authoring time vendors offered granularity controls or a bundled PBR retexture, and image-to-parts
members built parts from the picture instead. A convincing mesh is not a game-ready one: part
separation, joints, materials, and animation are each their own pass. Polygon caps differ by
topology: read the slider's `max` instead of promising a count. A named provider feature is a valid
`search` target, but an empty result or one member's enum does not prove a capability absent
platform-wide. `recommend` the unmet need (a hinged prop), inspect the returned schemas, and report
it unverified if none exposes it. Never invent a call from the provider's site.

## A staged chain toward game-ready

One image-to-3D run bakes its texture onto UVs the generator chose. A mesh headed for an engine
usually goes further, each output's `asset_id` feeding the next tool's `kind: "3d"` field:

1. Geometry: a multi-view member when several angles exist, with `texture: false` where offered, and
   `pbr: false` beside it where `pbr` overrides the texture settings.
2. UV unwrap.
3. Retexture the unwrapped mesh from a prompt, an image, or a style reference.
4. Rig last, on the topology that ships.

Each step after the first is a `3d23d` `recommend` pick and its own billed run: `dry_run` it on the
real input before launching. Along the chain:

- **Retexture schemas.** Avoid a setting that rebuilds UVs, which discards the unwrap. Check the
  same `pbr` default (the Tripo texturing member defaulted to PBR at authoring time). When a schema
  is silent on UVs, prefer a member with an explicit keep-existing-UVs setting.
- **Input caps.** One unwrapper took meshes up to 30,000 faces at authoring time: set the
  generator's face limit under it (the Tripo multi-view member exposed `faceLimit` and
  `smartLowPoly`), or remesh down first.
- **Checks between steps.** `asset_display` each output. Without a viewer, compare face count, UVs,
  and `dimensions` from `asset_get` step to step, plus the thumbnail asset, which can lag the job by
  seconds. `hasUVs` proves UVs exist, not a clean layout; an unwrapper's "albedo" PNG may be a
  preview, not the atlas.
- **Inherited defects.** Faces rendering dark or inside out are flipped normals, which later steps
  inherit. Scale and pivot can shift between steps, even within one vendor (`autoSize` above):
  confirm both in a DCC before the rig.
- **Sibling formats.** Feed the GLB onward unless the next schema asks otherwise or the mesh is
  quads, which stay in FBX. With no GLB, feed the OBJ or FBX the next schema lists (a `dry_run` may
  skip the format check, so the real run confirms it), else convert with `asset_download` `format`.

Fixing normals, origin, or naming by hand is DCC work, not an MCP call. The
`scenario-blender-expert` skill drives Blender; it installs locally, so `skill_get` cannot fetch it.

## Rigging and animation

Rigging is a separate `3d23d` step on a finished mesh, not a generator flag: `recommend` that
capability plus the rigging need in the user's own words.

Body plan picks the model. Humanoid riggers take the mesh plus at most a front-facing hint or an
approximate height, and infer a biped skeleton. Non-bipeds go to a model exposing `rigType`:
`quadruped`, `hexapod`, `octopod`, `avian`, `serpentine`, `aquatic`. A static prop has no body plan:
if `recommend` answers `ask_user`, part segmentation is the nearer step.

A biped headed for a rig starts from a T- or A-pose concept (full body, front view, arms clear of
the torso, plain background): riggers infer joints from the pose. A non-biped keeps step 1's view.
For quads:

- Pick an image-to-3D member whose schema offers quad topology and set it; the default is triangles.
  At authoring time the Tripo P2 and 3.1 members had a `quad` switch with a lower face cap;
  `scenario-rodin` and `scenario-meshy` name their families' controls.
- Quad output arrives as FBX. glTF stores triangles only, so `format: "glb"` or a GLB-only step
  triangulates it.
- Keep the FBX, rig it with a member whose file field lists FBX, and check each output's face type
  in a DCC before promising quads. A rig returned as GLB is triangulated: deliver the quad FBX
  beside it and say so.

Three schema details decide whether the output is usable:

- **Formats.** Riggers accept GLB, often OBJ, FBX, or STL, and expose no output-format field. The
  rig comes back as GLB or FBX, mostly unannounced: expect a DCC pass when the engine needs the
  other.
- **Size ceiling.** A file `max_size` is rare (one humanoid rigger capped at 30 MB): check the
  schema before decimating.
- **Animation versus rig.** Where a rigger exposes `animation`, it retargets a preset clip; its
  `allowed_values` are rig-type prefixed (`quadruped:walk`), so read them. By default only the
  retarget file comes back: set `includeRiggedModel` to keep the plain rig too. The two arrive as
  separate assets with identical `metadata`, in no set order. `asset_get` tells them apart: the
  retarget has `properties.hasAnimations` true and an `animationFrameCount`, the plain rig false and
  null.

When only motion is wanted, motion-transfer video models animate a still character image with no
skeleton: see `scenario-video`. Video-to-motion models that auto-rig an uploaded mesh are the one
place an `outputFormat` enum picks the engine target.

## Common mistakes

- Running `model_run` without `model_schema_get`: 3D parameters differ far more between models than
  image parameters do.
- Hardcoding model IDs: catalogs rotate (a `deprecated:<replacement_id>` tag names the successor).
  Re-discover each session: `recommend` for a need, `search` for a name.
- Promising a named skeleton, an influence count, or bones for wings and extra limbs the chosen
  member does not document: pick the closest body plan, then finish in a DCC.
- Sending a biped to a `rigType` model: the enum has no biped value; humanoids have their own
  riggers.
