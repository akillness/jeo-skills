# Hand-off sheet and the render-to-real pass

The sheet ships with the playblast, and the video prompt is written from it. Every number in it is
read off the built scene, never retyped from the brief.

## Sheet template

```markdown
# <scene> blockout hand-off

Format: <fps> fps, <W>x<H>, frames 1..<end> (<seconds> s). Playblast: <file>. Stills: <files>.

## Color legend

| Color  | Element        | Becomes (reference)                                 |
| ------ | -------------- | --------------------------------------------------- |
| red    | FIG_red (hero) | <role> in a red <garment you name>, @image1 panel 1 |
| yellow | FIG_mia (hero) | Mia's yellow raincoat, @image1 panel 2              |
| blue   | FIG_blue       | <role>                                              |

## Cut list (from B.cut_list())

| Shot | Camera     | Frames | Start | End   | Duration | Lens     | Move         |
| ---- | ---------- | ------ | ----- | ----- | -------- | -------- | ------------ |
| 1    | CAM_01_... | 1-87   | 0.000 | 3.625 | 3.625 s  | 28-28 mm | slow push-in |

## Cast (from K.cast())

| Figure  | Style    | Color | Height | Features       | Becomes          |
| ------- | -------- | ----- | ------ | -------------- | ---------------- |
| FIG_red | featured | red   | 1.55 m | goggles, scarf | <role>, the lead |

## Entities

- Blocked as proxies: <list, with what each mass is: "the boxes on the bench are luggage">.
- Text only, not in the clip: <extras, crowds, police>, with counting rules ("no more than four
  pedestrians").

## Artifacts, with timecodes

- <00:02.10-00:03.00> black frames: gap for invented content (<what>).
- Floor grid: motion-tracking aid, replace, never inherit.

## Motion states

- <element>: <creeps forward | stands perfectly still | rolls at walking pace>.

## Tie-breaks

- The clip defines the whole camera path; nothing else about the camera is inherited.
- If text and clip disagree about motion or position, the clip wins.
- Every placeholder becomes the real object its position and size imply.
```

Exact times go here (7.792 s), approximations belong only in the brief. A slow proxy move is
ambiguous on screen, so write its state in words; the same motion has been read as rolling and as
standing still.

## Prompt grammar: motion first

A prompt that names the proxies' shapes ("the box figure becomes", "each cone is") anchors the model
on those shapes and it renders them as they are. Describe the finished shot instead, as if it
already existed. This grammar is for Seedance-style reference models; a 3D-to-video model that asks
what each proxy stands for takes the replacement-map grammar in [levels](levels.md).

1. **Rehearsal header.** "The reference video is rehearsal footage: stand-ins walked the scene so
   camera, timing and movement could be locked. The final shot replaces every stand-in with the real
   cast and set. Take from the video only the camera path and framing, the timing of every action,
   and each element's screen position, path, ground contact and scale. No shape, proportion,
   silhouette or surface in the video belongs in the final frame."
2. **Cast list by role and motion**, one line per moving element, then the set: "A woman in a teal
   wax jacket walks down the corridor toward camera." Take roles from the object names; keep the
   names and shapes out of the prompt.
3. **Proportion license.** "Where a stand-in's proportions differ from the real object's, keep its
   path, timing and ground contact and give the real object its true proportions."
4. **No geometry words** about the video's contents after the header: no box, cone, sphere, proxy,
   dummy, mannequin, blockout. Real object names stay allowed when they describe the finished scene
   (a traffic cone, a boxing ring). One exception: a capsule cast gets one stand-in clause saying
   the capsules only mark position, height, pace and heading, and a gait clause ([cast](cast.md)).
5. **Short exclusion tail.** "No blocky placeholder geometry, no mannequin figures, no untextured
   surfaces."
6. **Style from a board.** Declare it: "The reference image is a style board of four separate
   panels: take its art style, palette, materials and lighting, nothing else. Its subjects,
   compositions and angles are not part of the shot; never copy a panel's layout and never draw its
   gutters or a grid."
7. **Style block last**: the treatment by name, the palette as hex values with roles, sky,
   background falloff, every light source.

