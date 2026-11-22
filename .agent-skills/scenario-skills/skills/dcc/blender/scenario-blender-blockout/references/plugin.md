# Plugin channel: tools and limits

The live channel for this skill is the plugin's local Scenario MCP server, `scenario-blender`; its
full tool reference is the plugin repository's `docs/MCP.md`.

| Need                          | Tool and arguments                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Probe before building         | `scene_summary` with `fields` (`["type"]`), `limit` (up to 500) and `offset` from `next_offset`; `datablocks_summary` for counts    |
| One object, a camera's lens   | `object_detail` with `name` (cameras add `lens_mm`, `sensor_width`, `clip`)                                                         |
| Build, key, audit             | `execute_python` with `code`: `bpy` and `result = {}` preloaded; fill `result` with what you need back                              |
| Check an API before scripting | `blender_api_help` with `path`                                                                                                      |
| Step to a beat                | `set_frame` with `frame`                                                                                                            |
| Look through the shot camera  | `render_still` with `source` `CAMERA`, `width` 768, `height` 432 (GUI only); `screenshot_viewport` with `max_size` for the viewport |
| Select objects                | `select_objects` with `names`                                                                                                       |

- `execute_python` stays off until the user enables **Allow connected agents to run Python**; a
  `PermissionError` means ask. Without it only the plugin's Blockout and `camera_path` build, and
  neither makes figures or rigs.
- The plugin stops a call after 120 s and some agent clients stop waiting at 60 s. Send one stage
  piece per call (a set section, one figure, one rig, one audit). Releases up to 0.11.0 ignore
  `limit`, `offset`, `fields` and `max_size`, so `scene_summary` returns every object: check
  `datablocks_summary` on a heavy file first.
- A timed-out call has an unknown outcome: read the scene (`scene_summary` with `name_contains`)
  before sending it again.
- Every changing call records one Undo step; no tool saves the user's file. Run
  `B.stage_backup(label)` after each stage (a copy; the open file stays as it was) and ask the user
  to save at milestones.

## The plugin's own tools

- **Blockout** (`estimate_blockout` with `action` `DESIGN` or `REFINE`, `approve_blockout` with
  `quote_id` and the user-approved `approved_cost`): the Scenario LLM turns the description, Type
  and Scale the user typed in the Blockout panel into a plan of category-colored primitives, and the
  user's **Build plan** button builds the `Blockout` collection (no tool builds geometry). It fits
  Stage 2 for a generic set the user is willing to pay for. It makes no figures, facing, cameras,
  timeline or identity colors; its category colors are muted (vehicles read pale red, so repaint
  them neutral or in their identity color). A rebuild replaces the collection and drops manual
  edits, and objects added to it block rebuilds: build everything else in your own collections.
  After a failure or restart, recover the paid plan (`list_local_jobs`, `prepare_blockout_plan`,
  `blockout_plan_status`, `apply_blockout_plan` after the user approves) instead of paying again.
- **`camera_path`** (`preset` such as `orbit`, `push_in` or `crane`, or `waypoints`; `duration`,
  `focal`, `aim_at_subject`): keys one `Scenario Shot Camera` around a static center (the selection
  or the scene), sets it as scene camera, resets the frame range to its duration and turns the
  preview range off. It fits a single shot of a static set. It cannot follow a moving subject or
  bind cuts, so tracking, rails and multi-shot sequences use `B.rail_camera`. After it, run
  `B.lock_format` and the audits again.
- **Render Video** (`render_form`, `estimate_cost`, `generate`): the video pass inside Blender,
  section 6 of the skill and [handoff](handoff.md) Route 1.
