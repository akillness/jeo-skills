---
name: scenario-unity-expert
description: "Use when an agent drives Unity 6.3 (6000.3) on a Mac for any task: batch mode and -executeMethod jobs, a running editor (the user's GUI editor or a headless one), the Unity CLI and com.unity.pipeline, MCP servers, the Test Framework, command-line builds; when a batch run fails silently, 'Scripts have compiler errors', a capture comes back black or pink, or a result must be proven with numbers and a frame; or when a Unity brief must go to the right scenario-unity-* specialist."
license: MIT
---

# Unity expert (technical director and agent protocol)

Expert Unity work is a loop run against numbers: set the budget, build one stage, measure it, look
at it, fix it, then advance. An agent without a mouse gets there by choosing the right channel for
each action, editing through serialization with explicit saves, and never trusting its own eyes
alone. This skill is that protocol, the shared toolkit every scenario-unity-* skill imports
([`scripts/`](scripts/)), and the map of the team. Target: Unity 6000.3.21f1 (6.3 LTS), URP 17.3,
macOS Apple Silicon. If a sibling skill named here is missing from your available skills, load it
with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**Status (2026-09-24, after blind grading and the refactor):** every toolkit function ran in Unity
6000.3.21f1 here (`tests/code/unity-expert/run_all.sh --live --builds`; results in
`archive/tests/unity-expert/live_results.jsonl`). Every call from before the refactor is unchanged.

## Stance (the expert delta)

1. **One editor per project, and the live editor wins.** "You can't open a project in batch mode
   while the Editor has the same project open" (6.3 Manual). When an editor holds the project, drive
   it ([`ut_live`](scripts/ut_live.py)), never hand-edit `.unity`/`.prefab`/`.asset` YAML: wrong
   fileIDs, invisible until reimport, easy to hit the wrong scene (Unity's unity-cli skill).
2. **A job is only as honest as its result line.** Pass on the `AGENT_RESULT` envelope and the log
   scan, not on "it exited". A compile error in ANY assembly aborts every batch job with "Scripts
   have compiler errors" (observed; the live editor's twin is Safe Mode, which also blocks
   `com.unity.pipeline`).
3. **Numbers before pixels, milliseconds not fps.** 16.67 ms at 60 fps, 33.33 at 30; mobile keeps
   about 65% for thermals (Unity profiling e-book). Editor Play mode is for iteration; the verdict
   comes from a development player on the lowest target device.
4. **Look AND check, and know the capture's lies.** Every frame goes through
   [`ut_review.image_checks`](scripts/ut_review.py) and a contact sheet you open. Epic's lighting
   agent approved an all-white frame (scenario-unreal-expert sources); here batch captures showed
   first-frame white materials, culled 2D lights, bind poses, no Overlay UI and black metals
   (observed by the team): anything wrong only in an Editor capture is re-checked in a player first.
   Agent-built levels come out "90%" done, a shelf in front of a door (Code Monkey, ppFshgFOgXU
   [00:10:52]).
5. **Fix the platform at launch.** Target switches inside a batch job silently do nothing (6.3
   Manual); `-buildTarget`/`-activeBuildProfile` at launch, one process per target. The editor
   reopens on the last active platform (observed): pin it.
6. **Named jobs over eval.** `eval` to explore, a named job for anything repeated: "A written
   command turns that workflow into something deterministic and repeatable" (DgNrgZeJOxQ
   [00:07:41]); generic run-command tools drift (git-amend, VPjo-M6mPkE [00:03:54]).
