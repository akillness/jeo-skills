---
name: game-build-log-triage
description: >
  Triage Unity and Unreal Engine editor, build, package, cook, compile, and CI
  logs into the first actionable failure, likely subsystem, and next debugging
  steps. Use when a game project fails to build, cook, package, import assets,
  compile scripts/code, or throws noisy editor/runtime errors, even if the user
  only shares raw log text or says "Unity build failed", "Unreal cook error",
  "Editor.log", "UHT/UBT failed", or "packaging started breaking after asset
  moves".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories that contain Unity or Unreal logs, CI output, package or
  cook transcripts, or error excerpts. Works as a read-first debugging workflow,
  not as an automatic fixer.
metadata:
  tags: game-development, unity, unreal, logs, debugging, build-failures, ci, triage
  version: "1.0"
  source: akillness/oh-my-skills
---

# Game Build Log Triage

Use this skill to turn noisy Unity and Unreal logs into a short, prioritized debugging brief.

The goal is not to explain every line. The goal is to find the **first non-cascading failure**, identify the most likely subsystem, and tell the user what to inspect next.

Read [references/engine-patterns.md](references/engine-patterns.md) before classifying unfamiliar engine-specific errors.

## When to use this skill
- Unity build, import, compile, package, or play-mode startup failures
- Unreal build, UBT/UHT, cook, package, shader, plugin, or module failures
- CI logs from game projects where the raw output is long and noisy
- Asset moves, redirectors, missing references, `.meta`/GUID, module, or plugin breakages
- Users who provide `Editor.log`, package output, BuildCookRun logs, stack traces, or console excerpts and want the next debugging steps

## Instructions

### Step 1: Confirm the engine and log scope
1. Detect whether the material is mainly **Unity**, **Unreal**, or **mixed/unknown**.
2. Record the log source when visible:
   - Unity: `Editor.log`, Console output, package manager output, player build output, CI transcript
   - Unreal: UBT/UHT output, cook/package logs, Output Log, Message Log, crash log, CI transcript
3. Identify the time window or failing command if present.
4. If the log is huge, focus first on:
   - lines containing `error`, `exception`, `fatal`, `failed`, `UHT`, `UBT`, `NullReferenceException`, `MissingReferenceException`, `Cook failed`, `AutomationTool exiting`, `Script compilation error`
   - the first error cluster before a flood of repeated follow-on errors

### Step 2: Find the first actionable failure
Work top-down and separate **root-cause candidates** from **cascade noise**.

Use this decision order:
1. **Hard stop / fatal line** — first line that clearly aborts the run
2. **Configuration or dependency blocker** — missing module, SDK, package, plugin, target, or assembly definition
3. **Compile/reflection blocker** — C# compiler error, UHT/UBT error, macro/reflection issue, missing symbol, duplicate class, circular dependency
4. **Asset/reference blocker** — missing asset, redirector fallout, GUID/meta mismatch, bad import, broken prefab/Blueprint reference
5. **Environment/platform blocker** — Android/iOS/console SDK issue, signing/provisioning, toolchain path, unsupported target
6. **Secondary noise** — repeated exceptions, retries, or downstream "could not complete" messages

Do **not** summarize 20 symptoms as if they are 20 causes.

### Step 3: Classify the failure bucket
Map the log to one primary bucket and optional secondary bucket.

**Primary buckets**
- `compile-code`
- `compile-reflection`
- `asset-reference`
- `package-plugin-config`
- `platform-sdk`
- `build-pipeline-state`
- `runtime-startup`
- `unknown-needs-more-context`

**Typical Unity mappings**
- `CS0246`, `CS0103`, `Assembly has reference to non-existent assembly` → `compile-code` or `package-plugin-config`
- `MissingReferenceException`, `NullReferenceException` during import/build, missing GUID/meta issues → `asset-reference`
- Package Manager resolution failures, invalid asmdef references, scripting define mismatch → `package-plugin-config`
- Android SDK/JDK/Gradle/Xcode signing failures → `platform-sdk`

**Typical Unreal mappings**
- `Unable to instantiate module`, missing plugin/module, bad `.Build.cs`, target rules failures → `package-plugin-config`
- UHT/UObject/reflection macro errors, generated code issues → `compile-reflection`
- `Cook failed`, missing content, redirector/moved asset fallout → `asset-reference` or `build-pipeline-state`
- Visual Studio/toolchain/SDK/platform packaging blockers → `platform-sdk`

### Step 4: Produce the triage brief
Return a concise report with this exact structure:

