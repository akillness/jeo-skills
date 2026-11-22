# Expert notes: pipeline automation in Unreal Engine 5.8

The judgment behind SKILL.md, by source, with timestamps into the videos ([hh:mm:ss]) or the doc
section. [added] = this skill's own rule or inference; [verify] = a name or behavior no saved 5.8
page states. Nothing here has been run in Unreal 5.8 yet (not installed on 2026-09-24). Per-source
notes are in the project's `notes/pipeline/`, `notes/python/`, `notes/editor-tools/` and
`notes/editor/` (never edited to fit this skill); digests `_digest_pipeline_testing_build.md` and
`_digest_python_mcp_remote.md`; version facts from `sources/unreal-version-deltas.md`.

## Where experts disagree, and what decides

| Question                      | Position A                                                                                                                                                  | Position B                                                                                                            | Deciding condition                                                                                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate before commit            | Epic: pre-commit non-unity build, static analysis, content validation on the changelist's assets, Horde preflight (Ari, 102O0FOEzNY [00:24:51], [00:25:27]) | Fray: teams up to about 20 can commit to main and let the build server go red, then fix fast (KuIWCzujtag [00:40:50]) | Team size and tooling budget: the more people a broken main blocks, the more gating pays                                                                                                                                                       |
| How often red is fine         | Fray: a week of green means the automation misses bugs ([00:39:44])                                                                                         | Riot: disable known failing tests to stay green (3ftOkc-cA7U [00:28:26]); Epic: zero warnings ([00:19:59])            | Not a conflict: red for new failures is healthy, red for known ones destroys the signal. Allow-list legacy errors (`P.new_issues`)                                                                                                             |
| Version control               | Perforce for UGS, Horde, RoboMerge and big binary teams (Ari [00:05:13])                                                                                    | Git, Plastic or SVN for small teams (Ari [00:05:45])                                                                  | Team size and Epic tooling; Perforce needs a case-insensitive server and the typemap before the first add (source control doc)                                                                                                                 |
| Prefixes                      | Epic: `SM_`, `AS_`, `E_`, `F_`, `BI_`, `PPM_`, `FXS_` (naming doc)                                                                                          | Allar: `S_`, `A_`, `E`, `F`, `BPI_`, `PP_` (Allar 1.2)                                                                | One per project, encoded in the validator (`P.CONVENTIONS`); Epic's covers UE5 types                                                                                                                                                           |
| Level names                   | Fray validates an `L_` prefix, Lyra style ([00:23:07])                                                                                                      | Allar: no prefix, `Maps/` folder, suffixes `_P`, `_Geo`, `_Lighting` (Allar 1.2.1, 2.4)                               | The existing project convention                                                                                                                                                                                                                |
| Type folders                  | Allar: never `Meshes/Textures/Materials` (2.6)                                                                                                              | Interchange demo pipeline and Datasmith create them (Oq6KbrqkGnw [00:26:35]; Datasmith doc)                           | Project style; this skill defaults to one folder per asset under a category                                                                                                                                                                    |
| Modify before or after import | Interchange PM: disable factory nodes so the asset is never created ([00:31:33])                                                                            | Datasmith doc: do most edits after import, pre-import scripts are bypassed on reimport                                | Interchange stores the pipeline stack on the asset and reuses it on reimport (Interchange doc); Datasmith scene edits do not persist                                                                                                           |
| Material instances on import  | Post-import: materials off, one `MI_` per slot from an explicit parameter map (Bardoux's sidecar and "extra mile", MjjkWH0eT3U [00:06:30], [00:11:40])      | Interchange: Material Import = Import as Material Instance, Parent Material = master (Interchange doc, Materials)     | Whether the master's parameter names match what Interchange fills; it fills only known parameters by the parent's names (Interchange note, agent translation). Custom masters, packed maps, several slots: post-import (`route="post_import"`) |
| Import route for FBX          | Bardoux disabled Interchange for FBX in 5.5 after skeletal imports lost their physics asset (MjjkWH0eT3U [00:42:07], [00:52:40])                            | 5.5 to 5.8: Interchange production ready for asset import, default for level import since 5.6 (release notes)         | 5.8: Interchange with an explicit pipeline; fall back to the legacy importer only for a regression seen on the installed build                                                                                                                 |
| Tests on packaged builds      | Fray: little value except platform input, platform APIs, performance ([01:26:37])                                                                           | Gauntlet `UE.TargetAutomation` on devices (Gauntlet doc); Riot routes tests to target hardware ([00:11:30])           | Platform-specific code and packaging risk; packaged smoke at a lower cadence (weekend tier)                                                                                                                                                    |
| CI system                     | Keep Jenkins or TeamCity if it works (Ari [00:18:16])                                                                                                       | Horde for BuildGraph parallelization, UGS badges, device pools ([00:18:51])                                           | Existing investment vs starting fresh                                                                                                                                                                                                          |
| What "smoke" means            | Epic flag: each test under 1 s, runs at every start (automation doc)                                                                                        | Fray: a slow walk-through with a clean-console check ([02:05:44])                                                     | Vocabulary: tag Fray-style tests Product or Stress                                                                                                                                                                                             |
| Performance gates             | Fray: advisory trends only ([01:29:38])                                                                                                                     | Automated Perf Testing and Horde trends exist (5.5, 5.8 notes)                                                        | Hard gates only on cheap-to-fix budgets (memory caps), trends for frame time; scenario-unreal-performance owns the numbers                                                                                                                     |
| Nanite everywhere             | Nanite doc: wherever possible; VSM doc: low-poly too                                                                                                        | Oztalay: not everything can be Nanite (S2olUc9zcB8 [00:34:33]); Mac: Nanite and VSM only on M2+ (macOS doc)           | Blend mode, deformation and target platform, never triangle count (`P.nanite_decision`)                                                                                                                                                        |
| Collision on every mesh       | Allar 4.4: all meshes have proper collision                                                                                                                 | Common practice: decorative clutter and vistas without collision [added]                                              | Gameplay relevance: default required; `collision_exempt_classes` (vista, foliage, deco) is a project decision written in the rules                                                                                                             |
| UI for Python tools           | Bardoux: PySide `.ui` files ([00:11:13])                                                                                                                    | Jamie Dale and the Python doc: Editor Utility Widgets, PySide unsupported (0guOMTiwmhk [01:36:48])                    | Studio already on PySide from Maya: PySide; otherwise EUW calling Python through Execute Python Script                                                                                                                                         |
| Mac signing                   | Automatic signing with the Xcode login on dev machines                                                                                                      | `.p8` App Store Connect key on build machines and for QA (Josh Adams, uxdEt9XXKb8 [00:13:34])                         | Who builds: a human with an Apple account, or an unattended agent (the agent: `.p8`)                                                                                                                                                           |

## The Interchange product manager (Oq6KbrqkGnw, Unreal Fest 2024, UE 5.4)

- Flow: translator makes read-only translated nodes; pipelines create or edit factory nodes;
  factories make assets [00:03:08], [00:22:40].
- Presets are team policy: copy the engine pipeline into the project, set default, visibility and
  lock per property, point the project stack at it [00:10:59] to [00:16:00].
- The dialog remembers the last settings per pipeline, "Reset Selected Pipeline" shows the preset's
  real defaults [00:13:48]; scripted imports use the pipeline defaults [00:39:28]. This is why the
  skill always passes the preset explicitly.
- Stack order is execution order; a tweak pipeline must sit below the one that creates the nodes
  [00:20:22].
- Filter by disabling factory nodes and follow Factory Dependencies to drop the materials and
  textures only that mesh needed [00:31:33], [00:32:39].
- Graph Inspector pipeline at the end while developing; forgetting it made it pop up during an
  automated import in the demo [00:28:18], [00:40:00].
- `AssetImportTask` already routes through Interchange for supported formats; direct calls use the
  Interchange Manager with override pipelines [00:37:11] to [00:38:19].
- Runtime import is limited (no Nanite build or collision generation at runtime in 5.4) [00:40:47].
- Consequence the doc spells out: reimport remembers the pipeline stack and options used
  (Interchange doc, Reimporting Assets). A preset edited later does not reach assets already
  imported; the skill versions the policy (`plan_imports(..., policy=)`) and reimports with the
  preset in `override_pipelines` [added rule from the doc fact].

## Jamie Dale and Aaron Carlisle, Epic (0guOMTiwmhk, Inside Unreal 2019, UE 4.22)

- `set_editor_property` is a Details-panel edit with pre and post change hooks; setting the
  attribute is a code write that rebuilds nothing [00:20:52] to [00:21:59].
- Scripted imports take class-default options, "not the last run of the import": set every option
  that matters [01:26:38].
- The editor holds a write lock on loaded assets; a separately spawned import may not save them;
  remote execution into the running editor avoids it, and Epic used it from Maya [01:16:47] to
  [01:17:49].
- Commandlets load fewer modules: not everything is exposed headless (Aaron [01:23:04]).
- Missing function usually means a plugin not enabled [00:36:20]; returned arrays are
  `unreal.Array`, wrap in `list()` [00:42:17]; Developer Mode writes a stub `unreal.py` of about 10
  MB for the exact plugin set [01:12:10].
- In script-exposed C++, report errors as script exceptions, never `check()` [01:04:35]. Outdated:
  Python 2.7, `GlobalEditorUtilityBase`, legacy FBX defaults.

## Andrew Fray (KuIWCzujtag, Inside Unreal, published 2026, recorded on 5.5)

- Measure mean time to resolve, not bug count [00:09:48]. Start with data validation, then a few
  smoke tests, actor tests only for the most fragile system [02:01:26].
- About 30 to 40 percent of bugs trace back to something an asset validator could catch; write one
  per real bug [00:35:40]. `CanValidateAsset` runs before the asset loads: keep it cheap so many
  validators stay affordable [00:31:47].
- Adopting mid-project: grind through existing errors or allow-list them so only new ones fail the
  build [00:36:59] to [00:38:07]. Build failures are thanks, not blame [00:40:17].
- Any error log fails an automation test; a smoke test needs a clean console and a 0.5 to 1 s settle
  [01:04:47], [01:03:07]. Follow each smoke failure with a fire test, usually a validator; fire
  tests should fail more often than smoke tests over time [01:17:11], [01:18:48].
- See each test fail for the right reason before fixing [01:46:04]; review AI-written tests ("put
  this in claude.md and code review what it produces") [02:02:02], [02:07:43].
- Blueprint validators were broken in 5.4 to 5.6 with a fix promised for 5.7 [00:27:43]: Python
  validators sidestep it [verify 5.8].
- Performance tests advisory, never pass or fail at 29.9 fps [01:29:38]; tier cadence push, build,
  weekend, parallelize long suites [01:31:46], [01:55:36]; push when you can watch for about an hour
  [01:56:41].

## Zack Hamilton, Riot Games (3ftOkc-cA7U, Unreal Fest Gold Coast 2024)

- BuildGraph runs identically on a laptop and on CI, which is how the build system gets debugged
  [00:25:15]. UAT is the workhorse, UBT rarely touched [00:08:13].
- Gauntlet `RunUnreal -build` says where the build is (editor, local cook, downloaded binaries), not
  what to build [00:13:16].
- Minimal test worlds [00:20:33]; a functional test's time limit doubles as a speed assertion
  (expect 3 s, limit 4 s) [00:26:46]; Blueprint functional test names are actor labels [00:22:12];
  disable known failing tests to keep the signal [00:28:26].

## Ari Arnbjörnsson, Epic (102O0FOEzNY, Unreal Fest 2024; S2olUc9zcB8 myth-busting, 5.4)

- Engine folder at the workspace root, projects in `Default.uprojectdirs` [00:14:08]; shallow, ASCII
  workspace paths [00:06:20].
- Resave packages after an engine upgrade, or every load pays the PostLoad upgrade path forever
  [00:10:13].
- Zero warnings and zero errors per build [00:19:59]; content validation in commandlet mode on only
  the assets about to be submitted [00:24:51]; stay 20 to 30 minutes after a submit [00:39:07].
- Virtual assets only with full DDC layers, submitted through Unreal [00:34:29]; no feature branches
  for content, Game Feature Plugins instead [00:11:35].

## Josh Adams, Epic (uxdEt9XXKb8, Unreal Fest Seattle 2024, 5.4 to 5.5)

- "Xcode is responsible for making the final app" [00:04:22]; "whether or not you edit in Xcode, we
  still need to use Xcode to actually make the apps" [00:03:33]. That a content-only
  (Blueprint-only) project therefore needs full Xcode to package is the notes' inference, not his
  words [verify with a content-only BuildCookRun].
- The editor's Cook command only cooks; staged data is what reaches the app [00:19:14]; "skipcook is
  not the same thing as not having cook" [00:20:20]; `-package` on Apple copies the finished `.app`,
  `-distribution` makes an `.xcarchive` and dSYMs, `-archive` copies the result elsewhere [00:19:48]
  to [00:22:31].
- Build machines sign with a `.p8` key checked into source control, smallest sufficient role
  [00:13:34], [00:14:06]; regenerate project files after signing, asset or framework changes when
  building from Xcode (command-line builds regenerate) [00:28:26].
- Quarantine spreads through zips sent over chat: remove it before unzipping [00:16:13]. UBA helpers
  need the exact same Xcode build number [00:44:22].

## Christophe Bardoux, M2 Animation (MjjkWH0eT3U, Unreal Fest Bali 2025, UE 5.5)

- No manual drag and drop: scripts import to the right place with the right name because other tools
  depend on it [00:09:14].
- FBX cannot carry material descriptions: a JSON sidecar per asset lists slot, channel and texture
  path [00:06:30]; the import script "does the extra mile" and reconnects the material [00:11:40]
  (this skill: instances of the master, `texture_params`).
- Post-import settings artists should not think about (high precision UVs, Nanite fallback) are set
  by script [00:13:21]; name files by asset so scripts find skeletons by convention [00:29:56].
- Surface on the static mesh, copy materials to the skeletal mesh by slot name [00:21:30];
  per-department levels and sub-sequences [00:23:01].
- Ask artists how they work before automating [00:54:20].
- Perforce "mostly takes care of itself", but M2's scripts check that the levels they manipulate are
  checked out and stop if not [00:55:27]: the skill's `require_checkout` rule (checkout per chunk,
  SC01 and stop on failure). 5.8's PythonScript commandlet enables source control before the script
  runs (5.8 notes), and ResavePackages needs `-autocheckout` under Perforce (naming doc).

## Matt Oztalay, Epic (m6mJ9r7ytks GDC 2024; S2olUc9zcB8 [00:32:54]; DxBKmQ-0kfw Unreal Fest 2026)

- Undo is the first feature of an editor utility: one transaction around the batch [00:05:10]; set
  Supported Classes on every action utility [00:03:31] (a validation error in 5.8); Editor Utility
  Tasks must call Finish Executing Task and poll Was Cancel Requested [00:16:19] to [00:19:14].
- When Blueprint cannot reach a property or pin, a few lines in a C++ `UEditorSubsystem` fix it
  [00:13:39].
- "If it can be Nanite it should be Nanite" does not mean Nanite fixes everything; not everything
  can be Nanite [00:32:54], [00:34:33]. Set fallback settings on every Nanite mesh: fallbacks feed
  ray tracing, complex collision and non-Nanite platforms (DxBKmQ-0kfw [00:37:15]).

## Sam Deiter and "Ed", Epic Education (k0tgmrBuIJc, 5.8)

- The MCP plugin has no tools of its own; "connected but can do nothing" was the missing Editor
  Toolset plugin [00:05:26], [00:18:13].
- List, confirm, then act on batch jobs (meshes under 1,000 vertices without LODs: list first)
  [00:52:23]; name the exact asset [00:28:27]; one task per prompt [00:29:02].
- `describe_toolset` payloads can blow the context (Niagara "almost a quarter of a million")
  [00:46:04]; a simple material in about a minute is the health signal [00:48:23].
- Guard rails in the build (an error on any Event Tick use) [00:57:19].

## Epic MCP and PCG team (lDf_y-YPELo, Unreal Fest Chicago 2026)

- Tool design: clean names, CRUD completeness with list functions, composable small tools,
  informative errors, async results for long work [00:24:54] to [00:28:00] (the P4 toolset follows
  it: one chunk per call, a list-style validate tool).
- Skills carry only novel, durable, frugal information [00:30:00] to [00:32:06]; the model misjudged
  an all-white screenshot as fine [00:17:29], hence `ue_review.image_checks` on every frame.

## Warren (name as spoken), Epic (XapljWLWnsk, Unreal Fest 2022, 5.1) and the Remote Control doc

- Property names in the editor are labels; get real names first [00:15:03]; start from
  `GET /remote/info` [00:13:46].
- 5.8 blocks remote UFUNCTION calls by default with an allow list (5.8 notes): this skill does not
  trigger imports over Remote Control.

## Michael Allar (ue5-style-guide) and Epic's naming page

- Naming and layout "treated as law" (1, 2); identifiers `[A-Za-z0-9_]+` (00.1); everything under
  `Content/<Project>/` (2.2); no type folders (2.6); textures power of two except UI, at most 8192
  (7.1, 7.3); all meshes with collision and correct scale (4.4, 4.5). UE4-era parts: Cascade,
  Matinee, lightmap rules for fully dynamic Lumen projects.
- Epic: `[Prefix]_[AssetName]_[Descriptor]_[Variant]`; renames leave redirectors; fix up with
  right-click Fixup or `-run=ResavePackages -fixupredirects -autocheckout -projectonly -unattended`
  (naming doc).

## Epic documentation (5.8 pages)

- **Data Validation:** two rule types (`IsDataValid`, `UEditorValidatorBase`); the commandlet runs
  C++ rules only by default; Python validators register with `AddValidator`; every path of
  `ValidateLoadedAsset` must call passes or fails; rules run on save by default. 5.8 cvar
  `DataValidation.ReportCookValidationStats` (on by default) reports each validator's duration
  during cook: the measured side of Fray's "keep CanValidateAsset cheap" (cross-source in the data
  validation note).
