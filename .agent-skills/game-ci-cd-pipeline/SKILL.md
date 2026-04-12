---
name: game-ci-cd-pipeline
description: >
  Design, audit, and harden CI/CD pipelines for Unity and Unreal projects,
  including build matrices, cache strategy, artifact naming, packaging stages,
  platform SDK/toolchain checks, and smoke-test gates. Use when a game team
  needs to set up or repair GitHub Actions or other CI for engine builds, even
  if they only say "our Unity cloud/GitHub build keeps breaking", "help with
  Unreal packaging CI", "make our game builds reproducible", "speed up cook /
  package jobs", or "turn this manual release process into a pipeline".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories or conversations that include Unity or Unreal projects,
  GitHub Actions / CI config, build logs, release checklists, or platform build
  requirements. Works as an audit-and-plan workflow, not an automatic deployer
  or secret-rotating system.
metadata:
  tags: game-development, unity, unreal, ci-cd, github-actions, build-pipeline, release-engineering
  version: "1.0"
  source: akillness/oh-my-skills
---

# Game CI/CD Pipeline

Use this skill to turn messy Unity or Unreal build automation into a concrete pipeline brief.

The goal is not to dump generic DevOps advice. The goal is to identify the weakest structural part of the game pipeline, explain why it causes repeated build pain, and return the next practical pipeline artifact or checklist.

Read [references/pipeline-patterns.md](references/pipeline-patterns.md) before handling unfamiliar engine-specific packaging or cache questions.

## When to use this skill
- Unity or Unreal teams setting up CI/CD from scratch
- GitHub Actions, Build Automation, or other CI pipelines that are flaky, slow, or hard to debug
- Manual game release processes that need reproducible build, package, and artifact steps
- Requests about cache strategy, large binaries, artifact naming, matrix builds, smoke tests, or packaging gates
- Teams that keep fixing the same cook/package/build problem without changing the pipeline structure
- Publisher, contractor, or technical-lead audits where the team wants a short pipeline hardening brief instead of generic infrastructure advice

If the user already has one failing log excerpt and mostly needs the first root-cause diagnosis, route that to `game-build-log-triage` first or alongside this skill.

## Instructions

### Step 1: Identify the pipeline scope
Label the request before proposing fixes.

Possible scopes:
- `pipeline-setup`
- `pipeline-audit`
- `pipeline-hardening`
- `speed-and-cache-review`
- `release-checklist`
- `mixed-pipeline-review`

Record the available evidence:
- engine: Unity | Unreal | mixed | unknown
- CI surface: GitHub Actions | Unity Build Automation | Jenkins | TeamCity | other
- target platforms: Windows | macOS | Linux | Android | iOS | console | mixed
- repo constraints: large binaries, Git LFS, generated content, plugins, private packages
- current stages: build, test, cook, package, sign, upload, deploy
- repeated failure modes: compile, package dependency, cook, SDK/toolchain, cache, artifact confusion, secrets/auth
- whether the team wants diagnosis, prevention, speed, or release confidence

If evidence is thin, keep confidence low and avoid pretending the pipeline architecture is known.

### Step 2: Audit the pipeline through six lenses
Find the weakest lens first.

1. **Reproducibility**
   - Can the same branch produce the same build artifacts reliably?
   - Are engine version, packages/plugins, and SDK/toolchain assumptions pinned enough?
   - Are local-only fixes doing work the pipeline should own?

2. **Stage boundaries**
   - Are compile, test, cook/package, smoke-test, and artifact-publish steps separated clearly?
   - Does the pipeline surface the first failing stage instead of collapsing everything into one long job?
   - Are retries and caches scoped per stage rather than masking failures?

3. **Dependency and cache policy**
   - Are package/plugin restores explicit?
   - Are large caches useful, bounded, and invalidated on the right keys?
   - Is the team deleting everything on every failure because cache policy is unclear?

4. **Artifact and release hygiene**
   - Are build outputs named consistently by branch, platform, and configuration?
   - Are artifacts retained long enough for QA/review?
   - Is there a clear handoff between build success and release readiness?

5. **Platform/toolchain readiness**
   - Are SDKs, signing, provisioning, or platform-specific requirements treated as preflight checks?
   - Are Unity/Unreal engine prerequisites visible early rather than discovered at package time?

6. **Feedback speed and confidence**
   - Do failures show the right logs/artifacts quickly?
   - Are smoke tests, editor tests, unit tests, or packaging sanity checks catching regressions before launch branches?
   - Is the team optimizing for a red/green signal they can actually trust?

### Step 3: Classify the primary blocker
Map the situation to one primary blocker and optional secondary blocker.

**Primary blockers**
- `reproducibility-drift`
- `stage-boundary-blur`
- `dependency-cache-policy`
- `artifact-release-hygiene`
- `platform-toolchain-readiness`
- `feedback-speed-confidence`
- `unknown-needs-more-evidence`

**Typical mappings**
- "Works on one machine but not in CI" → `reproducibility-drift`
- "Our GitHub Action is one giant build job and we can't tell what failed" → `stage-boundary-blur`
- "We keep deleting Library / Intermediate / Saved / caches to make builds pass" → `dependency-cache-policy`
- "We produce builds but no one knows which artifact is the right one" → `artifact-release-hygiene`
- "Android/iOS/console packaging keeps failing late" → `platform-toolchain-readiness`
- "Builds are too slow and we still don't trust them" → `feedback-speed-confidence`

Do not flatten everything into generic DevOps. Separate game-engine pipeline structure from one-off build debugging.

