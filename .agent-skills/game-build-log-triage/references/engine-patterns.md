# Engine Patterns for Game Build Log Triage

Use this reference when the raw prompt contains engine-specific error strings but not much surrounding explanation.

## Unity heuristics

### Common root-cause signals
- `CS0246`, `CS0103`, missing namespace/type → missing package, bad asmdef reference, scripting define mismatch, or moved code
- `Assembly has reference to non-existent assembly` → asmdef/package drift
- `NullReferenceException` flood immediately after a compile/import error → likely cascade noise, not the primary root cause
- `MissingReferenceException`, missing GUID, failed asset import → moved/deleted asset, broken `.meta`, corrupted reference, import setting issue
- Gradle/JDK/SDK/Xcode signing messages → platform SDK / toolchain bucket

### High-value files to inspect
- `Packages/manifest.json`
- `Packages/packages-lock.json`
- `ProjectSettings/ProjectSettings.asset`
- affected `.asmdef` files
- nearby `.meta` files for recently moved assets
- CI config invoking Unity in batchmode

### Good follow-up questions
- Did this start after package updates or asmdef changes?
- Were assets, prefabs, or folders renamed/moved recently?
- Which platform target is failing?
- What is the earliest compiler error before runtime exceptions appear?

## Unreal heuristics

### Common root-cause signals
- `UnrealHeaderTool failed`, UPROPERTY/UCLASS/USTRUCT reflection complaints → compile-reflection bucket
- `Unable to instantiate module`, plugin/module load failures, `.Build.cs` or target-rule errors → package-plugin-config bucket
- `Cook failed` after missing asset warnings → likely asset-reference or build-pipeline-state bucket; find the earliest missing asset line
- redirector warnings or failures after asset moves/renames → asset-reference bucket
- Visual Studio/toolchain/SDK missing messages → platform-sdk bucket

### High-value files to inspect
- `.uproject`
- `Source/*/*.Build.cs`
- `Source/*/*.Target.cs`
- plugin descriptor files (`.uplugin`)
- AutomationTool / BuildCookRun command section in CI logs
- recently renamed asset/class/module paths

### Good follow-up questions
- Did the failure begin after renaming classes, assets, or folders?
- Is the first hard error from UBT, UHT, AutomationTool, or cook output?
- Did plugin enablement or target platform change?
- Is the log from local editor packaging or CI?

## Anti-patterns to avoid
- Do not recommend deleting caches as the first move unless the log already points to poisoned build state.
- Do not treat every repeated exception as a separate bug.
- Do not jump to performance advice; this skill is for build/editor/runtime-startup blockers.
- Do not promise a fix when the prompt only contains a mid-stream excerpt.
