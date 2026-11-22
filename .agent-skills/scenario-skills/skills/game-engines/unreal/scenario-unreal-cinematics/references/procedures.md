# Procedures (full code)

**Status of every block: not yet run in Unreal** (UE 5.8 not installed on 2026-09-24). Each block
starts with `# test: <id>`. `tests/code/unreal-cinematics/test_procedures_snippets.py` extracts
these exact blocks and runs them in order, in one namespace, against a fake `unreal` module
(in-editor blocks) or for real (python3 blocks, ffmpeg); blocks tagged `compile-only` are only
compiled because they launch Unreal. The fake proves logic and call order, not API names: in the
engine run `job_00_probe_cine.py` first and fix every name it reports missing. Deeper tests:
`test_ue_cine_offline.py` (pure layer), `test_ue_cine_fakeunreal.py` (in-editor layer); engine jobs
`job_00` to `job_30` in the same folder.

Channels (from scenario-unreal-expert): in-editor blocks run in a live editor through Epic's MCP
server (Python tool) or `ue_remote.PythonRemote().exec(...)`, or as a job file through
`ue_run.run_python(...)`; `mode="latent"` whenever a block yields (boards, renders). Agent-side
blocks run in system python3. Context the blocks assume: `PLAN_PATH` (a plan JSON, the fixture is
`tests/code/unreal-cinematics/fixtures/trailer_plan.json`), `OUT` (a writable folder), the skill's
`scripts/` and scenario-unreal-expert's `scripts/` on `sys.path`.

Before writing raw Python, check whether Epic's MCP server lists a SequencerTools toolset (5.8
notes: "SequencerTools toolset for AI-driven sequence creation and editing"): `list_toolsets`, then
`describe_toolset` [verify name and coverage]. Prefer it for what it covers; the blocks below are
the fallback and the audit.

## P0. Probe the engine (in editor, first time only)

Why: the saved 5.8 docs confirm the Sequencer extension libraries but not the section, channel,
camera cut and graph-node names; a wrong name fails silently inside a try or loudly in the middle of
a build.

```python
# test: P0_probe
# status: not yet run in Unreal; engine test: tests/code/unreal-cinematics/job_00_probe_cine.py
import json
import unreal
import ue_cine as C

rep = C.probe()
missing = [n for n, ok in rep["classes"].items() if not ok]
missing += ["subsystem." + n for n, ok in rep["subsystem"].items() if not ok]
print(json.dumps({"missing": missing, "graph_classes": rep["graph_classes"][:20],
                  "accumulation_dof": rep["accumulation_dof"], "cat": rep["cat"]}, indent=1))
```

## P1. Plan the cut as data and check it offline (python3)

Why: lengths, lenses, the 180-degree line, jump cuts, depth of field, pre-roll and exposure
continuity are cheaper to fix in JSON than in Sequencer. Toonen locks shot lengths before animating
(JT [00:15:36]); SPI and Glitch build structure by tool, not by hand (SPI [00:06:24]; GLITCH
[00:36:59]).

```python
# test: P1_plan
# status: python3 only (no Unreal); test: test_procedures_snippets.py block P1_plan
import json
import ue_cine as C

plan = C.load_plan(PLAN_PATH)             # or C.default_trailer_plan(), then edit
findings = C.check_plan(plan)
summary = C.summarize(findings)
for f in findings:
    if f["status"] in ("fail", "warn"):
        print(f["status"], f["check"], f["shot"], f["message"], f["source"])
print(summary)
assert summary["fail"] == 0, "fix the plan before building"
rows = C.layout(plan)                     # master and local ranges, exclusive ends, pre-roll
print([(r["name"], r["master_start"], r["master_end"], r["cut_start"]) for r in rows])
```

Answering a warning is part of the plan: `"crosses_line": "chase flips on purpose"` on a shot,
`"accumulation_dof": true` only on DOF-centric shots, `"preroll": 24` on shots with cloth, hair or
particles in motion, `"exposure": {"hold": "iso"}` when apertures vary under physical camera
exposure.

Plan fields added in v0.2 (each read by a check in `check_plan`):

