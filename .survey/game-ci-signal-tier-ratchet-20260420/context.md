# Context: game-ci-signal-tier-ratchet

## Workflow Context
Game build automation stops being one lane as soon as packaging, signing, or platform-specific outputs get expensive. Official GameCI docs already separate test, build, and deploy flows; Unity Build Automation exposes auto-build, auto-cancel, scheduled builds, and grouped build targets as separate operational surfaces; GitHub Actions environments/concurrency support protected release lanes; and Unreal build operations still frame shipping as Build → Cook → Stage → Package → Deploy → Run. Across those sources, the recurring operational gap is not another CI tool, but explicitly naming whether the current job is fast branch validation, a heavier nightly/package-candidate build, or a protected release/certification candidate.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Technical lead / build engineer | Keep Unity/Unreal pipelines trustworthy while separating fast developer signal from slow packaging and release work | Intermediate to advanced |
| Small-studio developer or contractor | Turn manual demo/review/release steps into a sane pipeline without overengineering it | Intermediate |
| Release engineer / producer-adjacent operator | Decide when candidate builds need approvals, artifact retention, signing, or certification-specific checks | Intermediate |
| QA / external review coordinator | Consume nightly/package candidates and release candidates without artifact naming confusion | Intermediate |

## Current Workarounds
1. One giant workflow with `if:` branches for PR, nightly, and release behavior, so stage split exists on paper but signal tiers remain blurry.
2. Commit-triggered CI for compile/tests while packaging and candidate labeling happen manually or only in a nightly job.
3. Self-hosted Windows/macOS agents kept alive as “pet” runners because Unity licenses, SDKs, platform modules, and cached assets are hard to recreate cheaply.
4. Manual promotion: CI emits artifacts, then humans decide what counts as a nightly candidate or release candidate and rename/upload outside the pipeline.
5. Cache busting or workspace deletion used as recovery when branch validation and heavier package lanes contaminate the same runner state.

## Adjacent Problems
- Cache-policy drift makes teams conflate stateful runner cleanup with real signal-tier design.
- Platform preflight failures appear late because signing/SDK checks sit only in the slow packaging lane.
- Artifact/release hygiene suffers when branch artifacts, nightly candidates, and release candidates share naming/retention rules.
- CI-signal trust drops when every merge waits on heavy packaging instead of a smaller gate lane.
- Build-log triage and structural pipeline questions get mixed together.

## User Voices
- GameCI users share scheduled "nightly build" workflows that also auto-publish a prerelease tagged `nightly`, showing teams already invent a package-candidate lane even when the workflow model does not name it clearly. Source: https://github.com/game-ci/unity-builder/issues/284
- GameCI users request incremental build artifact caching because unchanged-code builds can drop under five minutes, which is direct evidence that fast branch validation and heavier package lanes need different expectations. Source: https://github.com/game-ci/unity-builder/issues/716
- Self-hosted GameCI users report different targets on the same runner can fail because required modules are missing for a later target, reinforcing that broader package/release lanes should not blindly reuse the same branch-validation environment. Source: https://github.com/game-ci/unity-builder/issues/615
- A Unity floating-license user on Azure DevOps reports the second run cannot reacquire a license after a failed build, showing why teams keep dedicated long-lived runners and avoid treating all signal tiers as identical. Source: https://stackoverflow.com/questions/75062040/azure-devops-pipeline-and-unity-floating-license-server-fails-to-get-license-on
- Unreal practitioners report packaging/cooking can take many hours even for test projects, which explains why teams separate merge-time validation from nightly or release-package work. Source: https://forums.unrealengine.com/t/really-slow-cooking-packaging/614484
