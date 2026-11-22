# Critique rubric

Judge your own animation work with this rubric before you report it. Every "fail" is fixed or
reported with its reason. Numbers come from `references/procedures.md`; test ids (L0 to L16) are the
live tests that measured them.

## 1. Plumbing (blocking)

| Check                         | Pass                                                                                                                                                       | How                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Animator placement            | every Humanoid and AnimationController that animates has an `Animator`, created on the server for shared rigs                                              | `AnimAudit.rigs` rule `no-animator`                                              |
| Loading API                   | no `Humanoid:LoadAnimation` or `AnimationController:LoadAnimation`                                                                                         | `AnimAudit.scripts`                                                              |
| Joint classes                 | code that finds joints accepts `Motor6D` and `AnimationConstraint`                                                                                         | `AnimAudit` rule `motor6d-only`; `AnimRig.joint`                                 |
| No C0 writes on avatar joints | procedural motion goes into `Transform` in PreSimulation                                                                                                   | `AnimAudit` rule `c0-write`                                                      |
| Ids                           | shipped ids are `rbxassetid://`; temporary hashes and `active://` stay in tests                                                                            | `AnimAudit` rule `temp-animation-id`                                             |
| Events                        | gameplay timing uses markers, never `task.wait` or `KeyframeReached`                                                                                       | `AnimAudit` rule `keyframe-reached`; code review                                 |
| Clean rigs                    | no `AnimSaves` or `InitialPoses` in rigs that get cloned; no `RBX_MICROBONE_NODES` left in Workspace; no posed joints saved from a preview                 | `AnimAudit.rigs(game, {edit = true})`                                            |
| Imported rig                  | a Custom skinned import has a `HumanoidRootPart` collider sized to the body and one Animator; no code indexes a root the import does not have              | `AnimRig.prepareImport` report; `AnimRig.tree` root (`characters.md`, section 1) |
| Played, not just loaded       | every loaded track is played somewhere, and every name a script uses (remote, input action, hit query) is defined in the answer or by a named install step | read the scripts; `characters.md`, section 2                                     |

## 2. Track behavior (measured)

| Check                      | Pass                                                                                                                             | How                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Track loads                | `track.Length > 0` before Play or stepping                                                                                       | `AnimClip.load` errors otherwise                        |
| Priority stack             | idle at Idle, locomotion at Movement, attacks and emotes at Action or above, nothing custom at Core unless it replaces a default | `AnimClip.tracks(animator)` during play                 |
| Partial keying             | upper-body clips key only upper-body joints; parents on the pose path pass through (Weight 0)                                    | L4 numbers: unkeyed joints keep the lower track         |
| Weights                    | crossfades end at weight 1 for the active track; nothing left at a stray weight                                                  | `WeightCurrent` and `WeightTarget` in `AnimClip.tracks` |
| Markers                    | every marker name the code listens to exists in the clip, and fires once per cycle                                               | connect, play, count                                    |
| Server Authority (when on) | at most 8 active tracks per Animator; no cached tracks, `GetTrackByAnimationId` each tick                                        | count `GetPlayingAnimationTracks()`                     |

## 3. Look (visual, from captures)

Capture with `rbx_animation.pose_sheet` in Edit or `pt.capture` in a playtest, then read one contact
sheet. In Edit, start from `AnimClip.settle(animator)`, or the previous clip's fade-out shows in the
first 0.3 s (P3).

| Check            | Pass                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Silhouette       | each key pose reads in silhouette from the side and from the front                                                      |
| Arcs and spacing | hands and feet move on arcs; spacing eases in and out, not linear everywhere                                            |
| Offsetting       | limbs do not hit their keys on the same frame (2 to 3 frame offsets, Nisky and Tycoon)                                  |
| Contacts         | feet stay planted during a stance; no foot slide against the ground speed                                               |
| Loop seam        | first and last frames match; no pop at the loop                                                                         |
| Interpenetration | hands and props do not pass through the body at extreme poses                                                           |
| Faces            | the expression reads at gameplay camera distance; blink closes fully; compare a neutral and an expression capture       |
| IK               | elbows and knees bend the natural way (Pole set); the hand reaches the target within the measured gap (0.2 studs in L9) |

A capture that shows no change between poses (`rbx_review.compare` mean difference under 0.001)
means the pose did not apply or the camera misses the rig: fix the setup before judging the look. A
capture where one brightness band covers more than 95 % of the image (only the view cube on a flat
background) means the window did not draw: `pose_sheet` retakes it up to 4 times and reports
`blank`. Never judge a look from such a capture; rerun when the Studio window renders again.

## 4. Pipeline (Blender and Scenario assets)

| Check           | Pass                                                                                                                                                                               | How                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Frame rate      | 24 or 30 fps, one key per frame expected after import                                                                                                                              | `blender_roblox_anim.py audit`                                              |
| Scale keys      | none other than 1                                                                                                                                                                  | audit rule `scale-keys`                                                     |
| Skin weights    | at most 4 influences per vertex; none on Root or HumanoidRootNode                                                                                                                  | audit rules `influences`, `root-weights`                                    |
| Export settings | armature only, leaf bones off, NLA and All Actions off, Force Start/End Keying                                                                                                     | re-import with `inspect-fbx`: no `_end` bones, frame count matches          |
| Studio match    | stepped Studio pose matches Blender bone tails                                                                                                                                     | P10: worst tail error under 0.01 studs                                      |
| Studio import   | root anchored for the import; clip length reads seconds:frames at 24 fps (`AnimClip.frames` offGrid 0); `RBX_MICROBONE_NODES` removed; feet do not shake (else the scale was lost) | `characters.md`, section 5                                                  |
| Dynamic head    | 17 FACS poses, cage and four head attachments present; the five validation actions visibly move eyes and mouth                                                                     | `AnimFace.headCheck`; validation preview sheet (`characters.md`, section 4) |

## 5. Reporting

- State what ran in Studio, with the numbers, and what is GUI-only (Animation Editor import,
  publish, Face Editor, Adaptive Animation tools).
- Name the temporary ids as Studio-only and list the clips the user must publish, with the owner
  (the group for a group-owned experience).
- Never claim a face or IK result from numbers alone: attach the capture.
