---
name: game-ci-cd-pipeline
description: >
  Turn messy Unity or Unreal build/release automation into one bounded pipeline packet:
  setup plan, stage split, cache policy, preflight checklist, artifact/release hygiene,
  or CI-signal hardening. Use when a game team needs to design or repair GitHub Actions,
  Unity Build Automation, Jenkins, TeamCity, or similar CI for engine builds — especially
  when they mention flaky packaging, cache superstition, giant build-job blobs, slow cook /
  package cycles, artifact confusion, SDK/signing drift, or a manual game release process
  that should become reproducible. Route one red log first-pass diagnosis to
  `game-build-log-triage`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for Unity or Unreal repositories, workflow files, job logs, release checklists,
  platform/toolchain notes, or manual build procedures that need to become a reliable
  pipeline. Works as a pipeline audit-and-brief workflow, not an automatic deployer or
  secret-rotation system.
metadata:
  tags: game-development, unity, unreal, ci-cd, github-actions, build-pipeline, release-engineering
  version: "1.1"
  source: akillness/oh-my-skills
---

# Game CI/CD Pipeline

Use this skill when the job is **choosing the next game-pipeline artifact**, not dumping a generic DevOps essay.

`game-ci-cd-pipeline` should answer one question per run:
- do we need a **pipeline setup plan**,
- a **stage split / workflow rewrite**,
- a **cache-key policy**,
- a **platform preflight checklist**,
- an **artifact / release hygiene packet**,
- or a **CI-signal hardening brief**?

Read these before choosing the packet:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/pipeline-patterns.md](references/pipeline-patterns.md)

## When to use this skill
- A Unity or Unreal team needs to set up CI/CD from scratch without overengineering it.
- A pipeline is repeatedly flaky, slow, or opaque, and the real problem is workflow structure rather than one isolated log.
- Build, cook/package, cache, artifact, or release-hand-off steps keep breaking trust in the pipeline.
- A team still ships demo/review/release builds manually and needs the first reproducible pipeline packet.
- A publisher helper, contractor, or technical lead needs a compact game-pipeline audit brief.

## When not to use this skill
- The main job is identifying the first actionable failure inside one specific Unity/Unreal build log → `game-build-log-triage`.
- The main job is milestone coordination across design, QA, build pressure, and launch timing → `bmad-gds`.
- The main job is runtime profiling or frame-time bottleneck diagnosis → `game-performance-profiler`.
- The main job is Steam page / wishlist / launch-store operations → `steam-store-launch-ops`.
- The main job is generic non-game CI/CD for ordinary web/backend repos → use the repo's broader DevOps skills instead.

## Instructions

### Step 1: Choose one primary packet type
Normalize the request into exactly one primary packet.

```yaml
game_pipeline_packet:
  packet_type: pipeline-setup | stage-split | cache-policy | preflight-readiness | artifact-release | ci-signal-hardening | route-to-log-triage
  engine: Unity | Unreal | mixed | unknown
  ci_surface: GitHub Actions | Unity Build Automation | Jenkins | TeamCity | other | unknown
  target_platforms: Windows | macOS | Linux | Android | iOS | console | mixed | unknown
  release_context: prototype | internal QA | demo | playtest | certification | launch | live patch | unknown
  evidence_level: strong | partial | thin
```

Packet meanings:
- `pipeline-setup` — first reproducible pipeline plan for a team still doing too much by hand
- `stage-split` — separate restore/build/test/cook/package/publish so the first failing stage is visible
- `cache-policy` — stop superstition around `Library`, `Intermediate`, `Saved`, DDC, or package caches
- `preflight-readiness` — surface SDK/signing/toolchain/platform prerequisites before expensive packaging
- `artifact-release` — fix artifact naming, retention, candidate-vs-release clarity, and QA handoff
- `ci-signal-hardening` — improve feedback speed and trust without rewriting everything
- `route-to-log-triage` — the request is mostly one red build/log and should move to `game-build-log-triage`

### Step 2: Gather the minimum credible evidence
Pull only the smallest packet needed to justify the decision:
- engine and version if known
- current CI surface or workflow file
- target platforms and release context
- repeated failure pattern: compile, package, toolchain, cache, artifact confusion, speed, or trust
- what still happens manually after CI finishes
- one recent failing job/log if the team keeps pointing at a single red build

If evidence is thin, keep confidence low and prefer `route-to-log-triage` or a narrow packet over a fake full redesign.

### Step 3: Classify the primary blocker
Choose one primary blocker and at most one secondary blocker.

**Primary blockers**
- `reproducibility-drift`
- `stage-boundary-blur`
- `dependency-cache-policy`
- `artifact-release-hygiene`
- `platform-toolchain-readiness`
- `feedback-speed-confidence`
- `single-log-not-pipeline`
- `unknown-needs-more-evidence`

Typical mappings:
- "Works on one machine but not in CI" → `reproducibility-drift`
- "Our workflow is one giant job and we cannot tell what failed" → `stage-boundary-blur`
- "We keep deleting caches until it passes" → `dependency-cache-policy`
- "QA never knows which build is correct" → `artifact-release-hygiene`
- "Android/iOS/console packaging fails late" → `platform-toolchain-readiness`
- "Builds are slow and nobody trusts the signal" → `feedback-speed-confidence`
- "Here is one failing packaging log" → `single-log-not-pipeline`

