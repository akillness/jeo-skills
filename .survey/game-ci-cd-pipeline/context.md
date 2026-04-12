# Context: game-ci-cd-pipeline

## Workflow Context
Unity and Unreal teams repeatedly debug failures at the boundary between local development, engine packaging, and CI. Unity's Build Automation docs explicitly tell teams to start by checking error logs, while the Unity Log Files manual points developers at Editor, package-manager, and player logs for diagnosis. Epic's Unreal docs split the problem similarly: logging is the evidence layer, while packaging formalizes the build/cook/stage/package flow that frequently breaks on missing assets, redirectors, plugins, SDKs, or toolchain drift. In practice, CI/CD for game projects adds extra pressure from large binaries, asset churn, caching, platform SDK setup, and long packaging cycles. Semaphore's 2026 CI/CD guide positions Unity and Unreal pipeline work around caching, large-file handling, and reliable automation rather than simple web-app deployment.

Sources:
- Unity Docs — Troubleshoot common issues • Build Automation • Unity Docs: https://docs.unity.com/en-us/build-automation/check-build-results/troubleshoot-build-failures/overview
- Unity Manual — Log files: https://docs.unity3d.com/2022.3/Documentation/Manual/LogFiles.html
- Epic Docs — Logging in Unreal Engine: https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine
- Epic Docs — Packaging Your Project: https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project
- Semaphore — How to Manage CI/CD for Game Development (Unity, Unreal, Large Binaries): https://semaphore.io/how-to-manage-ci-cd-for-game-development-unity,-unreal,-large-binaries

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Indie solo dev | Keep builds shipping while also developing gameplay/content | Mixed; often self-taught CI |
| Small studio tech lead | Standardize Unity/Unreal builds, secrets, caching, artifacts, and release checks | Intermediate to advanced |
| Build/release engineer | Make packaging and smoke-test steps reproducible across branches and platforms | Advanced |
| Contractor or publisher helper | Audit why the team is still doing manual packaging and brittle release steps | Intermediate |

## Current Workarounds
1. Teams read raw `Editor.log`, UBT/UHT, or cook/package logs only after a build is already red, then debug manually.
2. Teams patch recurring issues ad hoc by deleting caches, Intermediate/Saved folders, or local build state without turning the fix into stable pipeline structure.
3. Studios rely on generic CI/CD advice that assumes small web-app repos rather than large game assets, engine licensing, build matrices, and long-running packaging stages.
4. Teams split knowledge between engine docs, forum threads, and copied GitHub Actions snippets instead of using a reusable pipeline-hardening playbook.

## Adjacent Problems
- Build-log triage and pipeline design are related but not identical: one diagnoses a failure, the other prevents repeats.
- Large-binary handling, cache invalidation, and artifact retention policies are structural pipeline concerns not covered by generic deployment skills.
- Packaging errors often hide dependency, redirector, or platform-SDK drift that should become preflight checks rather than repeated emergency fixes.
- Release confidence depends on smoke tests, artifact naming, and branch/environment rules, not just successful compilation.

## User Voices
- Unreal indexed snippet: "Packaging (Windows): ERROR: Cook failed" with the poster explicitly saying they do not know how to fix packaging failures, showing how opaque the pipeline stage is for end users. Source: https://forums.unrealengine.com/t/packaging-windows-error-cook-failed/2298981 (`browser-rendered indexed snippet`, confidence: high)
- Unreal indexed snippet: a migration-related cook failure was traced back to renamed classes, showing that content/code refactors leak into packaging in non-obvious ways. Source: https://forums.unrealengine.com/t/migration-from-4-26-to-4-27-packagingresults-error-unknown-cook-failure/547071 (`browser-rendered indexed snippet`, confidence: high)
- Reddit indexed snippet: a Unity user reports that the common reason builds fail is editor-only code leaking into builds, and the workaround is to isolate Editor code or use conditional compilation. Source: https://www.reddit.com/r/Unity3D/comments/1biakhl/build_fails_with_little_information/ (`browser-rendered indexed snippet`, confidence: medium)
- Reddit indexed snippet: Unreal users repeatedly hit `UnrealBuildTool failed` / UHT-related blockers and ask for steps to narrow them down, indicating recurring manual debugging rather than well-instrumented pipeline feedback. Sources: https://www.reddit.com/r/unrealengine/comments/1b98nvb/please_help_me_ive_tried_everything_i_can_think_of/ and https://www.reddit.com/r/unrealengine/comments/s2k5mr/uhtubt_afficianado_help/ (`browser-rendered indexed snippet`, confidence: medium)