A volume that must become an effect stays a cast line too: "steam rises from a flush iron floor
grate, widest at the base" refills a cone's volume without naming it.

This full prompt is for Route 2. On the plugin's Render Video lane the plugin writes items 1 and 6
itself (see Route 1).

## Style board

One 16:9 image holding a 2x2 board, four panels in one identical style at deliberately different
angles and croppings: a character portrait (the cast's identity), a wide of the environment from
another camera height, a prop macro, a set-dressing detail. A single restyled frame of the shot
carries its own composition and shapes into the video; panels at angles the clip never uses transfer
identity without a layout to copy. Generate it through Scenario (see the `scenario` skill), then
gate it as strictly as a final render: any primitive that survives into it, a box head above all, is
rendered into the video. Check heads and faces explicitly.

## Tested limits (observed at authoring time)

- Shorter clips hold layout better: in one audit of 28 renders, 10 to 15 s clips kept the camera and
  layout, 20 to 30 s clips drifted (lost figures, invented close-ups). Several short captures beat
  one long one. Read the reference-video length cap from the model's schema.
- A bare gray mannequin playblast was refused by a provider's input screen, and re-encoding did not
  help; saturated identity colors, or a strong color tint over the whole clip, passed. The clip only
  contributes camera, motion and layout, so a tint costs nothing. For refusals on output, follow the
  `scenario-moderation` skill.
- A failed job's real reason can sit in its error detail rather than the headline message: read the
  whole error before changing the payload.
- Pick the frame to restyle by content, not position: frame 1 is often an empty establishing hook.
  Below a useful amount of detail, generate a pure style image instead.
- When a vision check compares a restyled frame with the blockout, say the frames should differ, or
  it fails frames for succeeding. Blocking checks: surviving primitives (textured primitives
  included), flipped facing, unrelated subject. Camera and layout drift in a style frame is
  advisory, since the video takes layout from the clip. Cap retries at three and log the best
  attempt.
- Image models recast photographic and character briefs reliably and resist abstract ones (colored
  cylinders, mannequins at a table); expect to pick or author those style frames by hand.

## Route 1: the plugin's Render Video lane

Inside the user's Blender, through the plugin's local Scenario MCP server. Prices are shown to the
user and spent only with their explicit approval of the exact `cu_cost_exact`.

1. `B.solid_view()` (Solid, color type Material, so every kit color shows; Object paints a kit in
   its first color only): with `capture_source` `CAMERA` the plugin switches a 3D viewport to camera
   view for the capture itself and records it with that viewport's shading, overlays hidden, then
   restores the view. Keep `settings.force_solid` false; it captures in one gray.
2. Scene frame range equal to the clip (the capture uses the preview range when enabled, otherwise
   the scene range); pick a length the model accepts. On this lane `settings.match_timeline` ties
   the model's duration to the plugin's camera path, not to the timeline (releases up to 0.11.0,
   [plugin issue 600](https://github.com/scenario-labs/blender-plugin/issues/600)). The form keeps
   the model's default `duration`: a 6 s clip was quoted at 5 s.
3. `list_models` with `lane` `render_video`, then `model_schema` with the chosen `model_id`. The
   list shows curated members first and at most 40; add `query` (such as "3D") to reach the rest.
4. `render_form` (every call takes `lane`) with `lane` `render_video`, `action` `configure`,
   `settings` with `model_id`, `look`, `capture_source` `CAMERA`, `parameters`
   `{"duration": <clip seconds, rounded up into the model's range>}` when the schema has one,
   optional `style_assets` (up to 15 Scenario asset ids, such as the style board; a model with no
   style input refuses them). The plugin wraps `look` in its own prompt, which already tells the
   model to keep the clip's camera, framing, motion, timing and layout, and names the first frame
   and the style images by role, with `@video1` and `@image` tags only on models that use them. So
   `look` is one paragraph holding grammar items 2, 3, 5 and 7 (cast, proportion license, exclusion
   tail, style block): no rehearsal header, no tags, no board declaration, references described in
   words. On a 3D-to-video model (H3 Max), `look` instead holds the replacement map and hero lines
   from [levels](levels.md), then the style block; the plugin writes the authority clause itself.
   The plugin's wrapper counts toward the model's prompt limit: a 1,466-character `look` failed
   `inspect` with "Scene Intent is longer than 2000 characters" and about 800 passed, so trim until
   `inspect` stops reporting it. Style asset ids come from one of two places. The simplest is a
   Library asset of the team and project the plugin uses, such as a board generated or uploaded
   there through the hosted Scenario MCP: pass its id as is. A local file goes through the plugin:
   `upload_reference` (`path`, optional `kind`) accepts only a file the plugin saved in its own
   folders or one the user chose in Blender this session (a form's Upload button, the Render Video
   first-frame field, a workflow File field), and refuses any other path with `UploadRefused` before
   reading it. So ask the user to choose the file in Blender, then call `upload_reference` with that
   path, then `reference_upload_status` with the returned `context_id` and `reference_id` until
   `state` is `imported`, and use its `asset_id`. Never repeat an uncertain upload. An empty `look`
   with `spark_enabled` asks Prompt Spark to write one, with its own price (`estimate_prompt`,
   `approve_prompt`) and, on this lane, only once a first frame is set; set `spark_enabled` false to
   skip it.
5. `render_form` `action` `prepare` with `role` `scene` captures and uploads the silent 1280x720
   clip. For a first frame, `first_frame_path` (same rule as `upload_reference`) and `role`
   `first_frame`; read `first_frame_route`, since some models take the image as a reference instead
   of an opening frame.
6. `render_form` `action` `inspect` until `ready_to_estimate`, and check `parameters.duration`
   against the clip before quoting. To see the capture, `asset_download` the scene reference's
   `asset_id` from `inspect` through the hosted Scenario MCP and sweep it like the playblast.
7. `estimate_cost` with `lane` `render_video` and the `model_id`, no `parameters`; show
   `cu_cost_exact`; after approval `generate` with the same lane and model, `quote_id` and
   `approved_cost`, no `parameters`.
8. `wait_for_job` with the returned id (default 45 s wait), re-called while `delivery_active` is
   true; `job_status` for a quick look.
9. Video results stop at a saved file: `prepare_result_application` (`context_id`, `request_id`,
   `expected_revision` from `list_local_jobs`, the video's `asset_id`), show the destination, then
   `apply_result_application` after approval.

A timed-out `generate` is never resent: inspect `list_local_jobs` first.

## Route 2: the hosted Scenario MCP

For the full-resolution playblast from `bx_review.playblast` (cuts follow the bound markers).

1. Upload the MP4 with `upload_asset` and `upload_asset_complete` (part uploads as the `scenario`
   skill describes); upload the style board the same way.
2. Discover a video model that takes a reference video, with `recommend` and the user's words; read
   `model_schema_get`.
3. Build the payload from the schema: the playblast in the reference-video field, the board in the
   reference-image field, prompt tags bound by array order (`@video1` governs camera, motion and
   layout; `@image1` governs style only), `duration`, when the schema has one, set to the clip's
   length; a model without the field follows the clip (`duration: -1` belongs to Seedance's edit
   prompts, see `scenario-seedance`). Field names and caps per family: `scenario-seedance` for
   Seedance.
4. `model_run` with `dry_run` true, show the price, run after approval, `jobs_wait`,
   `asset_download`.

## Judge the pass

Put the playblast and the render side by side at the same height and sweep the result rather than
spot-checking it:

```bash
ffmpeg -i playblast.mp4 -i render.mp4 -filter_complex "[0:v]scale=-2:540[a];[1:v]scale=-2:540[b];[a][b]hstack" side_by_side.mp4
ffmpeg -i side_by_side.mp4 -vf "fps=2,scale=800:-2,tile=4x6" sheet_%02d.png
```

Check per shot: camera path, framing and cut frames match; every colored element became its role at
its position and scale; no primitive survived; facing held; the ending held. A miss in geometry goes
back to the blockout; a miss in identity or look goes back to the prompt or the board.
