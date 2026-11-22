# scenario-godot-expert: critique rubric

How the lead judges its own output, a teammate's handoff, or a plan before it ships. Score each line
0 to 3 (0 missing, 1 claimed without evidence, 2 evidence with gaps, 3 evidence a reader can
reproduce). Anything at 0 or 1 on lines A1 to A4 blocks "done". The domain skills add their own
critique for taste; this one is about whether the work is real.

## A. Evidence (blocking)

| #   | Check                     | Pass looks like                                                                                      | How to check                                                                          |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A1  | Result envelope           | `ok` true, zero `parse_errors`, `script_errors`, `shader_errors`; `result_path` exists               | the `gd_run` dict, not the exit code (Godot exits 0 on parse errors)                  |
| A2  | Code compiles as 4.7      | `check_all` `failed_files == []`; `godot3_flags` empty or each hit explained; the code was also RUN  | `--check-only` misses typed-local calls such as `ps.instance()` (deltas section 19)   |
| A3  | Numbers against the brief | `budget_check` ok with the target named; p95 and worst frame; draw calls; export sizes; test totals  | profile on the brief's hardware class for the final verdict (Ian Bolton, WrjaUNAXYqk) |
| A4  | A frame you looked at     | `image_checks` `ok` on every capture, the contact sheet opened, before and after from the same views | `compare` proves the change is visible (changed_fraction above 0)                     |

## B. Godot 4.7 correctness

| #   | Check                            | Red flag                                                                                                                               |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Project settings match the brief | GodotPhysics3D in a 3D project, stretch `disabled`, renderer not the one asked for (`audit(P, "project")` flags)                       |
| B2  | APIs exist in 4.7.2              | any name not confirmed by `audit(P, "classdb", checks=[...])`; 4.8-dev APIs                                                            |
| B3  | Deprecated classes avoided       | TileMap, ParallaxBackground, SkeletonIK3D, `add_control_to_dock` in new code                                                           |
| B4  | 4.7 behavior changes respected   | typed-return override without `return`; keyboard and mouse device ids 16 and 32; packed-array element writes expected to call a setter |
| B5  | Fresh-project steps              | `--import` before `class_name` use, tests or export                                                                                    |

## C. Channel and safety

| #   | Check                  | Red flag                                                                                                                                                   |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Right channel          | a windowed run for work that needs no pixels; a headless run for a screenshot; the GUI editor opened without the user asking                               |
| C2  | One writer per project | headless run on a project a GUI editor holds (`GodotBusy` overridden without the user's word)                                                              |
| C3  | Processes              | any Godot or Blender process closed that the agent did not start; a run without a timeout                                                                  |
| C4  | Files                  | `rm` used; build output inside the project without `.gdignore`; files written outside the skill's folders; `.uid` sidecars left behind when a script moved |
| C5  | Settings writes        | `project.godot` edited by an MCP and not re-audited (duplicate keys happened with tugcantopaloglu's `manage_input_map`)                                    |

## D. Expert habits

| #   | Check                                                                                           | Source                                                                          |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Tests assert on signals and public results, each seen red once, every wait bounded              | Godotneers, CreugthdgJ0 [01:08:36]; Butch Wesley, ImqhHLlPfZg [00:13:40]        |
| D2  | Systems drivable without a mouse (body and brain, spawn points)                                 | Godotneers [00:18:14, 00:56:56]                                                 |
| D3  | Optimization only after measurement, one change at a time                                       | Dan Does Dev, s2C2RO_WMh0 [00:07:12]                                            |
| D4  | Visual editors named honestly with the substitute used                                          | brief rule; VisualShader, AnimationTree, TileSet, theme and particle inspectors |
| D5  | Edits persisted through `owner` and saved; editor edits undoable when the user's editor is live | Godot docs, Running code in the editor; Queble, nW7YtSSJzbQ [00:04:41]          |

## E. Handoff packet

A packet passes when it carries: project path and channel; the brief in numbers; what was done with
each toolkit call; evidence paths (result JSON, contact sheet with flags, CSV with `budget_check`,
JUnit totals, export sizes); **Verified** and **Assumed** lists; open issues; the fence (what the
receiver may touch). The receiver reproduces one piece of evidence before building on it, and says
which.

## F. Report wording

- Each claim tagged Verified (with the run) or Assumed. "Should work" without a run is Assumed.
- Simplifications said out loud (a smaller scene, a stand-in asset, Metal vs Vulkan numbers).
- What could not run, and why (GUI-only step, device, store account), with the GUI path from
  `gui-paths.md`.

## Common failure patterns seen in baseline answers (tests/baseline, 2026-10-02)

- Strong Godot knowledge but no standard runner: no timeout, no concurrency cap, no focus handling
  for windowed runs, so parallel agents collide or hang.
- Build output written to `build/` inside the project, which the next export packs.
- GPU timing read from viewport render time on Metal, which reads 0 on this Mac.
- "Headless compiles no shaders": compilation is lazy, `get_shader_uniform_list()` forces it in the
  dummy renderer (deltas section 19).
