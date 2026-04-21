# Game CI/CD intake packets and route-outs

Use this reference to keep `game-ci-cd-pipeline` compact and routing-first. Start by naming the signal tier (`branch-gate`, `nightly-package-candidate`, or `release-certification-candidate`), then choose the packet type.

## Signal tiers

### `branch-gate`
Fast merge/commit validation. Use when the pain is slow PR feedback, packaging on every branch, or weak developer trust in quick CI.

### `nightly-package-candidate`
Heavier scheduled/manual QA, demo, or review builds. Use when candidate packaging should exist, but not on every merge.

### `release-certification-candidate`
Protected, signed, store-bound, or certification-bound candidates. Use when approval, retention, or promotion rules are part of the pain.

## Primary packet types

### 1. `pipeline-setup`
Use when the team still builds demo, QA, or release candidates mostly by hand.

Minimum packet:
- engine + version
- target platforms
- current manual build/release steps
- release context (prototype, demo, launch, patch)
- where artifacts currently go

Best next artifact:
- `pipeline setup plan`

### 2. `stage-split`
Use when the workflow is one giant job blob and nobody can name the first failing stage.

Minimum packet:
- workflow file or job outline
- where compile/test/cook/package/publish currently happen
- one recent failed job URL or excerpt
- current artifact/log visibility

Best next artifact:
- `workflow stage split brief`

### 3. `cache-policy`
Use when the team keeps deleting caches or cannot explain cache keys.

Minimum packet:
- engine + version
- what is cached now (`Library`, DDC, package caches, intermediate folders)
- cache invalidation rules if any
- failure symptoms after cache reuse

Best next artifact:
- `cache-key policy`

### 4. `preflight-readiness`
Use when SDK, signing, provisioning, or platform setup fails late.

Minimum packet:
- target platform
- toolchain / SDK / signing prerequisites
- stage where failure is discovered now
- whether prerequisites are checked before packaging

Best next artifact:
- `platform preflight checklist`

### 5. `artifact-release`
Use when builds exist but QA/review/publish handoff is messy.

Minimum packet:
- artifact names and destinations
- branch/channel naming
- retention window
- who consumes the outputs

Best next artifact:
- `artifact/release checklist`

### 6. `ci-signal-hardening`
Use when builds are slow, expensive, and still not trusted.

Minimum packet:
- current runtime per stage
- earliest useful tests/smoke checks
- which failures should block packaging
- where confidence is currently lost

Best next artifact:
- `CI-signal hardening plan`

## Route-outs

### Route to `game-build-log-triage`
Use when the main question is the first actionable error inside one failing Unity/Unreal build, cook, package, CI, or editor log.

Pass this packet:
- engine + version
- target platform
- exact failing stage
- shortest useful log excerpt or job URL
- any recent change that likely triggered the failure

### Route to `bmad-gds`
Use when build automation is only one piece of a broader milestone / demo / launch coordination decision.

### Route to `game-performance-profiler`
Use when the build completes but the real problem is frame time, memory, hitching, or target-device performance.

### Route to `steam-store-launch-ops`
Use when the team is really asking about Steam page, demo timing, or public launch operations rather than build automation.

## Boundary reminder
`game-ci-cd-pipeline` owns repeated structural pipeline decisions. It should not become a general-purpose log debugger or a whole-studio producer/orchestrator.