7. **Tests are the contract.** Give work a failing test and a fence ("It can only touch the card
   data", DgNrgZeJOxQ [00:05:31]); `-runTests` never with `-quit`.
8. **Be honest about visual editors.** Shader Graph, VFX Graph, the Animator window, UI Builder,
   Tile Palette painting and terrain sculpting have no authoring API: use the substitute (HLSL,
   templates with exposed properties, `AnimatorController` API, UXML/USS text, `TerrainData`) or
   name the human path.

## Channels

| Channel                                                                         | Use for                                                                 | Cost (measured here)                                              | Rules                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Batch job** [`ut_run.run_method`](scripts/ut_run.py)                          | anything when no editor holds the project                               | 6 to 13 s per job (editor boot included)                          | `-nographics` by default; `graphics=True` for captures, bakes (never bake with `-nographics`), profiling; `quit=False` for async jobs; an editor that hangs after its result is ended by PID (`grace`, 10 s) |
| **Resident headless editor + AgentKit bridge** `ut_live.start_headless`, `call` | many calls in a row                                                     | boot 5 to 20 s once, then 0.1 to 0.5 s per call                   | holds the project and a license seat; `stop_headless`                                                                                                                                                        |
| **User's GUI editor + AgentKit bridge** `ut_live.call`, `eval`                  | the user has the project open                                           | same code path as headless (not run: no GUI windows during tests) | the user may need to focus Unity once so it compiles AgentKit; never re-open the user's scene without asking; save what you change                                                                           |
| **Unity CLI + `com.unity.pipeline`** `ut_live.cli_*`, `eval` (auto)             | fastest live channel: 151 commands, Roslyn `eval` with no domain reload | eval 0.03 to 0.15 s after a 0.5 to 1.1 s first call               | CLI 1.0.0-beta.11 (portable copy), package 0.7.0-exp.1 installed before the editor opens; blocked by Safe Mode, possibly by a sandbox                                                                        |
| **MCP**                                                                         | only `unity mcp` or a vetted community server                           |                                                                   | Unity's AI Assistant MCP server is deprecated ("Use the Unity CLI instead")                                                                                                                                  |
| **Test Framework** `ut_run.run_tests`                                           | EditMode and PlayMode verdicts, content validation                      | about 14 s per platform                                           | NUnit XML parsed; exit 2 when a test failed (observed)                                                                                                                                                       |

`ut_live.channel(P)` picks `batch`, `bridge`, `pipeline`, or `blocked` (ask the user). "Can't
connect" does not prove the editor is closed: rule out Safe Mode and a sandboxed shell first
(unity-cli skill).

## Establish first

Ask once, then run: target platforms and device class; frame budget (default 60 fps desktop, 30 fps
mobile at 65%); 2D or 3D; pipeline (default URP 17.3, HDRP only for high-end PC or console); quality
tiers; art style; whether the user's editor has the project open; deliverable. Then
[`ut_env.preflight(P)`](scripts/ut_env.py) and `AgentJob.Echo`; write what they report (pipeline
asset, color space, active target, quality level, Enter Play Mode setting, input handler, scripting
backend) into the plan.

## Workflow (the expert loop)

1. **Brief in numbers.** Budgets per platform, resolution, scale, style. GATE: every later check has
   a number to compare with.
2. **Preflight.** License days left, modules, lock state, compile health (one `Echo` job). GATE:
   `ok`, zero compile errors, zero new CS0618 warnings.
3. **Baseline.** `AgentAudit.AuditScene`/`AuditAssets`; captures of fixed bookmarks
   (`AgentCapture.SaveBookmark`); a Play-mode profile if performance matters. GATE: audit errors
   fixed or listed; contact sheet opened.
4. **Build one stage** with small idempotent jobs
   ([`references/writing-jobs.md`](references/writing-jobs.md)): get-or-create, serialized edits,
   explicit saves. Route domain work to the owner (below).
5. **Measure.** Re-run the audit, the tests, `AgentProfile.PlayModeTimings` +
   [`ut_stat.budget_check`](scripts/ut_stat.py), or the build summary. GATE: numbers against the
   brief.
6. **Look AND check.** Same bookmarks, `ut_review.review_capture`, open the sheet, judge with the
   domain skill's critique. GATE: no blank or magenta frame, saturation not collapsed, the change
   visible.
7. **Fix before advancing**, one change at a time; `ut_review.compare` and `ut_stat.compare_frames`
   prove parity or gain.
8. **Deliver with evidence.** Each step with its Unity call
   ([`references/toolkit-map.md`](references/toolkit-map.md)), then **Verified** (what ran, job id,
   number or frame) and **Assumed** (not run, `[verify]`, defaults). Never call a scene, shader,
   level or build done without numbers and a frame you looked at.

## Numbers

| Value                             | Relative to                                                                                | Source                       |
| --------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| 16.67 / 33.33 ms                  | frame budget at 60 / 30 fps                                                                | profiling e-book             |
| x 0.65                            | mobile sustained budget (10.8 ms at 60, 21.7 at 30)                                        | profiling and mobile e-books |
| 6 to 13 s                         | one batch job on this project, editor boot included                                        | observed                     |
| about 14 s                        | one `run_tests` platform run (EditMode 2 tests, PlayMode 1 test)                           | observed                     |
| 60 s (12 s incremental), 114.7 MB | macOS Mono player build of the demo scene (universal)                                      | observed                     |
| 259 s (25 s incremental), 12.2 MB | Web build (IL2CPP, Brotli) of the same scene                                               | observed                     |
| 0.1 to 0.5 s / 0.03 to 0.15 s     | live call through the AgentKit bridge / Pipeline `eval` (two runs)                         | observed                     |
| 30 days                           | Personal license offline window (`license_ok()` reads it)                                  | observed + Unity support FAQ |
| 10 s / 120 s                      | grace before `ut_run` ends a silent editor after its result with / without a shutdown line | toolkit default              |

## Quality gates

- **Measurable:** envelope `ok` plus `compile_errors == []`; audit `counts.error == 0`; NUnit
  `failed == 0` and `total > 0`; `budget_check` verdict pass (warn needs a reason); `gc_check` in a
  development player; `build_summary` result Succeeded, size within budget; lock state recorded.
- **Visual:** every capture passes `image_checks` (no `all_white`, `all_black`, `uniform`,
  `magenta`) and was opened; before/after from the same bookmarks.
- **Habits** ([`references/routing-handoffs.md`](references/routing-handoffs.md) section 6): the
  same `build_target` on every stage; p95 AND worst frame, before and after as two captures of about
  200 frames (YOtDVv5-0A4 [00:17:00]); the verdict from a development player on the target device
  class (ZkvK0mX-id4 [00:10:27]); one development-build run before code is done (only those catch
  off-main-thread Unity calls); size on the shipped output; the scene list checked before each
  build; expected errors `LogAssert.Expect`ed.

## Common mistakes

| Mistake                                                                             | What it looks like                                                    | Fix                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| batch job on a project the GUI editor holds                                         | refused, or a corrupted Library                                       | `ut_live` (the toolkit raises `ProjectLockedError`)       |
| `-quit` with `-runTests`                                                            | no XML, no verdict                                                    | `ut_run.run_tests` (never passes it)                      |
| captures or bakes with `-nographics`                                                | empty frames, "no graphics device", no lightmaps                      | `graphics=True`                                           |
| switching platform or defines inside a job, or pinning the target only on the build | old target or defines; textures re-imported per stage                 | `build_target=` on every stage, or two invocations        |
| `GetComponent<T>() ?? AddComponent<T>()`, `?.` on Unity objects                     | nothing added, `MissingComponentException` next (fake null, measured) | explicit `== null` or `TryGetComponent`                   |
| `AgentJob.List("k") ?? defaults`                                                    | the defaults never apply (empty list, not null)                       | `AgentJob.ListOrNull("k") ?? defaults`, `TryList`, `Has`  |
| sizing a build from BuildReport `totalSize`                                         | gigabytes: IL2CPP's do-not-ship folder counted                        | `build_summary` (output on disk)                          |
| trusting "Access token is unavailable" as a license failure                         | false alarm                                                           | the refusal line is "No valid Unity Editor license found" |
| hand-editing scene YAML while an editor is open                                     | change invisible or lost                                              | live job, then `AgentBridge.SaveAll`                      |
| killing Unity by name                                                               | other agents' editors die                                             | stop by PID only (`stop_headless`, the grace timeout)     |

## Team routing and handoffs

Route by owner: scenario-unity-architecture (code, save data, input), scenario-unity-world-building
(terrain, blockout, streaming), scenario-unity-rendering-lighting (pipeline, lighting, post),
scenario-unity-shaders (HLSL, Shader Graph, renderer features), scenario-unity-vfx (VFX Graph,
particles), scenario-unity-animation (Animator, Timeline, Cinemachine), scenario-unity-2d (sprites,
tilemaps, 2D lights), scenario-unity-ui (uGUI, UI Toolkit), scenario-unity-gameplay (physics, AI,
netcode, audio), scenario-unity-pipeline-automation (imports, Addressables, CI, builds),
scenario-unity-performance (profiling, memory, batching), scenario-unity-mobile (Android, iOS,
stores), scenario-unity-web (Web builds, servers, WebGPU). Full keyword table, persona chains and
the handoff packet: `references/routing-handoffs.md`. Items that fell between two skills in blind
grading (PSO warm-up, GPU Resident Drawer, VFX shaders, NavMesh through doors, foot sliding, uGUI
over UI Toolkit, web fonts, stripping, Addressables duplication, static state) have ONE owner and a
proof in its seams table: put both in the brief. Every packet carries project and channel, brief in
numbers, what was done with its Unity calls, evidence (audit JSON, contact sheet with flags, CSV
verdict, NUnit totals, build summary), Verified, Assumed, open issues, fence. The receiver
reproduces one piece of evidence before building on it.

## Unity 6.3 notes (full list: [`references/unity-6.3-traps.md`](references/unity-6.3-traps.md))

- Render Graph only (Compatibility Mode removed; the define dies in 6.4); `_CLUSTER_LIGHT_LOOP`
  replaces `_FORWARD_PLUS`.
- `FindObjectsByType<T>(FindObjectsSortMode.None)`; `Rigidbody.linearVelocity`/`linearDamping`;
  `[SerializeField]` only on fields; `Lightmapping.TryGetLightingSettings` (the getter throws when
  unassigned, observed).
- Templates run the Input System only; entering Play mode reloads the domain (6.6 flips the default:
  reset statics in `SubsystemRegistration`, unsubscribe on `ExitingPlayMode`); `-createProject`
  without a template is Built-in.
- `Object.Destroy` already calls `OnDisable` on every level of the hierarchy on 6000.3.21f1
  (observed; the deltas say direct children only before 6.4): unregister in `OnDisable` and,
  idempotently, in `OnDestroy`.
- Build Profiles replace Build Settings; no public API creates a profile before 6.5;
  `IPreprocessBuildWithContext` over `...WithReport`; an `EditorUserBuildSettings` change on an
  active platform profile hits all platform profiles; profile texture compression lives in
  `Library/`.
- Pin package versions: the manifest lists Cinemachine 2.10.7 yet a bare `Client.Add` installed
  3.1.7 (observed); IAP 4.15.1 and LevelPlay 8.10.1 lag the docs (IAP 5, LevelPlay 9).
- Web: the URP template ships Brotli, not the Manual's gzip (observed); WebGPU experimental (opt-in
  production from 6.6). Built-in RP deprecated from 6.5.

