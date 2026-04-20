---
name: game-ci-cd-pipeline
description: >
  Turn messy Unity or Unreal build/release automation into one bounded game-pipeline
  packet after naming the signal tier first: fast branch-gate CI, nightly/package-
  candidate builds, or release/certification candidates. Use when a game team needs
  to design or repair GitHub Actions, Unity Build Automation, Jenkins, TeamCity, or
  similar CI for engine builds — especially when they mention flaky packaging, cache
  superstition, giant build-job blobs, slow cook / package cycles, artifact confusion,
  SDK/signing drift, or manual candidate promotion that should become reproducible.
  Route one red log first-pass diagnosis to `game-build-log-triage`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for Unity or Unreal repositories, workflow files, job logs, release checklists,
  platform/toolchain notes, or manual build procedures that need to become a reliable
  pipeline. Works as a pipeline audit-and-brief workflow, not an automatic deployer or
  secret-rotation system.
metadata:
  tags: game-development, unity, unreal, ci-cd, github-actions, build-pipeline, release-engineering, release-candidates
  version: "1.2.0"
  source: akillness/oh-my-skills
  hardening: 2026-04-19
  ratchet: 2026-04-20
---

# Game CI/CD Pipeline

Use this skill when the job is **choosing the next game-pipeline artifact**, not dumping a generic DevOps essay.

`game-ci-cd-pipeline` should answer two linked questions per run:
1. **Which signal tier / promotion lane is this?**
   - `branch-gate` — fast merge/commit validation
   - `nightly-package-candidate` — slower scheduled or manually triggered QA/review candidate builds
   - `release-certification-candidate` — protected, signed, approval-heavy release or cert candidates
2. **Which packet is the smallest honest next artifact inside that tier?**
   - pipeline setup
   - stage split
   - cache policy
   - preflight readiness
   - artifact/release hygiene
   - CI-signal hardening
   - or route-to-log-triage

Read these before choosing the packet:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/pipeline-patterns.md](references/pipeline-patterns.md)
- [references/signal-tiers-and-promotion-lanes.md](references/signal-tiers-and-promotion-lanes.md)

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

### Step 1: Classify the signal tier first, then choose one primary packet type
Normalize the request into exactly one signal tier and one primary packet.

```yaml
game_pipeline_packet:
  signal_tier: branch-gate | nightly-package-candidate | release-certification-candidate | unknown
  packet_type: pipeline-setup | stage-split | cache-policy | preflight-readiness | artifact-release | ci-signal-hardening | route-to-log-triage
  engine: Unity | Unreal | mixed | unknown
  ci_surface: GitHub Actions | Unity Build Automation | Jenkins | TeamCity | other | unknown
  target_platforms: Windows | macOS | Linux | Android | iOS | console | mixed | unknown
  release_context: prototype | internal QA | demo | playtest | certification | launch | live patch | unknown
  evidence_level: strong | partial | thin
```

Signal-tier meanings:
- `branch-gate` — fast merge/commit validation where expensive packaging should stay exceptional
- `nightly-package-candidate` — scheduled or manually triggered QA/review/demo candidate builds that are heavier than ordinary branch CI
- `release-certification-candidate` — protected, approval-heavy, signed, store-bound, or cert-bound candidate work

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
- current trigger shape: PR/push, schedule/manual, protected release lane, or unknown
- target platforms and release context
- repeated failure pattern: compile, package, toolchain, cache, artifact confusion, speed, or trust
- what still happens manually after CI finishes
- current artifact naming / retention or approval rules if candidate promotion is part of the pain
- one recent failing job/log if the team keeps pointing at a single red build

If evidence is thin, keep confidence low and prefer `route-to-log-triage` or a narrow packet over a fake full redesign.

### Step 3: Choose the signal tier explicitly
Decide which lane owns the pain before suggesting the packet:
- **`branch-gate`** when the complaint is slow PR/merge validation, heavy packaging on every branch, or weak fast feedback
- **`nightly-package-candidate`** when QA/review/demo builds need heavier packaging, broader target coverage, or scheduled/manual promotion outside normal branch CI
- **`release-certification-candidate`** when the work is approval-heavy, signed, store/cert-bound, or should have stricter artifact retention than ordinary CI
- **`unknown`** only when the available evidence cannot distinguish the lane yet

If the user mixes multiple lanes, pick the lane that is currently bottlenecking trust and name the others as follow-up route-outs.

### Step 4: Classify the primary blocker
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

### Step 5: Run the boundary check
Before writing advice, verify the lane:
1. Is this a structural pipeline question or just a failing log?
2. Does the chosen signal tier match the actual trigger/approval/artifact problem?
3. Is the best next artifact one of the packet types above?
4. Are you staying inside game-engine pipeline work instead of drifting into generic web-app DevOps?
5. Are engine-specific details helping the diagnosis rather than bloating the front door?

If the answer is mostly "this is one failing log", route to `game-build-log-triage` and leave a short handoff packet.
If the answer is mostly "this is really release-gate policy", route the policy decision to `testing-strategies` and keep this skill on game-engine implementation shape.

### Step 6: Build the packet brief
Return this exact structure:

```markdown
# Game CI/CD Brief

## Packet choice
- Signal tier: branch-gate | nightly-package-candidate | release-certification-candidate | unknown
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

### Step 7: Tailor the packet to the engine and signal tier
**For Unity**
- watch engine/editor version pinning
- ask whether `Packages/manifest.json` / lock inputs and platform modules are stable
- separate package restore, build, test, and package stages
- treat `Library/` and package caches as explicit policy, not ritual cleanup
- for `branch-gate`, bias toward fast compile/test/smoke feedback and cancel-in-progress behavior
- for `nightly-package-candidate` or `release-certification-candidate`, make candidate naming, build-target grouping, signing, and artifact retention explicit

**For Unreal**
- keep UBT/UHT, cook, package, and publish mentally separate
- call out plugin/module drift, asset redirect fallout, and AutomationTool visibility
- distinguish DDC/cache questions from packaging/log-root-cause work
- make platform packaging prerequisites visible before late-stage failure
- for `branch-gate`, avoid hiding every merge behind full cook/package unless the project risk truly requires it
- for `nightly-package-candidate` or `release-certification-candidate`, make cook/package duration, target-specific prerequisites, and publish/promotion rules explicit

### Step 8: Ask for the smallest missing packet
If confidence is low, request only what changes the decision:
1. current workflow file or job outline
2. trigger shape (PR/push vs schedule/manual vs protected release lane)
3. engine version and target platforms
4. one recent failed job/log if the issue may be `single-log-not-pipeline`
5. current artifact naming / retention / approval pattern
6. what still happens manually after CI completes

## Output format
Always return a **short game pipeline brief**.

Required qualities:
- choose one signal tier and one primary packet type
- separate structural pipeline work from one-off log triage
- recommend one next artifact, not a full platform rewrite
- stay around 300-550 words unless the user asks for more
- keep release/demo context visible when it changes the priority
- make candidate promotion / approval truth explicit when it changes the answer

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

### Example 2: Heavy packaging on every branch
**Input**
> Our PR pipeline takes 70 minutes because Android packaging runs on every branch. What should change first?

**Good output direction**
- signal tier: `branch-gate`
- packet type: `ci-signal-hardening` or `stage-split`
- primary blocker: `feedback-speed-confidence`
- next artifact: `CI-signal hardening plan` or `workflow stage split brief`
- call out that full packaging likely belongs in a heavier candidate lane, not every merge gate

### Example 3: Unreal giant job blob
**Input**
> We have an Unreal pipeline but packaging takes forever and failures show up as one giant log blob.

**Good output direction**
- signal tier: usually `nightly-package-candidate` unless the user proves every merge truly needs full packaging
- packet type: `stage-split`
- primary blocker: `stage-boundary-blur`
- secondary blocker: `feedback-speed-confidence`
- next artifact: `workflow stage split brief`

### Example 4: One failing packaging log
**Input**
> Our Unreal Android packaging job failed last night. Here's the AutomationTool output.

**Good output direction**
- packet type: `route-to-log-triage`
- primary blocker: `single-log-not-pipeline`
- route to `game-build-log-triage`
- pass along the failing stage, engine version, target platform, and exact log excerpt

### Example 5: Manual nightly/demo candidate process
**Input**
> We already have a quick branch build, but QA needs a nightly Windows + Steam Deck candidate with clear artifact names.

**Good output direction**
- signal tier: `nightly-package-candidate`
- packet type: `artifact-release` or `pipeline-setup`
- primary blocker: `artifact-release-hygiene`
- next artifact: `artifact/release checklist` or `pipeline setup plan`
- keep candidate naming, retention, and consumer handoff explicit

## Best practices
1. **Name the signal tier before the packet** — branch-gate, nightly/package-candidate, and release/certification work should not share one fake default answer.
2. **Act like a release engineer, not a generic infra lecturer** — choose the next packet that reduces repeat pain.
3. **Preserve the log/pipeline boundary** — one red build often needs `game-build-log-triage` before a structural rewrite.
4. **Treat caches as policy** — define what is keyed, shared, invalidated, and intentionally regenerated.
5. **Expose stage boundaries** — compile, test, cook/package, and publish should not collapse into one unreadable blob.
6. **Keep release context visible** — prototype, demo, certification, and launch demand different tradeoffs.
7. **Prefer one next artifact** over a sprawling CI/CD manifesto.
8. **Route release-gate policy to `testing-strategies` when the fight is governance, not engine-pipeline shape**.

## References
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/pipeline-patterns.md](references/pipeline-patterns.md)
- [references/signal-tiers-and-promotion-lanes.md](references/signal-tiers-and-promotion-lanes.md)
- [Unity Docs — Troubleshoot common issues • Build Automation • Unity Docs](https://docs.unity.com/en-us/build-automation/check-build-results/troubleshoot-build-failures/overview)
- [Unity Scriptable Build Pipeline — Cache Server Client](https://docs.unity3d.com/Packages/com.unity.scriptablebuildpipeline@2.0/manual/CacheServerClient.html)
- [Epic Docs — Packaging Your Project](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project)
- [Epic Docs — Logging in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