### Step 4: Build the pipeline brief
Return a concise report with this exact structure:

```markdown
# Game CI/CD Brief

## Scope
- Review type: ...
- Engine: ...
- CI surface: ...
- Target platforms: ...
- Confidence: high | medium | low

## Current strongest signal
- 1-2 bullets on what already looks healthy

## Primary blocker
- Bucket: ...
- Why it matters: ...
- Evidence: ...

## Secondary blocker
- Bucket: ...
- Why it matters: ...

## Recommended pipeline shape
1. ...
2. ...
3. ...

## Stage-by-stage checks
- Restore / dependency step: ...
- Build / compile step: ...
- Test / smoke step: ...
- Cook / package step: ...
- Artifact publish step: ...

## Engine-specific checks
- Unity / Unreal specific: ...
- Platform SDK / signing / toolchain: ...
- Cache policy: ...

## Recommended next artifact
- Choose one: workflow rewrite brief | cache-key policy | build matrix plan | release artifact checklist | preflight checklist

## What not to do yet
- 1-3 bullets that prevent brittle or expensive pipeline changes
```

### Step 5: Tailor the advice to the engine
**For Unity, focus on:**
- engine/editor version pinning
- package restore stability and `Packages/manifest.json` / lockfile drift
- whether editor-only code or platform defines leak into builds
- cache strategy around `Library/`, package downloads, and platform toolchains
- whether test/build/package steps are separated enough to isolate red builds

**For Unreal, focus on:**
- UBT/UHT vs cook/package stage boundaries
- plugin/module enablement and generated-code assumptions
- content redirects, asset moves, and package-stage fallout
- `Intermediate/`, `Saved/`, Derived Data Cache, and what should or should not be treated as cache
- platform packaging prerequisites and AutomationTool visibility

**For release-checklist cases, focus on:**
- artifact naming and branch/channel clarity
- retention and distribution for QA/review builds
- minimum smoke-test or launch-gate checks before publishing a candidate
- making sure the team can reproduce the exact shipped build later

### Step 6: Ask for the minimum missing evidence when needed
If confidence is low, request the smallest next packet that would materially improve the audit:
1. current workflow file or CI job outline
2. engine version and target platforms
3. one recent failing log or job URL
4. artifact/output naming conventions if any
5. what the team still does manually after CI finishes

Do not ask for the entire infrastructure stack unless the user explicitly wants that.

## Output format
Always return a short pipeline brief, not a generic DevOps essay.

Required qualities:
- prioritize the single biggest structural blocker first
- distinguish recurring pipeline issues from one-off log triage
- stay around 350-550 words unless the user asks for more
- recommend one next artifact or policy, not ten simultaneous rebuilds
- keep suggestions safe and incremental before proposing a full pipeline rewrite

## Examples

### Example 1: Unity GitHub Actions drift
**Input**
> Our Unity build keeps passing locally but failing in GitHub Actions after package updates. We also keep deleting caches to get green builds.

**Output sketch**
- Scope: `pipeline-hardening`
- Primary blocker: `dependency-cache-policy`
- Secondary blocker: `reproducibility-drift`
- Recommended pipeline shape:
  1. isolate restore/build/test/package stages
  2. key caches on engine version + package lock inputs
  3. promote package/config drift to a preflight check
- Recommended next artifact: cache-key policy

### Example 2: Unreal packaging CI
**Input**
> We have an Unreal GitHub Action, but packaging takes forever and when it fails we only get one giant log blob.

**Output sketch**
- Scope: `speed-and-cache-review`
- Primary blocker: `stage-boundary-blur`
- Secondary blocker: `feedback-speed-confidence`
- Priority view: split UBT/UHT, cook/package, and artifact publication so the first failing stage is obvious
- Recommended next artifact: workflow rewrite brief

### Example 3: Manual release process
**Input**
> We're still making Windows and Steam demo builds by hand. Give me a sane CI/CD plan for our small studio.

**Output sketch**
- Scope: `pipeline-setup`
- Primary blocker: `reproducibility-drift`
- Recommended pipeline shape covers restore, build, smoke, package, and artifact publishing
- Recommended next artifact: build matrix plan or release artifact checklist

## Best practices
1. **Separate diagnosis from prevention** — use log triage for one failure, pipeline design to stop repeated failures.
2. **Expose stage boundaries** — game pipelines become unreadable when compile, cook, sign, and publish are fused.
3. **Treat caches as policy, not magic** — unclear cache rules create superstition and brittle cleanup habits.
4. **Name artifacts like releases matter** — branch, platform, and configuration should be obvious from the output.
5. **Promote platform prerequisites to preflight checks** — do not discover SDK/signing drift at the very end.
6. **Prefer one next artifact** over a full infrastructure sermon.
7. **Use engine-native language** — `Editor.log`, Build Automation, UBT/UHT, AutomationTool, cook/package, Derived Data Cache.

## References
- [Unity Docs — Troubleshoot common issues • Build Automation • Unity Docs](https://docs.unity.com/en-us/build-automation/check-build-results/troubleshoot-build-failures/overview)
- [Unity Manual — Log files](https://docs.unity3d.com/2022.3/Documentation/Manual/LogFiles.html)
- [Epic Docs — Logging in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
- [Epic Docs — Packaging Your Project](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project)
- [Semaphore — How to Manage CI/CD for Game Development (Unity, Unreal, Large Binaries)](https://semaphore.io/how-to-manage-ci-cd-for-game-development-unity,-unreal,-large-binaries)