| Field                                                                                                                                              | Check                                                                     | Why                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"production": {"fps", "start_frame", "bias", "shot_name"}`                                                                                        | `check_production`: a plan that disagrees with the project's record fails | defaults are set once and versioned (SI [00:15:22] [00:21:52])                                                                                                       |
| subject `"joints"`, `"skeletal_meshes"`, `"leader_pose"`                                                                                           | `check_characters`                                                        | under 200 joints (GLITCH [00:05:33]); several meshes need Set Leader Pose Component in the construction script so one animation track drives all (GLITCH [00:18:46]) |
| audio `"stingers": [master frames]` (or `{"frame", "on_cut": false}`)                                                                              | `check_music_sync`                                                        | stingers land exactly on cuts (JT [00:04:55])                                                                                                                        |
| shot `"lighting"` (scenario) and `"lighting_master": true`                                                                                         | `check_lighting`, `lighting_masters`                                      | one signature shot per scenario is lit and approved first (GLITCH [00:28:51] [00:29:23])                                                                             |
| `"timing_locked"`, `"lighting_approved"`                                                                                                           | gates `ready_to_animate`, `ready_for_final_lighting`                      | set by the agent only after the board review and the director's approval                                                                                             |
| Long lenses (85 mm and more) get a `lens.lod` reminder: Use Field of View for LOD on the camera, which the builder sets (cam doc, Camera Options). |

Planning numbers (moved from SKILL.md in v0.2): a new Level Sequence is 30 fps, 0 to 150 (engine
default; `new_sequence` sets the production rate, seq-py doc); shots numbered in steps of 10
(S4Iyzbl-oaE [00:33:32]); lens by shot size EWS 14 to 24 mm, FS 24 to 35, MS 35 to 50, MCU 50 to 85,
CU 85 to 135 ([added] general cinematography, 24 mm wide from mAMp6qCt7kc [00:10:29]; `SHOT_SIZES`
in `ue_cine.py`).

## P2. Scaffold the production (in editor, once per project)

Why: "No one's going to decide that's a 30 fps show for some reason on one sequence and one sequence
alone" (SI [00:21:52]): display rate, start frame, hierarchical bias, asset naming and the folder
template are production settings, set once by one person and pushed through
`Config/DefaultEngine.ini` under revision control (SI [00:15:22]). In Project Settings the three
Sequencer values live in different sections and one exists only in an INI, which is why CAT's
Production Setup gathers them (SI [00:16:58] [00:17:30]). With the experimental Cinematic Assembly
Tools enabled, set them in Window > Cinematics > Production Setup [verify menu] and create shots
from the Unreal Scene and Unreal Shot schemas (gui-paths.md); without CAT, the folder template and
the builder below do the same job. Copy the record into `plan["production"]` so `check_production`
stops any plan that drifts.

CAT in 5.8 (VP [00:19:07] [00:20:44]): a schema can carry a full timeline template (folders, level
visibility tracks, spawnables), schemas nest (a `_LGT` lighting schema with its default kit inside
the shot schema, tokenized names passing through), and an assembly can create its own level (a
sub-level or a level per shot) that opens with it. Choose a level per shot when shots need unique
set states; otherwise keep one map with sub-levels or data layers (digest, World split). Opening a
shot then opens its map, which answers "which level does this go with and why are my bindings
broken" (SI [00:24:31]). The schemas are authored once in the GUI; assemblies can be scripted from a
shot manifest with the Create Assembly function [verify Python entry point, experimental].

```python
# test: P2_scaffold
# status: not yet run in Unreal; test: test_procedures_snippets.py block P2_scaffold
import unreal

bad = [f for f in C.check_production(plan) if f["status"] == "fail"]
assert not bad, bad                      # the plan follows the production record
root = plan["root"]
for sub in ("", "/Shots", "/Render", "/Audio", "/Review"):
    unreal.EditorAssetLibrary.make_directory(root + sub)   # [verify] returns bool
for s in plan["shots"]:
    unreal.EditorAssetLibrary.make_directory("%s/Shots/%s" % (root, s["name"]))