### Step 4: Run the boundary check
Before writing advice, verify the lane:
1. Is this a structural pipeline question or just a failing log?
2. Is the best next artifact one of the packet types above?
3. Are you staying inside game-engine pipeline work instead of drifting into generic web-app DevOps?
4. Are engine-specific details helping the diagnosis rather than bloating the front door?

If the answer is mostly "this is one failing log", route to `game-build-log-triage` and leave a short handoff packet.

### Step 5: Build the packet brief
Return this exact structure:

```markdown
# Game CI/CD Brief

## Packet choice
- Packet type: ...
- Engine: ...
- CI surface: ...
- Release context: ...
- Confidence: high | medium | low

## Evidence used
- Workflow / system context: ...
- Repeated failure pattern: ...
- Manual steps still outside CI: ...
- Gaps / assumptions: ...

## Primary blocker
- Bucket: ...
- Why it matters now: ...
- Evidence: ...

## Secondary blocker
- Bucket: ...
- Why it matters now: ...

## Recommended pipeline shape
1. ...
2. ...
3. ...

## Engine and platform checks
- Unity / Unreal specifics: ...
- SDK / signing / toolchain: ...
- Cache or artifact policy: ...

## Recommended next artifact
- Choose one: pipeline setup plan | workflow stage split brief | cache-key policy | platform preflight checklist | artifact/release checklist | CI-signal hardening plan | log-triage handoff packet

## Route-outs
- Skill: ...
- Why: ...
- Packet to pass: ...

## What not to do yet
- 1-3 bullets that avoid brittle rewrites or cargo-cult caching
```

### Step 6: Tailor the packet to the engine
**For Unity**
- watch engine/editor version pinning
- ask whether `Packages/manifest.json` / lock inputs and platform modules are stable
- separate package restore, build, test, and package stages
- treat `Library/` and package caches as explicit policy, not ritual cleanup

**For Unreal**
- keep UBT/UHT, cook, package, and publish mentally separate
- call out plugin/module drift, asset redirect fallout, and AutomationTool visibility
- distinguish DDC/cache questions from packaging/log-root-cause work
- make platform packaging prerequisites visible before late-stage failure

### Step 7: Ask for the smallest missing packet
If confidence is low, request only what changes the decision:
1. current workflow file or job outline
2. engine version and target platforms
3. one recent failed job/log if the issue may be `single-log-not-pipeline`
4. current artifact naming / retention pattern
5. what still happens manually after CI completes

## Output format
Always return a **short game pipeline brief**.

Required qualities:
- choose one primary packet type
- separate structural pipeline work from one-off log triage
- recommend one next artifact, not a full platform rewrite
- stay around 300-550 words unless the user asks for more
- keep release/demo context visible when it changes the priority

## Examples

### Example 1: Unity cache superstition
**Input**
> Our Unity GitHub Actions build passes locally but fails after package updates. We keep deleting caches and rerunning until it works.

**Good output direction**
- packet type: `cache-policy`
- primary blocker: `dependency-cache-policy`
- secondary blocker: `reproducibility-drift`
- next artifact: `cache-key policy`
- route-out remains optional unless one specific log becomes the real question

### Example 2: Unreal giant job blob
**Input**
> We have an Unreal pipeline but packaging takes forever and failures show up as one giant log blob.

**Good output direction**
- packet type: `stage-split`
- primary blocker: `stage-boundary-blur`
- secondary blocker: `feedback-speed-confidence`
- next artifact: `workflow stage split brief`

### Example 3: One failing packaging log
**Input**
> Our Unreal Android packaging job failed last night. Here's the AutomationTool output.

**Good output direction**
- packet type: `route-to-log-triage`
- primary blocker: `single-log-not-pipeline`
- route to `game-build-log-triage`
- pass along the failing stage, engine version, target platform, and exact log excerpt

### Example 4: Manual demo build process
**Input**
> We're still building Windows demo and review builds by hand for our small studio. Give me a sane CI/CD path without overengineering it.

**Good output direction**
- packet type: `pipeline-setup`
- primary blocker: `reproducibility-drift`
- next artifact: `pipeline setup plan`
- keep artifact naming and review-build retention explicit

## Best practices
1. **Act like a release engineer, not a generic infra lecturer** — choose the next packet that reduces repeat pain.
2. **Preserve the log/pipeline boundary** — one red build often needs `game-build-log-triage` before a structural rewrite.
3. **Treat caches as policy** — define what is keyed, shared, invalidated, and intentionally regenerated.
4. **Expose stage boundaries** — compile, test, cook/package, and publish should not collapse into one unreadable blob.
5. **Keep release context visible** — prototype, demo, certification, and launch demand different tradeoffs.
6. **Prefer one next artifact** over a sprawling CI/CD manifesto.

## References
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/pipeline-patterns.md](references/pipeline-patterns.md)
- [Unity Docs — Troubleshoot common issues • Build Automation • Unity Docs](https://docs.unity.com/en-us/build-automation/check-build-results/troubleshoot-build-failures/overview)
- [Unity Scriptable Build Pipeline — Cache Server Client](https://docs.unity3d.com/Packages/com.unity.scriptablebuildpipeline@2.0/manual/CacheServerClient.html)
- [Epic Docs — Packaging Your Project](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project)
- [Epic Docs — Logging in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
