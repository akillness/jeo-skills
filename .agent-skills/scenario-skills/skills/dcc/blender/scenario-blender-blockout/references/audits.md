# Blockout audits

Numbers judge the scene; images confirm what numbers cannot see. A low-resolution screenshot is a
poor color judge (a red figure has been called purple on one), so read identity from data and use
images for composition. Every helper below lives in `bx_blockout` (`B`), runs through
`execute_python`, and returns data: put it in `result`.

## Cost of a call

The plugin stops a call at 120 s and some clients stop waiting at 60 s. `frame_set` dominates:
`B.audit_cuts` evaluates every frame of every shot, the sampled audits every `step` frames. On a
200-frame blockout with a few dozen objects each audit fits one call. For long clips, run one shot
per call (`frames=range(start, end + 1, step)`), raise `step`, and keep the `names` of
`B.audit_intersections` to figures and props near their paths (it compares every pair).

## The checks

| #   | Check                     | Helper and pass                                                                                                                                                                                                            | When it fails                                                                                                                                                |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Frame math                | `B.audit_frames(seconds, fps)` returns `[]`: integer fps, `fps_base` 1, frame 1 start, (end - start + 1) / fps equals the brief, resolution at 100 % and at the size `B.lock_format` set                                   | `B.lock_format` again; a render probe or `camera_path` changed the range                                                                                     |
| 2   | Cuts                      | `B.audit_cuts()["problems"]` is `[]`: every marker bound, the camera switches exactly on each cut frame (checked at f-1, f, f+1), no lens step over 0.5 mm per frame, no position step over 5 x the shot's median and 5 cm | unbound marker: `B.bind_cuts`; switch late: marker frame; lens pop at the edge of a shot: a lens key leaking past its shot; jump: a key error or a rail kink |
| 3   | Subject in frame          | `B.audit_framing({cam: [names]})` returns `[]`: each subject's box center within 0.02 to 0.98 of the frame and in front of the camera; `whole=True` also keeps every box corner within -0.05 to 1.05 (feet included)       | move the target, widen the lens one step, or retime the dolly; never rotate the camera                                                                       |
| 4   | Occlusion                 | `B.audit_occlusion(subject)` returns `[]`: a ray from the camera to the head (92 % of the subject's height) hits the subject first or nothing                                                                              | move the blocker (restack the crate, shift the pillar); keep the camera plan. Cover on the torso is allowed, the head stays clear                            |
| 5   | Distance and legal volume | `B.audit_distance(subject, min_distance=0.8, volume=((xmin, xmax), (ymin, ymax), (zmin, zmax)))` returns `[]`                                                                                                              | only on full-figure shots: inserts and over-the-shoulder crawls sit closer by design. The volume keeps cameras inside walls and above floors                 |
| 6   | Intersections             | `B.audit_intersections(names)` returns `[]` at 2.5 cm tolerance                                                                                                                                                            | boxes, not meshes: a hit is a lead to look at. A 2 cm dip during a fall is acceptable blocking                                                               |
| 7   | Ground contact            | `B.audit_ground(names)` returns `[]`: lowest evaluated vertex within 2 cm of z = 0                                                                                                                                         | floating walks and sinking wheels are the classic misses; fix the root's z keys or the wheel radius                                                          |
| 8   | Handheld                  | `B.audit_handheld(camera)` maxima within the budget in contract.md                                                                                                                                                         | change `strength`, measure again                                                                                                                             |
| 9   | Census                    | `B.state_audit()`: counts by type and prefix, collections, markers with cameras, range, fps, resolution, engine, scene camera, animated objects, file, unsaved changes                                                     | an unexpected prefix or object: trace it, or it is not yours                                                                                                 |

Choose subjects per shot, not one hero for the whole clip: a wheel for a wheel macro, a hand on a
lever for an insert, the pair for a two-shot. A global subject point flags good inserts and misses
bad ones.

The occlusion audit doubles as a design tool: before keying an orbit, sweep candidate rail phases
with it and keep the widest clear arc.

## Looking

- Through the camera, never the editor view: `set_frame`, then `render_still` with `source`
  `CAMERA`, `width` 768, `height` 432, at the first, middle and last frame of every shot, and at
  every beat the brief pins. Read each image.
- For many frames, render them headless to files and read one contact sheet (about 1600 px wide)
  instead of each image: every image read stays in context.
- A viewport screenshot is not a camera frame; `screenshot_viewport` shows the editor view with
  overlays.

## By eye, every time

- **Identity**: distinct saturated colors visible (object color and material both set, viewport
  color type Material; Object paints a kit in its first color only); an all-white or all-gray
  playblast is the failure this check exists for. Two heroes the brief puts in one color pass when
  their signature features tell them apart.
- **Ambiguity sweep**: a vehicle's front marked in geometry; every figure one connected proxy, no
  loose blocks near it; rigid props without organic curves (a bent pole reads as a living thing);
  nothing from another sub-scene at a frame edge; a scale reference when nothing familiar is in
  frame; a track or road not mirrored against the brief.
- **Opening and ending**: frame 1 shows what the brief says is there (a doorway behind "starts at
  the door"), and the last seconds hold as strictly as the first.

## Does the hero render at all

A figure can pass every geometric audit and still be invisible: hidden in render, culled by
`clip_start`, swallowed by a wall. Render the camera frame headless at 480x270 with the subject
hidden and visible, on a backup copy, and diff the two images: a non-zero changed fraction with its
centroid near the expected screen position passes. Color thresholds on the raw render are unreliable
under the AgX view transform; the diff is not.

## Probes change state

Any render you set up yourself changes resolution, percentage, file path and format. Save them
before, restore them after, and run `B.audit_frames` again at the end: a probe has left a file at
960x540 before. `bx_review.playblast` restores its own settings.