```

Then diff the production defaults in text:
`ue_env.read_ini_value(<project>/Config/DefaultEngine.ini, section, key)` once the probe shows which
keys CAT writes [verify key names].

## P3. Build the hierarchy and audit it (in editor)

Why: the master is an edit and shots own the content (SW ywtvn1uncZo [00:07:32]); cameras and
characters are spawnables so the cinematic plays in any level (SW yOcgYMcxr3Q [00:07:53]
[00:13:50]); each shot gets its lighting subsequence (GLITCH [00:36:59]); everything happens in one
undo entry with a progress bar (SPI [00:16:16]).

```python
# test: P3_build
# status: not yet run in Unreal; test: test_procedures_snippets.py block P3_build, engine: job_10_build_trailer.py
import unreal
import ue_cine as C

rep = C.build_from_plan(plan)             # refuses if check_plan has a fail; never overwrites
assert not rep.get("refused"), rep["findings"]
print(rep["master"], len(rep["assets"]), "assets; soft failures:", rep["soft"])
master = unreal.load_asset(rep["master"])
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
audit = C.audit_sequence(master, plan, world)
print(audit["summary"])
for f in audit["findings"]:
    print(f["status"], f["check"], f["shot"], f["message"])
```

What the builder writes per shot: a spawnable Cine Camera (filmback, crop, lens, manual focus on its
template, and keyed Current Focal Length, Current Aperture and Manual Focus Distance tracks so the
shot owns its lens), transform keys on the first and last frame aimed with `look_at`, a camera cut
from `cut_start` (pre-roll) to the exclusive end, spawnable performers whose animation section
starts before the shot (pre-roll, and at least one frame because temporal samples evaluate before
the start: mrg doc), an animation start offset converted to tick resolution [verify property name],
and `<prefix>_<shot>_LGT` with the temp camera light. Master: the Shots track and the music. Master
lighting stays in the level (a lighting sub-level or data layer), not in the master sequence,
because per-shot renders do not evaluate master-level tracks [added].

Bindings that bite later (Sir Wade, yOcgYMcxr3Q):

- A set piece animated as a possessable (a door, a car) snaps back to its level transform after its
  shot [00:10:34]; `audit_sequence` reports it as `bind.override`. Key it in every shot that needs
  the new state, change the level for a permanent change, or make an object that exists in one shot
  a spawnable [00:11:46].
- Visibility: Outliner eye toggles are not saved; Levels panel (sub-level) visibility is [00:02:23].
  Per shot, hide or show with a Level Visibility track in the shot or discipline subsequence (Glitch
  keys level visibility per subsequence, GLITCH [00:37:33]) [track class name verify]; in World
  Partition maps use data layers [added].
- A character Blueprint made of several skeletal meshes animates only the mesh the animation track
  binds; Set Leader Pose Component in its construction script makes the others follow (GLITCH
  [00:18:46]); `check_characters` asks for `"leader_pose": true`.

Then the empty-level test (Sir Wade, yOcgYMcxr3Q [00:13:50]): what no longer resolves in a blank
level is a world dependency.

```python
# test: P3_empty_level
# status: not yet run in Unreal; test: test_procedures_snippets.py block P3_empty_level
deps = C.empty_level_test(master, temp_level="/Game/_Temp/L_EmptyTest",
                          return_level=plan["map"])
print("world dependencies per shot:", deps)   # expected: set pieces only, never cameras
```

## P4. Board the cut and lock timing (latent editor, then python3)

Why: "You don't really have a first draft of your film until you have video and audio together" (JT
[00:15:36]); a board of first, middle and last frames catches framing, lens and cut problems before
any render.

```python
# test: P4_board
# status: not yet run in Unreal; test: test_procedures_snippets.py block P4_board, engine: job_20_board_latent.py
import os
board_dir = os.path.join(OUT, "board")
result = {}
C.run_on_ticker(C.board_generator(master, plan, board_dir, width=1280, height=536, preroll=True),
                on_done=lambda r: result.setdefault("board", r))
# In a live editor this returns at once; the ticker fills result["board"] over the next frames.
# In a ue_run latent job use:  manifest = yield from C.board_generator(master, plan, board_dir)
# preroll=True adds the first pre-roll frame of each pre-rolled shot, read from the shot alone:
# in the master, negative time shows the PREVIOUS shot (GUI: Evaluate Sub Sequences In Isolation).
```

```python
# test: P4_sheet
# status: python3 (PIL); test: test_procedures_snippets.py block P4_sheet
import ue_review                      # scenario-unreal-expert toolkit: image_checks(path)
board = result.get("board") or []
checks = [ue_review.image_checks(b["path"]) for b in board]
sheet = C.contact_sheet([(b["path"], b["label"]) for b in board],
                        os.path.join(OUT, "board_sheet.png"), cols=3, thumb_w=426)
