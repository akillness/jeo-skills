# Expert notes: pipeline scripting in Maya 2027

The judgment behind SKILL.md, by source, with timestamps into the videos ([hh:mm:ss]) or the doc
section. [added] = this skill's own rule or inference, not stated by a source. [verify] = a flag or
behavior no saved 2027 page states. Nothing here has been run in Maya 2027 yet (not installed on
2026-09-24). Per-source notes live in the project's `notes/scripting/` and `notes/pipeline/`,
digests in `_digest_scripting_python_api.md` and `_digest_pipeline_usd_performance.md`.

## Where experts disagree, and what decides

| Question                                   | Position A                                                                                                                           | Position B                                                                                                                                                                | Deciding condition                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Maya per file, or one session for many | One mayapy child per scene: a crash, hang or leak costs one file (lead skill `mx_run`; the unskilled baseline got this right)        | Theodore's standalone RPC keeps one `maya.standalone` alive and feeds it commands (MCP bridges note, "Earth calling maya.standalone!")                                    | Default process isolation. One session per chunk only for many tiny, trusted files where start-up dominates, and only with automatic fallback to process mode for the files a crash took down [added]. FBX settings, optionVars and plug-ins survive `file(new=True)`. |
| Typed tools or raw code for an agent       | GG_MayaMCP: 71 typed tools, raw execution off unless enabled                                                                         | chadrik: bespoke tools "cripple the ability of an agent"                                                                                                                  | Someone else's production scene or a shared seat: typed tools (the batch job contract, `mx_pipeline` functions). The agent's own session: raw Python with output capture and the bridge guards.                                                                        |
| cmds or OpenMaya 2.0 in tools              | Fragapane: cmds only for queries, OM2 for everything else (Dt5ODNLUuSM [01:20:37])                                                   | Autodesk series: cmds everywhere                                                                                                                                          | Undoable GUI edits: cmds in an undo chunk or an `MPxCommand` with a modifier. Heavy reads (weights, points, matrices): OM2. Headless batch writes that never undo: OM2 is fine (`cap_influences`).                                                                     |
| Python in the pipeline                     | Bungie builds its whole rig system in object-oriented Python (U_4u0kbf-JE [00:24:52])                                                | Fragapane: "don't do Python" in the evaluated graph (_0mb4wIZi80 [01:23:31]); Python plug-in nodes are Globally Serial by default (Using Parallel Maya 2027)              | Both right: Python builds, validates and exports; native nodes or C++ evaluate every frame.                                                                                                                                                                            |
| Where rigged animation lives in a USD shot | Maya Reference prim, edit, then Cache to USD, keeping a {cache, Maya reference} variant set (Yingying, Ep.3, OWLlAdQ3Uyc [00:04:19]) | Native rig drives prims live through the proxy accessor; one scrub writes the session layer, exported as the animation layer (RISE, 8UIW-g1_heg [00:34:50] to [00:35:56]) | Deforming characters: Maya reference then cache. Transform-only set pieces and props: proxy accessor or direct prim edits.                                                                                                                                             |
| Cache granularity                          | One file with all time samples (mayaUSDExport default behavior)                                                                      | Per-frame files as value clips plus stripped static data (RISE [00:37:03] [00:38:10])                                                                                     | Multi-GB caches, farm parallelism, viewport load: value clips. Small shots: one file.                                                                                                                                                                                  |
| Alembic next to USD for comp               | Write both                                                                                                                           | RISE: no; comp read the Alembic camera while a USD layout layer moved the real one (8UIW-g1_heg [00:51:46] [00:52:19])                                                    | If a downstream tool cannot read USD, export Alembic from the composed stage, never from pre-layout sources.                                                                                                                                                           |
| Triangulation                              | Game Exporter or FBX Triangulate option                                                                                              | Epic: triangulate in the DCC and control the edges; exporter triangulation with Split Non-Matching Triangles gives "completely random smoothing" (Epic, FBX pipelines)    | Normal-mapped or skinned assets: triangulate in Maya (before binding for skinned meshes, before baking for normal-mapped ones: Polycount). Throwaway blockouts: exporter is fine.                                                                                      |
| Embed Media                                | On by default in the Game Exporter                                                                                                   | Only when the receiver cannot reach the texture paths; it inflates the file and extracts a `.fbm` folder (Maya 2027 Help, FBX Troubleshooting)                            | External handoff: embed. Internal pipeline with shared paths: off (the presets' default).                                                                                                                                                                              |
| Clips per FBX                              | Game Exporter: Save Clips to Single File writes takes                                                                                | Epic: one animation per skeletal mesh per file                                                                                                                            | Unreal: one clip per file unless the target version is tested with takes [verify]. Unity: takes are usable (clips are split on import) [added].                                                                                                                        |
| Update model                               | Push with auto-update, pinning and a live pop-up (RISE [00:11:22] [00:24:39])                                                        | Artist-triggered scene breakdown and publish diff (Borderlands [00:23:16] [00:24:23])                                                                                     | Large VFX shows with farm renders: push plus pinning. Small game teams with Perforce: breakdown and diff. `breakdown()` and `publish_diff()` implement the second.                                                                                                     |
| Maya to Unreal transport                   | Live Link streaming for review under engine lighting (Roselle, Kw3PzotnLrE [00:03:43])                                               | Files per character per cut, diffed on publish (Borderlands); FBX static mesh pipeline (Epic)                                                                             | Review and iteration: Live Link (GUI, one-way push). Delivery and reproducibility: files.                                                                                                                                                                              |
| Material transport in USD                  | MaterialX (USD for Maya 0.34 default on new installs)                                                                                | Renderer-specific shading as a fallback; MaterialX incomplete in RenderMan in 2023 (RISE [00:09:06])                                                                      | Always pass `convertMaterialsTo`; UsdPreviewSurface round-trips; render the original and the reimport and compare (scenario-maya-lookdev judges).                                                                                                                      |
| Units for big worlds                       | Keep cm, grid lines every 10 for Unreal (Maya 2027 Help, scale)                                                                      | 1 unit = 1 m for large spans, or animate the set around the actors (same page)                                                                                            | Game engines: cm. Very large animated spans with precision trouble: meters or move the world. Nucleus and Bifrost assume 1 unit = 1 m regardless.                                                                                                                      |
| PySide import                              | 2027 doc suggests `try: PySide6 except ImportError: PySide2`                                                                         | Fixed issue MAYA-142353: legacy PySide2 fallbacks crashed Maya when PySide2 was on the system                                                                             | 2027-only code: import PySide6 only. Code that must also run on 2024 or older: guarded fallback.                                                                                                                                                                       |
| Referencing when rigs change in shots      | Reference model into rig, rig into animation (AdvancedSkeleton, mTB9Yh_sWKc [00:03:17])                                              | Bungie "explants": rewire the old bones' connections to a new skeleton when animators add or remove components (U_4u0kbf-JE [00:43:40])                                   | Referencing forbids DAG edits in the child. If shots must restructure the rig, explant; otherwise reference and version.                                                                                                                                               |

## Marion Guignolle, Senior Technical Animator, Gearbox Studio Québec (New Tales from the Borderlands, GDC 2023, lfWkJrkhd2U)

The only production account in the sources of what a small team automated end to end: 12 hours of
cinematics in 1 to 1.5 years, more than 2,500 sequences, 102 days of motion capture [00:02:13]
[00:03:50].

- **Every manual step with no added value is a candidate** [00:03:18]. Manual rig import and naming
  for a 12-soldier scene took up to 2 hours; automated mocap import for 12 characters went from
  about a day of animator time to 30 minutes [00:05:31] [00:20:31].
- **Never type what can be generated.** "We all know how everyone follows naming convention, right?
  But we're also human" [00:04:58]. Names, IDs, linked assets and tasks flow from the narrative
  script to the engine and the tracker; "so far, ultimately, nothing has been done by hand"
  [00:15:25]. Agent translation [added]: namespaces and paths come from a manifest
  (`reference(path, ns)` refuses a clash rather than letting Maya append a digit).
- **Put the scene origin where the action is.** A level artist places a volume; Maya loads the
  environment with its center at 0,0,0 and the export lands at the right place in Unreal [00:16:30]
  [00:17:05].
- **One camera rig with a single bone for all cuts**, so one thing is exported and the viewport
  shows exactly the engine cut [00:19:23] [00:19:56].
- **One FBX per character or prop per camera cut**: 2 characters, 4 props, 14 cuts = 84 files; a
  camera range change re-exports everything, so the publish is a diff: green add, blue modified, red
  remove [00:06:04] [00:24:23] [00:24:57] (`publish_diff`).
- **Gates at the point of action**: a warning when opening an approved shot [00:22:11]; a scene
  breakdown showing up to date, missing and extra items; automatic Perforce checkout with standard
  changelist names [00:23:16] [00:23:48] (`breakdown`). "We had a lot of validation from Maya to
  Unreal to prevent people submitting things they could have fixed very easily" [00:29:25].
- **Environment checks, not documentation**, for outsourcers: a custom analyzer reports missing
  Python versions and tools [00:17:40] (the runner logs `session_info` per file).
- **Batch outside the artist's session** for mocap import, retarget and export, run over many
  sequences without opening Maya per shot [00:21:38]. Result: logistics roughly halved, animators
  got 50% more time, no overtime [00:27:11] [00:29:25].
- Mistake they fixed: publishing failed when no Unreal instance was open; the publish learned to
  open one [00:27:44]. Maya is the master for cameras: engine-side tweaks are overwritten on
  re-export [00:28:17].

## Oliver Markowski (Head of 3D) and Kolja Hübschmann (pipeline), RISE Visual Effects Studios (FMX 2023, 8UIW-g1_heg)

390 artists, five offices, about six shows in parallel; USD in production since late 2021 [00:01:42]
[00:12:26].

- **A push pipeline needs pinning**: unversioned master files are symlinks to the latest version; a
  custom resolver remaps to a pinned version; farm renders pin everything [00:22:27] [00:40:35].
  Version and layer info goes in the prim's `assetInfo` so tools read it without a database
  [00:23:01].
- **Mute your own layer and every stronger one by default**, or artists see their published work fed
  back and author edits against objects that live elsewhere: "On default we mute all layers
  self-including and higher order" [00:25:47] [00:26:19] (`mute_own_and_stronger`). Heavy scatter
  and groom layers are auto-muted against viewport crashes [00:26:53].
- **Value clips are not optional at scale**: the stock exporter wrote the full range in one file; on
  Guardians of the Galaxy 3 "all of our software did crash immediately". Per-frame files, one main
  layer, and point data stripped from non-deforming meshes with the USD API. "If you take something
  away from this, you need value clips" [00:36:29] [00:37:03] [00:37:37] [00:56:12].
- **Instanceable is a two-edged default**: right for memory, wrong for anything driven inside an
  asset through the proxy accessor [00:32:34].
- **Purpose is too coarse for animators**: per-asset LOD variants (LOD300 standard, LOD50 proxy) let
  the ground stay accurate while the rest stays light [00:41:43] [00:42:15] [00:43:23].
- **Assembly rig trick**: once proxy accessor connections exist, one scrub writes keyframes into the
  session layer, exported as the animation layer [00:34:50] [00:35:56]. Whether headless mayapy
  authors the same way [verify].
- **Bridge USD cameras to native Maya cameras** for image planes and film back, with explicit
  conversion: "USD attributes are not always the same as the Maya attributes" [00:43:58] [00:45:34].
- Rewriting set assembly on USD cut the code from 1,660 lines to 143 [00:28:34]. Publisher: Pyblish
  (validate, then extract) plus Flowpipe to the farm [00:48:20].
- Dated: Python 2 on Maya 2022, a self-compiled plug-in, the Rodeo resolver (2027 ships the Autodesk
  Asset Resolver), MaterialX caution (2023, RenderMan-specific).

## Steven Roselle, Maya product manager, Autodesk

**Maya Performance Webinar Part 2 (2019, rhtERzmAoUM).**

- **Diagnose before optimizing**: the Profiler shows "really wide" nodes; his character at 1 to 1.5
  fps was doing "a live transfer of UVs, which is not very smart. I removed that from my rig"
  [00:03:41] [00:04:46].
- **Parallelism must be visible**: "the most evenly distributed layout of these nodes across as many
  threads as possible" in the thread view [00:05:17].
- **Frame time = evaluation + drawing**; the three Cached Playback modes are three depths into that
  pipe: evaluation cache (computed values), software (render-ready, system RAM), hardware (uploaded
  to VRAM, fastest) [00:16:38] [00:19:07] [00:19:39]. Headless mayapy has no drawing: its timings
  are evaluation-only [added].
- Orders of magnitude (2019 hardware): wire deformer on about 2 million polygons 10 to 11 fps CPU vs
  120 fps GPU [00:07:18]; a scene 5 fps legacy, 18 fps parallel + GPU, 45 fps cached [00:08:52].
- Stop trading fidelity for speed (proxy characters, stripped lights) before trying parallel, GPU
  and caching [00:10:28]; RISE's LOD variants answer the draw-bound case caching cannot.

**Maya Live Link and ShotGrid to Unreal (GDC 2022, Kw3PzotnLrE, with Daryl Obert and Warren
Trezevant).**

- Live Link streams transforms, lights, cameras, character animation onto a target skeleton, blend
  shapes and timecode [00:03:01] [00:04:05]. It is a one-way push; only the playhead sync is
  bidirectional; engine-side keys on streamed channels are overwritten [00:12:17]. A review aid, not
  a delivery format [added].
- Publish the Maya source with the FBX, never the FBX alone [00:17:12]. Engine-side tools match
  controls to bones by string operations (joint name + `_ctrl`), so naming must be strict [00:24:24]
  [00:26:04].
- Pre-stream checks that code can measure (note's agent translation): the Maya skeleton matches the
  Unreal one by joint names and hierarchy, the scene time unit matches the Unreal sequence rate
  (`cmds.currentUnit(q=True, time=True)`), blend shape targets match morph target names. The rate
  check became E27.

## Yingying, Autodesk (Intro to USD Workflow Ep.1 to Ep.5, Maya Learning Channel, 2024 to 2025)

- Ep.1 (PzfgbzrX8bs): ASWF-style asset: Xform root, `geo` and `mtl` Scopes, `proxy` and `render`
  purpose Scopes, GeomSubsets bound to materials; variants reference assets as payloads [00:02:18]
  [00:07:14]; Reload is how you see teammates' saved layers [00:07:51].
- Ep.2 (kq8O68q10nM): payload is the default arc and the right one [00:02:22]; mark instanceable
  before duplicating [00:04:17]; a shot is a root layer plus department sublayers; "to prevent
  myself from accidentally writing data to a wrong layer, I'll lock all the layers except for the
  layout one" [00:10:36].
- Ep.3 (OWLlAdQ3Uyc): referenced curves need "Allow edits on referenced animation curves"
  [00:03:09]; Euler filter and smooth before caching [00:03:44]; Cache to USD leaves a variant set
  {cache, Maya reference} [00:04:19]; TDs system-lock layers from script (lock type 2) [00:05:26].
- Ep.4 (myl54b4HaNs): light-link expressions need Include All off and Arnold's Legacy Translation
  off on the stage [00:06:58] [00:07:35].
- Ep.5 (oZ4VjueynTY): **each shot has its own root layer with the sequence as a sublayer**, not the
  reverse: full-sequence previews without loading shots, and shot edits override without touching
  the sequence [00:00:55] [00:01:33]; overrides appear as `over` specs [00:08:07] (`layer_specs`);
  reload shared sequence layers before the next shot [00:08:47]; merge options must include
  Animation Data and the frame range [00:06:52].

## Raffaele Fragapane, former supervisor at Animal Logic (Cult of Rig)

**OpenMaya 2 and callback design (Dt5ODNLUuSM, 2017).** The lead skill holds the OM2 idioms (undo
trap, world matrix route, `hasFn`, rotation-order constants); what matters for tool writers here:

- "Long to write, fast to execute" [00:30:41]: OM2 for weights, points and matrices (`skin_weights`
  reads every vertex in one call).
- OM2 "doesn't do anything for the undo for you" [01:17:49]: batch writes are fine headless; GUI
  tools route writes through an `MPxCommand` with a modifier.
- Prototype the body as a plain function, test each small function alone, then promote [00:22:22]
  [00:43:30].
- Verify numerically: the rigorous check is inverse(expected) x computed = identity [01:16:03]; the
  dcc-mcp showcase proves claims with deltas of 0.0 and color drift of at most 1/255. The pipeline
  equivalent: re-import and compare counts, names and bounding boxes [added].

**Maya Parallel Evaluation stream (\_0mb4wIZi80, 2018; rigging digest).** One Python node can
serialize a rig (GIL, unknowable side effects) [00:55:10]; pure MEL expressions are cheap (about 43
microseconds) and impure ones stall [01:07:55]; never drive `frozen` or visibility from an
animatable switch [01:18:26]; rigs need a handful of animation curves to parallelize [01:16:10].
`perf_census` looks for exactly these.

## Autodesk training series (presenters not named)

- "Introduction to Maya Python Plug-ins" (Wf03mSCdh-Q, BZyXe3MhEyI, v1d8fCtIROI, 2012 to 2013): a
  command that changes the scene must be undoable, `doIt` once then `redoIt`, a modifier as the
  queue [00:01:56] [00:04:30]; the undo round trip is the acceptance test [00:11:47]; `flushUndo`
  before unloading a command plug-in [00:06:49]; arguments before flags in Python [00:01:19]. API
  1.0 on screen: `procedures.md` P12 is the 2.0 translation.
- "Introduction to Python Scripting in Maya" parts 1, 3, 5 (eXFGeZZbMzQ, ijMyo-6T8Ow, ZmCYXzsCMO0,
  2013): capture creation returns, `#` names, re-runnable scripts, `objExists` before `addAttr`.
  Foundations; the lead skill carries them.

## Miquel Campos (mGear) and Bungie (David Hunt, Forrest Soderlind), from the rigging batch

- Campos (Data Centric Rigging 025, NfYAaK3wtQs, 2018): save dated profiles to compare later
  [00:05:26]; moving mGear UI hosts under the root space took about 20 to 17 ms per frame
  [00:12:51]; with many characters, parallel and GPU fill the gaps and heavy single-rig optimization
  may not pay [00:18:22]. mGear's own rule: "we serialize everything and we build clean every single
  time" (rDHTdhzKpvI [00:06:42]).
- Bungie (Tools-Based Rigging in Destiny, GDC 2015, U_4u0kbf-JE): **Problem Spotter**: Python checks
  over thousands of files, an XML report, targeted fixes run overnight when no manual QA is needed,
  and a shield in the animator toolbar that turns red when a known problem is in the open scene
  [00:45:21] [00:45:54]. The batch runner plus a registered fix list is that tool. Metadata network
  nodes are the interface between scene and code, with public and do-not-touch groups [00:23:10];
  "don't rely on" naming for chain logic, use markup [00:11:38].

## FlippedNormals, Henning Sanden and Morten Jaeger (Ultimate Guide to Clean Scenes, 2018, ToWRH4IXF7A; modeling digest)

The modeler is the first to "ingest data" into production; downstream breakage traces back to the
file [00:00:58]. What the validation layer inherits: let Cleanup auto-fix only lamina, non-manifold
and zero-length geometry, never triangulate n-gons automatically [00:11:50]; one unchecked Primary
Visibility cost "two days debugging" [00:02:35]; no two objects share a short name [00:18:16];
freeze groups too, except eye groups [00:20:16]; save with Smooth Mesh Preview off [00:24:00];
rebuild through OBJ "nukes everything" [00:08:31], but OBJ also drops UV2, creases, vertex colors
and hierarchy [added in the digest], so batch fixes stay in place.

## Polycount wiki and On Mars 3D (modeling digest)

Vertex count, not triangle count, is the real engine cost: UV seams, hard edges and material changes
duplicate vertices; a hard edge is free on a UV seam (Polycount, Triangle Count vs Vertex Count).
Triangulate before baking and export the same triangulation (Polycount, Triangulation). Budgets come
from screen coverage, in triangles: hero grenade 61k-tri cage to 24k low, background 5k to 10k (On
Mars 3D, YDu9pYMkkSM [00:04:21]).

## Official documentation (Maya 2027 Help, Epic, Unity, maya-usd)

- **FBX is scripted through global state** (Maya 2027 Help, FBX MEL commands): `FBXPushSettings` /
  `FBXPopSettings`; `FBXResetExport` loads the Autodesk Media & Entertainment preset; the split-take
  accumulator "is not automatically cleared ... the caller is responsible for clearing the
  accumulator"; `Take001` always exists; empty ranges still create takes; `FBXRead` reads without
  importing and locks the file until `FBXClose`.
- **How the doc says an FBX is judged**: it reimports into an empty scene with identical normals,
  scale, axis and animation length, and the engine import scale factor is 1.0 (Managing Scenes, FBX
  pages). Counts alone do not prove it: `compare_stats` also compares normal directions, per-mesh
  bounds, units and up axis.
- **FBX Import MEL**: `FBXImportUnlockNormals -v true` avoids the locked normals of non-deformed
  geometry; `FBXImportMode -v add` for namespaces; `FBXImportSetLockedAttribute -v false` before
  importing onto locked channels in batch; `FBXImportConvertDeformingNullsToJoint -v false` keeps
  cluster pivots.
- **FBX Limitations**: tangents and binormals only on all-triangle meshes; non-orthogonal matrices
  dropped; instances get the original's material; custom attributes only from transforms; Bake
  Start/End/Step never stored in presets; no color space carried. **Troubleshooting**: non-deformed
  geometry imports with locked normals; Smoothing Groups on at both ends; Split per-vertex Normals
  only for MotionBuilder 2010 and earlier.
- **FBX Export options**: axis conversion applies to root elements only, animated roots get
  resampled, add a dummy root; Constant Key Reducer needs Auto tangents only off because keys become
  User tangents; the version table still calls FBX 2019.2 the default (stale); keep the log on in
  batch; `MAYA_FBX_LOG_FILENAME` and `MAYA_FBX_LOG_DATETIME_ISO` because parallel sessions collided
  on the log name (What's New in Maya 2025).
- **Game Exporter**: settings saved in the scene automatically; Export Object Set for one character
  among several; bake for engines (constraints do not transfer); Input Connections off with Bake. No
  batch command is documented: script the FBX MEL commands instead [verify whether `gameFbxExporter`
  exposes one].
- **Epic** (FBX Static and Skeletal Mesh Pipelines): FBX 2020.2; the static-mesh pivot is the export
  origin, the skeletal-mesh pivot the root joint; collision `UCX_`/`UBX_`/`USP_`/`UCP_` + render
  mesh name + `_00`, only the first mesh's collision imported per file; sockets need one mesh per
  file; LODs share pivot; only Color and Normal maps auto-connect; one animation per file;
  animation-only import needs an existing skeleton.
- **Unity** (Creating models for animation; Rig tab): at most 4 influences by default; humanoid at
  least 15 bones, T-pose, body-part names; re-import the FBX into Maya to verify; Optimize Game
  Objects drops unmapped transforms unless exposed.
- **References** (Managing Scenes): edits replayed by name and DAG path, never rename or restructure
  a child in use; character sets in the rig file; child history before the parent adds history;
  grouped references double-transform skinned characters; Preserve References off bakes; working
  units reset to cm in each new file; Nucleus and Bifrost hard-code 1 unit = 1 m.
- **maya-usd readme and USD for Maya 2027**: every default trap listed in `procedures.md` P8; stage
  vs import; Edit as Maya and Merge semantics (over on a stronger target, def on a weaker); saving
  USD edits into the Maya file drops layers over 2 GB; relative paths need the Maya scene saved;
  material translation losses; broad resolver search paths slow everything ("Avoid using broad or
  root-level paths").
- **Using Parallel Maya 2027**: first make it right (DG, Serial, Parallel match), then fast;
  evaluator changes last for the session only; GPU Override thresholds 500 (AMD) and 2000 (NVIDIA)
  vertices, `MAYA_OPENCL_DEFORMER_MIN_VERTS`; `ikSystem` disables the EM with a multi-chain solver;
  Profiler buffer 20 MB by default.
- **Devkit What's New 2022 and 2022.1**: `MAYA_DISABLE_ADP=1` opts out of analytics in batch;
  `MAYA_BATCH_STDOUT_LOGGING_LEVEL` (default none) and `MAYA_BATCH_STDERR_LOGGING_LEVEL` (default
  all) take all, info, result, warning, error or none and control what scripts, commands and API
  calls print in batch; API 2.0 `MFnMesh` raises on an empty mesh (check the vertex count first;
  `polyEvaluate` returns a message string when it counts nothing [added, verify]).
- **Python in Maya 2027, Troubleshoot Maya hangs**: batch rendering can hang on localhost name
  resolution; fix `/etc/hosts` with `127.0.0.1 localhost <hostname>` (now a `P.preflight` check).
- **Python in Maya 2027 and the Developer Help** (lead skill for the channels): `scriptJob` and
  `executeInMainThreadWithResult` are GUI-only; PySide widgets must be parented to a Maya widget and
  carry a unique `objectName`; `uiScript` code must be importable at the next startup; `dockControl`
  is gone; modules add search paths only.

## Bridge authors and Steve Theodore (MCP bridges note)

- GG_MayaMCP (Gimbal Goats): keep the agent's server outside Maya ("If Maya crashes, the server
  stays up"); refuse scene replacement with unsaved changes; health check before work.
- chadrik (Chad Dombrova): the agent must see stdout and stderr; he lists "no support for reading
  stdout or stderr, so the agent is blind" as a key flaw of Palmer's server. `mx_bridge` returns
  both, plus Maya's own warnings and errors, on every record.
- dcc-mcp: anything touching `maya.*` on the main thread; per-tool timeouts; suppress modal dialogs
  and snooze AutoSave during agent jobs; prove claims with numbers.
- Theodore (2014, re-test on 2027): no commandPort under `maya.standalone`; `MAYA_SKIP_USERSETUP_PY`
  for reproducible children; run `mayapy` children with an explicit environment to know which code
  is live; string UI callbacks run in the global scope, lambdas bind late, use `functools.partial`.
