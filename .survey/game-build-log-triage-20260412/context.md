# Context: Game Build Log Triage

## Workflow Context
Unity and Unreal teams still spend a disproportionate amount of debugging time in editor consoles, build logs, cook/package output, and command-line runs rather than in polished AI workflows. In Unity, recurring pain clusters around import refreshes, asset/reference breakage, package drift, and build-player failures. In Unreal, the recurring pain centers on UBT/UHT compile errors, cook/package failures, redirectors, plugin/module configuration drift, and Blueprint/C++ handoff problems. These are highly agent-operable because the evidence is file-based, repetitive, and often structured enough to classify into actionable buckets.

Key anchors:
- Unity asset refresh/import behavior: <https://docs.unity3d.com/Manual/AssetDatabaseRefreshing.html>
- Unity version control / text serialization / merge support: <https://docs.unity3d.com/Manual/ExternalVersionControlSystemSupport.html>
- Unity console and log files: <https://docs.unity3d.com/Manual/Console.html>, <https://docs.unity3d.com/Manual/log-files.html>
- Unreal packaging: <https://docs.unrealengine.com/5.0/en-US/packaging-unreal-engine-projects/>
- Unreal redirectors: <https://docs.unrealengine.com/5.0/en-US/redirectors-in-unreal-engine/>
- Unreal logging: <https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine>

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo/indie game developer | Ships features and fixes editor/build failures alone | Intermediate |
| Gameplay programmer | Diagnoses compile, runtime, packaging, and dependency issues | Intermediate–advanced |
| Technical designer | Works across Blueprint/prefab/editor workflows and content references | Intermediate |
| Technical artist | Maintains import settings, asset hygiene, and content pipeline stability | Intermediate |
| Build/release owner | Keeps CI, packaging, and platform builds green | Advanced |

## Current Workarounds
1. **Manual log scanning** — developers search for the first real error in long editor/build logs, but cascade noise often buries the actionable line.
2. **Delete-and-retry rituals** — Unity `Library/` cleanup or Unreal `Intermediate/`/`Binaries/` cleanup are common recovery steps, but they are blunt and time-consuming.
3. **One-off scripts and editor utilities** — teams script repetitive checks for assets, imports, prefabs, BuildCookRun, or plugin state, but these helpers are usually local and undocumented.
4. **Docs + forums + issue trackers** — developers triangulate between official docs, forum threads, Reddit, and issue trackers because the editor message alone is often insufficient.
5. **Spreadsheet/notes checklists** — teams keep setup and release checklists outside the engine to remember platform prerequisites and recurring fix paths.

## Adjacent Problems
- Unity scene/prefab merge conflict cleanup and `.meta`/GUID hygiene.
- Unreal redirector cleanup and content-folder reorganization safety.
- Build pipeline summarization in CI for failed package/cook runs.
- Data workflow drift where designers use CSV/Sheets/DataTables outside the engine.
- Cross-tool debugging overhead across editor, CLI, IDE, docs, issue tracker, and source control.

## User Voices
> "Packaging/cooking logs are huge and the first actionable error is hard to find" is a repeated Unreal workflow complaint implied by the official packaging and logging docs, which both assume developers will inspect verbose build output directly. Sources: <https://docs.unrealengine.com/5.0/en-US/packaging-unreal-engine-projects/>, <https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine>

> "YAML scene/prefab merges are technically possible but still painful in real teams" is a persistent Unity pain reflected by Unity's dedicated documentation for Force Text serialization and Smart Merge. Sources: <https://docs.unity3d.com/Manual/ExternalVersionControlSystemSupport.html>, <https://docs.unity3d.com/Manual/SmartMerge.html>

> "Build/import failures often require Editor.log instead of trusting the GUI" is a recurring Unity debugging pattern supported by Unity's separate Console and log file docs. Sources: <https://docs.unity3d.com/Manual/Console.html>, <https://docs.unity3d.com/Manual/log-files.html>

## Evidence Notes
- This run's normal web search/extract tools returned authentication failures, so the survey leaned on stable official documentation and reproducible ecosystem patterns instead of live community-thread extraction.
- Confidence is **high** for workflow structure and engine documentation, **medium** for community-voice phrasing pending a later live-verification pass.