print(sheet, len(checks), "frames checked")   # then LOOK at the sheet before going on
```

Boarding rules (JT [00:15:04] [00:04:55]): one pose and one camera per shot, constant keys (hotkey 5
in the GUI; `interp="constant"` in `ue_cine.key`) so the board jumps between first, middle and last
poses instead of drifting, the music and SFX on their own audio tracks, stingers on cuts
(`check_music_sync` measures the offset in frames), re-time the edit before animating. Watch the
master in camera-cut view with the audio: that is the first draft (JT [00:15:36]). Re-time with P5,
then lock (P5_lock).

## P5. Retime, take, version (in editor)

Why: built-in edit tools move sections, not intent (SPI [00:14:04]); duplicating a master shares its
shots (SI [00:41:34]); a take is the non-destructive experiment inside a shot (shots doc, Takes).

```python
# test: P5_retime
# status: not yet run in Unreal; test: test_procedures_snippets.py block P5_retime
r = C.retime_shot(master, "%s_sh030" % plan["name"], 84)    # shot length in frames
print(r)                                  # later shots shifted; master-level keys reported
take = C.new_take(master, "%s_sh050" % plan["name"], "_take02")
print("section now plays", take)
plan_shot = [s for s in plan["shots"] if s["name"] == "sh030"][0]
plan_shot["frames"] = 84                  # keep the plan the source of truth
plan["target_frames"] = sum(s["frames"] for s in plan["shots"])
```

`retime_shot` refuses when a master-level subsequence covers frames after the edit point: chop it
per shot and give each half its own asset first (SPI chop and split, [00:20:45] [00:24:19]). For a
risky asset experiment in 5.8, work inside a Sandbox (GUI, gui-paths.md) and persist only what
passed [verify scripting].

Any tool the agent writes on top (offsets, chops, bulk key edits) goes inside
`with C.editor_tool("<name>", n_items) as task:` with `task.enter_progress_frame(1, item)` per item:
one `ScopedEditorTransaction` (one undo entry) around a `ScopedSlowTask` dialog, because "long
running Python codes, they look really similar to a frozen engine" and a user who thinks the editor
froze kills it mid-write (SPI [00:16:16]).

Lock the timing once the board and the retimes are judged with the music; the gate refuses without
audio or without the lock, and repeats stinger offsets:

```python
# test: P5_lock
# status: python3 only; test: test_procedures_snippets.py block P5_lock
plan["timing_locked"] = True              # only after the sheet and the cut with music were judged
gate = C.ready_to_animate(plan)
for f in gate:
    if f["status"] != "pass":
        print(f["status"], f["check"], f["shot"], f["message"])
assert C.summarize(gate)["fail"] == 0, "no animation before the timing is locked"
```

## P6. Rack focus and lens changes on an existing shot (in editor)

Why: keyed lens values live on the camera component tracks Sequencer creates for Cine Cameras (tips
doc, Default Tracks); a rack focus is two Manual Focus Distance keys, not a tracking target that
jumps.

```python
# test: P6_rack_focus
# status: not yet run in Unreal; test: test_procedures_snippets.py block P6_rack_focus
shot_seq = unreal.load_asset(C.shot_asset_path(plan, "sh020"))
cam = [b for b in shot_seq.get_spawnables()
       if isinstance(b.get_object_template(), unreal.CineCameraActor)][0]
