---
name: scenario-video-to-motion
description: "Use when turning a reference video into 3D character animation through the Scenario MCP: markerless motion capture from a phone clip or generated performance, auto-rigging an uploaded FBX, GLB, or OBJ character with the captured motion, raw motion on a Mixamo or MetaHuman skeleton to retarget yourself, in-place locomotion, looping clips, facial capture, several or occluded performers, or FBX exports for Blender, Maya, Unreal, Unity, or Roblox. Keywords: mocap, multi-person, video23d."
license: MIT
---

# Scenario Video to Motion

## Overview

Video-to-motion members watch the people in a clip and return 3D animation: either your character
mesh, auto-rigged and moving, or the motion alone on a standard skeleton. They are the `video23d`
capability, and they differ more than their shared name suggests: which character input they take,
which skeleton comes back, and which file formats they write.

Siblings: `scenario` (connection, scope, upload, `jobs_wait`), `scenario-3d` (making or rigging the
mesh first), `scenario-video` (generating a reference performance when no footage exists), and
`scenario-video-editing` (trimming and resizing the clip). If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

## Quick reference

| Step             | Call                                                               | Watch for                                            |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Upload inputs    | `upload_asset` with `kind: "video"`, then `kind: "3d"` for a mesh  | The mesh is optional on every member                 |
| Fit the clip     | `asset_get`, then trim or resize per `scenario-video-editing`      | Duration, size, and even-dimension limits per member |
| Pick a member    | `recommend` with `capability: "video23d"` and the user's own words | Read `next_step` per the `scenario` skill            |
| Read the inputs  | `model_schema_get`                                                 | Each file field's `kind`, the output enums           |
| Price, then run  | `model_run` with `dry_run: true`, then `wait: false`               | The `video` field carries `cost_impact`              |
| Wait and inspect | `jobs_wait`, then `asset_display`                                  | Facing, foot contact, and frame count                |

## Choose the output before the member

Three outcomes, and members cover different ones. Settle it with the user first (unattended: a
character whose existing rig the project depends on takes motion only; otherwise animate the mesh).

- **Your character, animated.** A member takes the mesh, auto-rigs it, and applies the motion. The
  rig is the member's own: it does not retarget onto a skeleton the mesh already carries, so clips
  built for an existing rig need bone remapping.
- **Motion only, on a named skeleton.** A member returns the animation on a Mixamo-style or
  MetaHuman skeleton without uploading your character. Choose this when the character is already
  rigged. The file can include a template mesh: inspect it, then omit that mesh when retargeting
  onto the user's rig.
- **Motion only, from a mesh member.** Some mesh members also offer an animation-only flag, which
  drops the mesh from the download.

`recommend` ranks the members on measured cost and latency and names which take a character. Ask it
with the user's words, including the outcome above, rather than with a bare capability.

## Read the schema, field by field

Field names repeat across members with different meanings, so read each field's `kind` before
filling it:

- One member's `characterFile` takes a 3D mesh; another member's `characterFile` takes a reference
  image of the character, while its mesh field is `characterModel`. The field's `kind` (`3d` or
  `image`), not its name, says which asset it takes.
- Output formats differ: one member writes engine-specific FBX variants (`fbx-blender`,
  `fbx-unreal`, `fbx-roblox`, Maya scene files), one a plain `glb` or `fbx` (its schema names `fbx`
  for Unity), and one exposes no format field at all. Pick the engine target in the run:
  `asset_download`'s `format` conversion is not documented to keep the animation.
- An FBX export can be ASCII. Blender's legacy FBX importer rejects it; use its newer ASCII-capable
  importer. Check the imported animation before calling the file Blender-ready.
- Controls worth setting when present: `moveInPlace` for game locomotion driven by code, `loop` for
  cycles, the frame rate field (named `frameRate`, `fps`, or `targetFps`), keyframe cleanup, and the
  `forward` and `up` axes when the motion arrives turned or lying down.
- Face capture and multi-person tracking both carry `cost_impact`.

## Several performers, one hiding another

- Capture the group first. Few members track several people: `recommend` with
  `capability: "video23d"`, `features: ["numPeople"]`, and the scene in the user's words ("three
  people walking, one partly behind"). The feature only selects a member with the input.
- Set `numPeople` to the count in frame on both the `dry_run` and the run. Never rely on its default
  (read it in `model_schema_get`): it may capture one person, and the count can change the price. It
  is also the cap (four at authoring time). A shorter clip keeps the crowd, so split a larger one
  into groups with the removal edit below, one clip per group.
- The multi-person member may refuse to run without a character (mesh or reference image), even for
  motion only and with both marked optional. An image can multiply the price: at authoring time,
  1,804 CU for three people on a 5-second clip, against 60 CU per capture on a single-person member.
  If the group capture cannot run or does not fit the budget, isolate each performer below and
  capture each on a single-person member.
- The schema does not say whether people return as one file or separate skeletons: inspect the
  download.