## macOS specifics

- Editor `/Applications/Unity/Hub/Editor/6000.3.21f1/Unity.app/Contents/MacOS/Unity`; Hub modules
  (Web, iOS, Android) in `.../6000.3.21f1/PlaybackEngines/`; Xcode 26.6 meets the App Store rule.
- Metal only; no CPU lightmapper on Apple Silicon (GPU lightmapper needs graphics); no GPU timings
  in the VFX Graph panel; GPU Frame Time reads 0 on most Editor frames: measure GPU in a player.
- Personal license: sign in to Unity Hub every 30 days (`ut_env.license_ok()`); the toolkit uses a
  portable, checksum-verified CLI ([`references/live-channels.md`](references/live-channels.md)).
- Paths with spaces worked; quote every path. Never ship
  `<Product>_BurstDebugInformation_DoNotShip`. Never kill an editor you did not start.

## Shared toolkit (`scripts/`; exact API in `references/toolkit-map.md`)

`import sys; sys.path.insert(0, "<scenario-unity-expert>/scripts")`.

- `ut_env` (editor, license, `base_project`, `install_agentkit`, lock rule, `preflight`); `ut_run`
  (`run_method(project, method, args=None, timeout=1800, graphics=False, quit=True, build_target=None, grace=None, result_grace=None)`,
  `run_tests`, `build`, `scan_log`); `ut_live` (bridge, headless editor, CLI, Pipeline `eval`);
  `ut_review` (`image_checks`, `compare`, `contact_sheet`, `review_capture`); `ut_stat`
  (`budget_check`, `summarize_csv`, `compare_frames`, `build_summary`).
- C# AgentKit ([`scripts/AgentKit/`](scripts/AgentKit/)): `AgentJob` (`List`/`Dict` never null;
  `TryList`, `ListOrNull` for missing keys), `AgentCapture` (warms materials and 2D lights),
  `AgentAudit`, `AgentBuild`, `AgentProfile`, `AgentBridge`, `AgentJson`.

## References

- `references/toolkit-map.md`: the Unity call behind every toolkit function; the report format
  (Verified, Assumed).
- `references/writing-jobs.md`: how domain skills write AgentKit jobs (skeleton, rules, async jobs,
  findings).
- `references/live-channels.md`: bridge, headless editor, Unity CLI and `com.unity.pipeline`, MCP,
  sandbox and Safe Mode.
- `references/unity-6.3-traps.md`: traps observed by the lead and the writers, documented 6.3 facts,
  deltas corrections, first-run checklist.
- `references/routing-handoffs.md`: routing, seams, persona chains, handoff packet, acceptance
  checks, verification habits.
- [`references/procedures.md`](references/procedures.md): the lead's nine procedures, each with its
  live test and result.
- [`references/gui-paths.md`](references/gui-paths.md): windows and menus for the same tasks.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs, timestamps;
  revision history.