comp = [b for b in shot_seq.get_possessables() if b.get_parent() == cam][0]
track = [t for t in comp.get_tracks() if t.get_property_name() == "ManualFocusDistance"][0]
ch = track.get_sections()[0].get_all_channels()[0]
row = [r for r in C.layout(plan) if r["name"] == "sh020"][0]
near_cm, far_cm = 180.0, 700.0            # foreground element, then the hero
C.key(ch, row["local_start"] + 24, near_cm, "auto")
C.key(ch, row["local_start"] + 48, far_cm, "auto")
print(C.dof_limits(35, 4, near_cm, C.coc_for(C._filmback(plan))))
```

If real-time DOF breaks on the pull (hair, a fence, foreground occluders), mark the shot DOF-centric
and render it with Accumulation DOF (5.8, experimental plugin; VP [00:36:19]): the component on the
camera with its sample count, or the MRG modifier in camera-default mode; cost grows linearly with
samples, so only on those shots.

## P7. Camera moves that stay editable (in editor or GUI)

Why: Sir Wade's camera rigs separate base move, framing offset and shake (E7C1xbpEA_Q [00:05:03]
[00:05:17]); re-keying a dense base move to reframe destroys it.

- Base move: the two transform keys from P3, or a Camera Rig Rail or Crane with the camera attached
  and the rail position keyed (cam doc; class names `CameraRig_Rail`, `CameraRig_Crane` [verify]).
- Framing offset: parent the camera to an offset actor and key the offset only [added]; in the GUI,
  a camera Control Rig's offset control or an Animation Layer (gui-paths.md).
- Shake: its own weighted layer keyed per moment, strongest on action, near zero on slow moments
  (E7C1xbpEA_Q [00:06:21]); scripting Control Rig layer weights needs the 5.5+ animation layer API
  [verify].

## P7b. Lighting: temp light, masters, then per shot (with scenario-unreal-lighting-rendering)

Why: Glitch lights 400-shot episodes with two lighters by process (GLITCH [00:25:09]): a temp camera
light so every department renders from day one [00:27:18]; then the signature lighting scenarios,
one to two days each, 10 to 13 per episode, each pitched to the director whose approval "locks the
creative decision" [00:28:51] [00:29:23]; then final lighting that mostly propagates the masters,
sequences graded A+ to B by their distance from the master to allocate time [00:31:32] [00:32:05].
Approving shot by shot without masters brings late changes with "massive repercussions" [00:29:23].
For a short piece this means one or two master shots.

```python
# test: P7b_masters
# status: python3 (plan) + editor (render specs); test: test_procedures_snippets.py block P7b_masters
masters = C.lighting_masters(plan)        # one master per scenario (marked, else the longest)
print([(m["scenario"], m["master"], len(m["shots"])) for m in masters])
approval = C.render_jobs(plan, graph=plan["render"]["review_graph"],
                         only=[m["master"] for m in masters],
                         sequences=C.active_shot_paths(master, plan))