- **Automation and Gauntlet:** `-ExecCmds="Automation RunTest ...;Quit"`, `-ReportExportPath`;
  PythonAutomationTest discovers `test_*.py`; the editor does not tick during Python, use latent
  commands; expected errors, screenshots and image comparison; Gauntlet built-ins `UE.BootTest`,
  `UE.EditorAutomation`, `UE.TargetAutomation`, resume up to 3.
- **UAT:** BuildCookRun stages Build, Cook, Stage, Package, Deploy, Run (Package is its own stage:
  no `-package`, no packaged app); "do not hand-author long command lines": build a custom launch
  profile once and copy everything after `BuildCookRun` from the Output Log (`P.buildcookrun_diff`
  compares ours against it); `-CmdLineFile=` for long lists; cook on the fly needs `-filehostip`.
  Iteration: the cook commandlet alone (`-run=cook -targetplatform=Mac`) catches cook errors without
  packaging; `-cookincremental` (5.6, Beta in 5.8) cooks incrementally against Zen (version deltas).
- **Interchange:** option names (collision prefixes, Build Nanite, LOD groups, Material Import as
  instance with Parent Material, Detect Normal Map, Flip Green Channel, Vertex Color Import Option
  Replace, Ignore or Override); reimport remembers the stack; material reassignment on reimport
  conflicts removed; Python pipelines derive `InterchangePythonPipelineBase` (sample truncated). The
  pipeline digest's P2 preset sets Vertex Color Import Option to Ignore unless the master uses
  vertex color [added there].
