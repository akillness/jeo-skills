# Context: game-ci-cd-pipeline structural hardening

## Workflow Context
Game teams still treat CI/CD as a mixed workflow spanning reproducible engine setup, cache policy, compile/test/package boundaries, artifact naming, and release handoff. Unity's Build Automation troubleshooting docs call out build failures, clean-build/cached-workspace concerns, and late platform failures as recurring operational issues. Unreal's packaging and logging docs keep packaging and logging as explicit surfaces rather than invisible background details, which reinforces that stage boundaries and evidence capture matter in game pipelines. External pipeline guides aimed at Unity/Unreal teams still emphasize large binaries, long build times, environment sensitivity, and caching/artifact strategy as first-order constraints rather than optional polish.

Primary-source evidence used this run:
- Unity Docs — Troubleshoot common issues • Build Automation • Unity Docs (`direct page retrieval (unverified SSL context)`): https://docs.unity.com/en-us/build-automation/check-build-results/troubleshoot-build-failures/overview
- Unity Scriptable Build Pipeline docs — Cache Server Client (`direct page retrieval (unverified SSL context)`): https://docs.unity3d.com/Packages/com.unity.scriptablebuildpipeline@2.0/manual/CacheServerClient.html
- Epic Docs — Packaging Your Project (`direct page retrieval (unverified SSL context)`): https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project
- Epic Docs — Logging in Unreal Engine (`direct page retrieval (unverified SSL context)`): https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine
- Semaphore — How to Manage CI/CD for Game Development (Unity, Unreal, Large Binaries) (`direct page retrieval (unverified SSL context)`): https://semaphore.io/how-to-manage-ci-cd-for-game-development-unity,-unreal,-large-binaries
- Simon Hesjevik — How to build a CI/CD pipeline for Unity games (`direct page retrieval (unverified SSL context)`): https://www.simonh.dev/post/ci-cd-pipeline-for-unity

Indexed-snippet / discussion evidence used this run:
- Yahoo Japan indexed snippet to Reddit `r/gamedev` thread "what is your CI/CD pipeline setup and how are you handling ..." — snippet shows practitioners comparing engine + CI choices instead of converging on a single standard stack (`Yahoo Japan indexed snippet`, confidence: medium): https://search.yahoo.co.jp/search?p=Unity+Unreal+CI%2FCD+pipeline+cache+artifact+packaging
- Yahoo Japan indexed snippet to Unity Discussions thread "Is there a way to share the package cache per project?" — snippet mentions the Burst package alone being over 800MB and asks about shared/root package cache reuse (`Yahoo Japan indexed snippet`, confidence: medium): https://search.yahoo.co.jp/search?p=Unity+Unreal+CI%2FCD+pipeline+cache+artifact+packaging
- Yahoo Japan indexed snippet to Unreal forum thread "Unreal Build Pipeline Caching" — snippet shows teams explicitly asking how to speed up automated Unreal build pipelines (`Yahoo Japan indexed snippet`, confidence: medium): https://search.yahoo.co.jp/search?p=Unity+Unreal+CI%2FCD+pipeline+cache+artifact+packaging

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo game developer | Keep builds reproducible without building a full DevOps department | mixed |
| Small studio technical lead | Define pipeline stages, caching, and release hygiene across Unity/Unreal | intermediate |
| Contractor / publisher helper | Audit flaky build/release workflows and recommend bounded fixes | advanced |
| Build / release owner | Keep CI signal trustworthy for QA, demos, and launch candidates | intermediate |

## Current Workarounds
1. Keep one giant workflow job that compiles, packages, uploads, and sometimes releases in one blob; this hides the first failing stage.
2. Delete `Library/`, `Intermediate/`, `Saved/`, or similar caches whenever builds get weird; this creates superstition instead of policy.
3. Depend on one developer machine for SDK/signing/toolchain truth, then rediscover missing prerequisites during packaging.
4. Pass around ad hoc artifacts with unclear branch/platform/config naming, which weakens QA and release confidence.
5. Treat one red build log as both the root-cause problem and the whole pipeline problem, instead of separating log triage from structural pipeline fixes.

## Adjacent Problems
- Licensing/auth material for Unity or platform signing can dominate pipeline conversations even when the real issue is stage design.
- Large binaries and engine-specific caches distort ordinary web-app CI advice.
- Build/test/package jobs often mix with launch/demo deadlines, so teams need milestone-aware recommendations rather than generic infra prose.
- Artifact retention and naming are release-ops questions, not only CI syntax questions.

## User Voices
> "I'm curious to hear what some of you are using for your CI/CD, including your game engine of choice. I'm most likely going to use Unity and Gitlab." — Yahoo Japan indexed snippet for Reddit `r/gamedev` result, showing fragmented real-world stack choices rather than one standard workflow. Source: https://search.yahoo.co.jp/search?p=Unity+Unreal+CI%2FCD+pipeline+cache+artifact+packaging

> "The package cache has a lot of items that are already in the shared root package cache. The burst package is over 800MB alone..." — Yahoo Japan indexed snippet for Unity Discussions result, highlighting cache-size pain and reuse questions. Source: https://search.yahoo.co.jp/search?p=Unity+Unreal+CI%2FCD+pipeline+cache+artifact+packaging

> "I have some questions regarding how to speed up an automated Unreal build pipeline. Here's what our build pipeline looks like." — Yahoo Japan indexed snippet for Unreal forum result, showing that teams still ask workflow-structure questions rather than only one-off build fixes. Source: https://search.yahoo.co.jp/search?p=Unity+Unreal+CI%2FCD+pipeline+cache+artifact+packaging