print([j["job_name"] for j in approval])  # light these first, render, show the director
plan["lighting_approved"] = [m["master"] for m in masters]   # ONLY after the director says yes
assert C.summarize(C.ready_for_final_lighting(plan))["fail"] == 0
```

Then per shot, in `<prefix>_<shot>_LGT`: spawnable rim and eye-kick lights per character, keyed on
intensity and color; a shot fix never touches the shared shot master (GLITCH [00:36:59]). Light with
the viewport's OCIO Display set to the view the grade will use
(`C.color_handoff(settings)["viewport"]`), because a linear render converted in the grade is about
one stop darker than the default viewport (WF 2Q3CybANHKE [00:09:39] [00:10:28] [00:11:00]). Judge
each final shot against its approved master (GLITCH [00:32:05]).

Cost check while lighting or before a long draft render: `stat unit` and `stat gpu` on the heaviest
shot in the viewport, and the MRG Debug Settings node's Unreal Insights trace when a render is
slower than expected (mrq-cli, MRQ to MRG mapping). Glitch's 500-joint pilot characters could not
hold a 30 fps benchmark with more than a couple on screen (GLITCH [00:05:00]), and Glitch toggles
whole levels to find a cost (GLITCH [00:37:33]). Budgets and traces go to
scenario-unreal-performance (`ue_stat.budget_check`).

## P8. The template render graph (author once, GUI or Epic's example)

Why: one source-controlled graph, per-shot values as exposed variables (8o2yaZzfHCA [00:26:58]
[00:30:14]); editing node defaults from a script dirties the shared asset (mrq-cli). Graph authoring
is only partly scriptable: read `MovieGraphCreateConfigExample.py` in
`Engine/Plugins/MovieScene/MovieRenderPipeline/Content/Python/` before scripting node creation;
otherwise build it in the GUI (gui-paths.md) or start from the 5.8 Basic config and "save as graph".

Spec of `MRG_<prod>_EXR` (names are what `ue_cine.render_jobs` overrides):

| Node                                  | Settings                                                                                                                                                                                                                                                                                                                                                                                                                                         | Source                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Global Output Settings                | resolution (3840 x 2160 or the scope 3840 x 1608), frame rate from the sequence, output folder `{project_dir}/Saved/MovieRenders/{sequence_name}` [added], file name `{sequence_name}.{frame_number}` with Zero Pad 4 (add `{layer_name}` with layers); `check_render_output`'s default pattern mirrors this                                                                                                                                     | mrg doc tokens                                                   |
| Sampling Method                       | Temporal Sample Count exposed as `TemporalSamples` (Int32)                                                                                                                                                                                                                                                                                                                                                                                       | 8o2yaZzfHCA [00:28:03]                                           |
| Warm Up Settings                      | frames exposed as `WarmUpFrames`; camera-cut warm-up exposed as `UseCameraCutWarmUp` [verify the property exists on the 5.8 node]; emulate motion blur on                                                                                                                                                                                                                                                                                        | tips doc; mrg doc                                                |
| Camera Settings                       | shutter timing Frame Center (odd counts)                                                                                                                                                                                                                                                                                                                                                                                                         | dmrq                                                             |
| Global Game Overrides                 | connected (cinematic quality applies only while connected); Use LODZero off in foliage shots                                                                                                                                                                                                                                                                                                                                                     | mrq-cli; mrg doc                                                 |
| Render Layer + Deferred Renderer      | spatial 1, Anti-Aliasing override None, Disable Tone Curve on                                                                                                                                                                                                                                                                                                                                                                                    | mrg doc; WF 2Q3CybANHKE [00:04:31]                               |
| Accumulation DOF modifier             | camera-default mode, toggled by `AccumulationDOF` (Bool)                                                                                                                                                                                                                                                                                                                                                                                         | 5.8 notes; VP [00:37:29]                                         |
| EXR output                            | 16-bit half, PIZ or DWAA/DWAB (5.8), OCIO off unless a vendor asks for ACEScg                                                                                                                                                                                                                                                                                                                                                                    | WF [00:02:27]; 5.8 notes                                         |
| Set Metadata Attributes               | shot, version, plan hash                                                                                                                                                                                                                                                                                                                                                                                                                         | mrg doc                                                          |
| Execute Script                        | class `CineWrittenFiles` from `scripts/cine_render_callbacks.py` (copied to `Content/Python/`, imported in `init_unreal.py`, else it exists for one session only), mode Editor Only (5.8: Python needs it); writes the job's written-file manifest for `check_manifest`; per-shot callbacks run only with Flush Disk Writes Per Shot on Global Output Settings, which stalls at every shot end, so leave it off unless a per-shot hook is needed | mrq-cli (Callback Scripts, Enable Per Shot Callbacks); 5.8 notes |
| Debug Settings (only when diagnosing) | Unreal Insights trace or a capture for a slow shot                                                                                                                                                                                                                                                                                                                                                                                               | mrq-cli (MRQ to MRG mapping)                                     |
| Console variables                     | none by default; each one with a written reason for a named shot problem                                                                                                                                                                                                                                                                                                                                                                         | WF fVg5ihB8Wdc [00:03:00]                                        |

Review graph `MRG_<prod>_Review`: same cameras and timing, lower resolution, PNG, burn-in (per
output type since 5.7). Then audit whatever graph the job will use, read-only:

```python
# test: P8_audit_graph
# status: not yet run in Unreal; test: test_procedures_snippets.py block P8_audit_graph
graph = unreal.load_asset(plan["render"]["graph"])
snap = C.graph_snapshot(graph)            # read-only walk from the Output node
settings = C.normalize_graph_snapshot(snap)
settings.update(delivery=plan["render"]["delivery"], preroll_frames=24, camera_cut_warmup=True)
for f in C.audit_render_settings(settings):
    print(f["status"], f["check"], f["message"])