- **Python:** 3.11.8, editor only; `-run=pythonscript` loads no level; `init_unreal.py` and Startup
  Scripts; never move assets with `os` or `shutil`; imports are not undoable. Headless the asset
  registry may still be scanning: `wait_for_completion()` before queries (5.8 batch example). Since
  5.5 a script failure only logs an error unless `-ScriptErrorsAreFatal` (version deltas, Headless
  entry points): exit code 0 is not a verdict, the job's result line is (`P.job_verdict`).
- **Python API 5.8:** `destination_name` ignored under Interchange; `result` deprecated for
  `get_objects()`; `delete_asset` is a force delete that may clear undo; `load_level` closes the
  current level without saving; `create_asset(..., overwrite_existing)`;
  `InterchangeManager.import_asset` and `reimport_asset` return "Array[Object] or None" (saved API
  page, `sources/docs/automation-pipeline__python-api-reference-key-classes.md`). Not stated
  anywhere saved: whether assigning a static mesh LOD group regenerates LODs, and the LOD count per
  group, so the skill counts LODs after setting the group and builds an explicit chain when short;
  its class minimums (3 or 4) are [added] project defaults.
- **Unreal MCP:** loopback `127.0.0.1:8000/mcp`, no authentication, tool calls serial on the game
  thread, Python toolsets on `unreal.ToolsetDefinition`, `ModelContextProtocol.RefreshTools`.
- **macOS requirements:** Xcode 26.0 minimum, 26.1.1 recommended, 26.4 incompatible; Nanite and VSM
  on M2+ (Beta).
- **5.8 release notes:** Zen cooked output store default and `LimitProcessLifetime=false`; batch
  processor; PythonScript commandlet enables source control; SupportedClasses mandatory; Interchange
  dialog rework, uFBX, USD asset import production ready.
- **Datasmith:** scene then finalize; edit after import; `destroy_scene()`; Python 2 samples to fix.