```markdown
# Game Log Triage

## Engine
- Unity | Unreal | Mixed/Unknown

## Log scope
- Source: ...
- Failing command/stage: ...
- Confidence: high | medium | low

## First actionable failure
- Line or excerpt: `...`
- Why it matters: ...
- Why later errors look secondary: ...

## Classification
- Primary bucket: ...
- Secondary bucket: ...

## Most likely root cause
- 1-3 sentence explanation grounded in the log

## Next checks
1. ...
2. ...
3. ...

## Files / settings to inspect
- ...
- ...
- ...

## Safe follow-up commands
```bash
# optional read-only inspection commands only
```

## What not to do yet
- Avoid shotgun cleanup or broad asset deletion until the primary blocker is verified
```

### Step 5: Tailor the next checks to the engine
**For Unity, prefer checks like:**
- `Packages/manifest.json`, `Packages/packages-lock.json`
- `.asmdef` references and scripting define symbols
- `ProjectSettings/`, platform build settings, signing/toolchain paths
- recent asset moves, `.meta` files, GUID stability, prefab/scene references
- the first compiler error before any `NullReferenceException` flood

**For Unreal, prefer checks like:**
- `.uproject`, plugin enablement, `Source/*/*.Build.cs`, target files
- first UBT/UHT error before package/cook fallout
- redirectors, missing assets, moved content, generated code mismatches
- platform SDK/toolchain prerequisites and AutomationTool stage
- whether the failure started after renaming classes/assets or changing modules/plugins

### Step 6: Escalate carefully when evidence is weak
If the log excerpt is too short or starts mid-cascade:
1. Say that confidence is low.
2. Ask for the earliest error cluster or the failing command section.
3. List the minimum extra context required:
   - first 50-150 lines around the first error
   - engine version
   - target platform
   - whether the breakage followed code/package/asset/plugin changes

Do not pretend certainty from a truncated excerpt.

## Output format
Always return a short debugging brief, not a stream-of-consciousness analysis.

Required qualities:
- prioritize the first actionable blocker
- separate root cause from cascade noise
- keep the report under roughly 250-400 words unless the user asks for more
- include file paths/settings to inspect when the engine suggests them
- keep shell suggestions read-only unless the user explicitly asks for fixes

## Examples

### Example 1: Unity compile + package drift
**Input**
> Unity build failed after we updated a package. The log shows `CS0246: The type or namespace name 'InputSystem' could not be found` and then dozens of `NullReferenceException` lines.

**Output sketch**
- Engine: Unity
- First actionable failure: `CS0246` for `InputSystem`
- Classification: `package-plugin-config`
- Root cause: package or asmdef reference drift is blocking compilation; the later null refs are likely fallout from the failed compile/import state
- Next checks:
  1. confirm `Packages/manifest.json` still includes the Input System package
  2. inspect asmdef references for the affected assembly
  3. verify scripting define symbols or package migration notes

### Example 2: Unreal cook failure after asset moves
**Input**
> Unreal cook started failing after we renamed folders. The log shows `Cook failed` and multiple missing asset warnings.

**Output sketch**
- Engine: Unreal
- First actionable failure: earliest missing asset / redirector-related line before `Cook failed`
- Classification: `asset-reference`
- Root cause: moved content likely left broken references or redirectors that were not fixed up before cook
- Next checks:
  1. inspect moved asset paths and redirectors
  2. run a read-only audit of referenced missing assets from the log
  3. verify whether plugin/content paths changed with the rename

### Example 3: Unreal UHT blocker
**Input**
> CI says `UnrealHeaderTool failed` after a refactor.

**Output sketch**
- Engine: Unreal
- First actionable failure: first UHT reflection/macros error, not later AutomationTool exit lines
- Classification: `compile-reflection`
- Root cause: header/reflection metadata mismatch during generated code step
- Next checks:
  1. inspect the referenced header and macro usage
  2. compare recent renamed classes or moved modules
  3. verify generated-code dependencies in the owning module

## Best practices
1. **Lead with the earliest blocker** — game-engine logs cascade badly.
2. **Name the subsystem** — compile, reflection, asset/reference, plugin/config, or platform SDK.
3. **Prefer specific inspection targets** over generic advice like "rebuild everything."
4. **Keep remediation safe-first** — read-only commands and targeted checks before destructive cleanup.
5. **Treat asset moves as high-suspicion events** in both engines.
6. **Explain confidence** when the excerpt is partial or noisy.
7. **Use engine language the team already uses**: asmdef, GUID/meta, UBT/UHT, redirectors, BuildCookRun, etc.

## References
- [Unity Console](https://docs.unity3d.com/Manual/Console.html)
- [Unity Log Files](https://docs.unity3d.com/Manual/log-files.html)
- [Unity Version Control / Smart Merge Support](https://docs.unity3d.com/Manual/ExternalVersionControlSystemSupport.html)
- [Unreal Logging](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
- [Unreal Packaging Projects](https://docs.unrealengine.com/5.0/en-US/packaging-unreal-engine-projects/)
- [Unreal Redirectors](https://docs.unrealengine.com/5.0/en-US/redirectors-in-unreal-engine/)