print("exposed variables:", snap["variables"])
```

## P9. Render per shot (in editor, or command line for a farm)

Why: "the smallest unit of distributable work in Unreal Engine is a single camera cut, or a Level
Sequence Shot" (mrq-cli). One job per shot sequence also means fades and master-level tracks do not
render: fades belong to the edit [added].

```python
# test: P9_render_editor
# status: not yet run in Unreal; test: test_procedures_snippets.py block P9_render_editor, engine: job_30_render_latent.py
active = C.active_shot_paths(master, plan)   # the takes the edit plays, not the plan's names
specs = C.render_jobs(plan, sequences=active)  # one job per shot, variables from motion, flags
for f in C.render_orchestration(specs, unattended=False):
    print(f["status"], f["check"], f["message"])   # unattended=True without a farm: warn
missing = C.queue_render_jobs(specs)      # variables the graph does not expose are listed
print([m for m in missing if m[1]])
state = {}
C.start_render(on_done=lambda ok: state.setdefault("ok", ok))
# live editor: poll C.render_status() on later calls; latent job: status = yield from C.render_generator()
```

`start_render` keeps the PIE executor in a module global: a local executor can be garbage collected
mid-render (mrq-cli, Additional MRG Examples). Plain MRQ needs babysitting and a crash loses the
shots (GLITCH [00:40:14]): an overnight multi-shot render goes through a farm manager (Deadline for
Unreal at Glitch [verify 5.8 support]) or one command-line process per shot, and after any crash
`C.shots_to_render(plan, render_root, sequences=...)` gives the shots to re-render whole (P10).

Headless per shot (a real GPU in `-game` mode; never `-run=pythonscript`, never `-nullrhi`;
`mrq_command_line` always adds `-notexturestreaming`, which every doc example carries so first
frames are not rendered with low-resolution mips still streaming [reason added]): save the queue as
an asset first (Movie Render Queue window > Save Queue As; scripted save [verify]), then:

```python
# test: P9_command_line compile-only
# status: not yet run in Unreal; compile-only in test_procedures_snippets.py (launches Unreal)
import subprocess
import ue_env
eng = ue_env.find_engine()                # editor_cmd may fall back to the editor binary on Mac
cmd = C.mrq_command_line(eng["editor_cmd"], "/abs/path/MyGame.uproject", plan["map"],
                         queue="%s/Render/Q_%s" % (plan["root"], plan["name"]))
print(" ".join(cmd))
subprocess.run(cmd, check=True, timeout=6 * 3600)
```

For a farm, one command per shot (a queue per shot, or
`-LevelSequence=<shot> -MoviePipelineConfig=<primary config>`), and `job.set_consumed(True)` on jobs
already submitted (mrq-cli). Crash recovery for unattended multi-shot renders needs a farm manager
such as Deadline for Unreal (GLITCH [00:40:14]) [verify 5.8 support].

## P10. Check the frames, not the log (python3)

Why: the render only counts once its files pass: exclusive end frames, half float, no NaN, linear
highlights, warm-up and cut artifacts measured, then looked at.

```python
# test: P10_checks
# status: python3 + numpy + ffmpeg/ffprobe; test: test_procedures_snippets.py block P10_checks
import glob
import os
render_root = RENDER_ROOT                 # e.g. <project>/Saved/MovieRenders
seq_names = {s: p.rsplit("/", 1)[-1] for s, p in ACTIVE.items()}   # from active_shot_paths
out_f = C.check_render_output(plan, render_root, sequences=seq_names)  # {seq}/{seq}.{frame:04d}.exr
per_shot, report = [], {"files": out_f, "frames": {}}
for row in C.layout(plan):
    seq = seq_names.get(row["name"], "%s_%s" % (plan["name"], row["name"]))
    files = sorted(glob.glob("%s/%s/%s.*.exr" % (render_root, seq, seq)))
    if not files:
        continue
    stats = [C.exr_stats(p) for p in files[:4] + files[-2:]]
    hdr = C.parse_exr_header(files[0])
    report["frames"][row["name"]] = [f for st in stats for f in C.exr_checks(
        st, hdr, {"resolution": plan["render"]["resolution"], "linear": True,
                  "compression": ["PIZ", "ZIP", "ZIPS", "DWAA", "DWAB"]})]
    lumas = [C.small_luma(C.exr_pixels(p)) for p in files[:4]]
    report["frames"][row["name"]].append({"first_frame_pop": C.first_frame_pop(lumas)})
    per_shot.append((row["name"], stats[0]["log2_mean"]))