- A performer hidden behind others captures poorly. Isolate them (or a group, the same way):
  1. `recommend` with `capability: "video2video"` and "remove everyone except the person on the left
     of the frame", naming each kept person by frame position or look. Pick a member whose
     description lists removal and whose schema keeps the source duration. Read its duration field
     in `model_schema_get` and leave it matching the source, so captures stay in sync.
  2. Check the edit before capturing it:
     - `asset_get` it. A longer clip means the member re-timed or regenerated it: skip the capture.
       A shorter one only lost its end if the checks below pass: then report the missing tail.
     - `asset_display` it: everyone else must be gone, and each kept person present and moving as in
       the source wherever the source shows them. If not, skip the capture and report it.
     - A video may return only a link. Then `asset_download` it and sweep its frames where a shell
       has ffmpeg; otherwise ask the user to check it (unattended, skip the capture and report the
       edit unchecked).
     - Where the source hides a kept person fully, the edit invents that motion and nothing can
       verify it. Note those time ranges and tell the user before capture that the motion there is
       unverified.
  3. Capture that clip. One kept person: a single-person member from `recommend` with
     `capability: "video23d"`, which the fallback needs, since the multi-person member keeps its
     character requirement. Several: the multi-person member with `numPeople` set to the kept count.
  4. In a DCC, use it in place of those performers' group tracks, expecting to reposition
     characters.
- At authoring time this was a proof of concept: the isolated capture kept some unwanted movement.
  Promise a rough pass needing cleanup.
- Each removal and extra capture is a separate job: `dry_run` every leg and quote the total. Check
  one removal before launching the next: a rejected edit is still billed. Before the edit exists,
  estimate the isolated capture on the source clip, with the member and count step 3 picks; re-price
  it on the edited clip before running. If that price no longer fits, stop and report it with the
  edit.
- Unattended, isolate only performers the task calls hidden or the group capture lost (everyone,
  when the group capture cannot run), and split only a crowd past the cap. Run what fits the task's
  budget, group capture first, and a removal only when its capture fits too. Report the total of any
  leg left out, then stop. With no stated budget, run nothing: quote the prices.

## Footage that captures well

- One person, full body in frame for the whole clip, feet visible, a static camera, no one crossing
  in front (else see above). Loose clothing and props hide joints.
- Trim to the move that ships: price follows the clip, and members cap the input. At authoring time
  one capped it at 30 seconds and about 30 MB, another required even pixel width and height. Read
  `max_duration` and `max_size` when exposed by the schema. An absent cap is not a promise of
  unlimited input. Fix an over-cap clip with the video editing tools before pricing.
- No footage? Generate the performance with a video model per `scenario-video`: a single full-body
  character on a plain background, a locked-off camera, and the action described beat by beat. The
  generated clip is then the input like any other.
- Motion extraction targets human movement. A creature or a non-biped mesh needs checking frame by
  frame, and often a DCC pass.

## Worked example: a dance clip on a game character

The user has a phone clip of a dance and a character GLB, and wants an Unreal-ready loop.

1. `upload_asset` the clip (`kind: "video"`) and the GLB (`kind: "3d"`) per the `scenario` skill.
2. `asset_get` the clip: read the duration and dimensions. Trim to the eight seconds that loop with
   the video cut tool, and resize to even dimensions if a candidate member requires it.
3. `recommend` with `capability: "video23d"` and a prompt such as "apply the dance in this video to
   my uploaded character mesh, looping, exported for Unreal". Follow `next_step` per the `scenario`
   skill: present `ask_user` options; on `proceed`, take its pick without asking.
4. `model_schema_get` on the pick. Put the GLB in the field whose `kind` is `3d`. Set the Unreal
   output target if the format enum has one, `loop: true`, and `moveInPlace: true` if the game moves
   the character itself.
5. `model_run` with `dry_run: true` and quote the price. Then run with `wait: false`: these jobs
   take minutes. Retire it with `jobs_wait`, re-calling with `pending_job_ids` on timeout.
6. `asset_display` the result, or open it in a DCC. Check the facing, that the feet meet the ground,
   and that the loop point does not pop. If facing is wrong, check `forward` and `up` when the
   schema exposes them before blaming the capture. A preview link alone is not a visual check.
7. `asset_download` with no `format`, and hand over the file with the skeleton it uses.

## Common mistakes

- Expecting the motion on the character's existing rig: mesh members auto-rig from scratch. Use a
  motion-only member and retarget when the rig must stay.
- Filling a field by its name: `characterFile` is a mesh on one member and an image on another.
- Leaving `numPeople` at its default on a group clip: the capture may keep one person.
- Sending the full source video: the price grows with the clip, and over-cap clips fail.
- Converting the download to another 3D format instead of setting the export target in the run.
- Treating a sideways or upside-down result as a failed capture before trying the axis fields.
- Polling `job_get` instead of `jobs_wait`, or re-running a job that only timed out.