report["luma"] = C.luminance_continuity(per_shot, max_jump=1.0)
report["resume"] = C.shots_to_render(plan, render_root, sequences=seq_names)  # re-render these whole
man_dir = os.path.join(render_root, "_manifests")   # written by cine_render_callbacks (P8)
if os.path.isdir(man_dir):
    report["manifest"] = C.check_manifest(plan, C.latest_manifests(man_dir), sequences=seq_names)
print(C.summarize(out_f), report["luma"], "to render:", report["resume"])
```

```python
# test: P10_review_media
# status: python3 + PIL + ffmpeg; test: test_procedures_snippets.py block P10_review_media
import os
import subprocess
pngs = []
for row in C.layout(plan):
    seq = seq_names.get(row["name"], "%s_%s" % (plan["name"], row["name"]))
    for fr in C.expected_frames(row):
        exr = os.path.join(render_root, seq, "%s.%04d.exr" % (seq, fr))
        if os.path.isfile(exr):
            png = os.path.join(OUT, "review", "%06d.png" % (row["master_start"] + fr - row["local_start"]))
            pngs.append(C.exr_to_png(exr, png, width=960, label="%s %04d" % (row["name"], fr)))
cmd = C.review_movie_cmd(os.path.join(OUT, "review", "%06d.png"), plan["fps"],
                         os.path.join(OUT, "%s_review.mp4" % plan["name"]),
                         audio=MUSIC_WAV)       # the trailer music, or MRG's WAV output
subprocess.run(cmd, check=True, capture_output=True)
with open(os.path.join(OUT, "%s.edl" % plan["name"]), "w") as fh:
    fh.write(C.edl(plan))
```

The preview tone map is an approximation for composition and exposure; color is judged through the
same OCIO view as the grade (WF 2Q3CybANHKE [00:10:28]); a linear render one stop darker than the
default viewport is expected, not an error (WF [00:09:39]). Visual pass after the numbers: first
frames of every shot, every cut, DOF edges, motion blur on the fastest action, lighting continuity
against the approved masters (critique.md).

## P11. Deliver with a color note, then notes and rounds

Why: a linear EXR read without an interpretation looks dark with odd colors in Resolve (WF
2Q3CybANHKE [00:07:24]); the colorist needs the interpretation that matches how the frames were
rendered, as the first node of the Color page (an ACES Transform) (WF [00:08:30] [00:09:05]):

| Render mode                                                                                                                                                         | ACES Transform input | Output       | Expect                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| Tone curve on (direct delivery)                                                                                                                                     | sRGB (Linear)        | sRGB Texture | matches the viewport; display-referred, UE's tone curve is "ACES flavored, but not a true ACES" |
| Tone curve off (graded, the default here)                                                                                                                           | Linear sRGB          | sRGB         | about one stop darker than the viewport, expected                                               |
| OCIO to ACEScg (only when a vendor asks)                                                                                                                            | ACEScg               | sRGB         | identical to the linear sRGB path after conversion                                              |
| A log output space instead of sRGB lets the colorist use LUTs (WF [00:11:33]). `delivery_note` writes this with the rate, the EDL and each shot's files and frames: |

```python
# test: P11_delivery
# status: python3 only; test: test_procedures_snippets.py block P11_delivery
note = C.delivery_note(plan, settings, sequences=seq_names)   # settings from P8's graph audit
with open(os.path.join(OUT, "%s_delivery.txt" % plan["name"]), "w") as fh:
    fh.write(note)
print(note)
print(C.color_handoff(settings)["viewport"])   # the same view while lighting and reviewing
```

Classify every note technical or creative; fix technical ones without a creative round; at most
three creative rounds, then a live session in the engine with the director (GLITCH [00:32:37]
[00:33:40]); small notes by screenshot, directorial reviews on rendered media with sound (GLITCH
[00:39:08]). Every fix is a new version folder (`render_v002`), never an overwrite.
