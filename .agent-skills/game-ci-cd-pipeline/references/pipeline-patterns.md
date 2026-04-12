# Game CI/CD Pipeline Patterns

Use this reference when the request is broader than one red build and narrower than a full platform migration.

## Core distinction
- **`game-build-log-triage`**: identify the first actionable failure from a specific log excerpt.
- **`game-ci-cd-pipeline`**: redesign or audit the pipeline so repeated failures become visible, reproducible, and less frequent.

## Five recurring game-pipeline pain patterns

### 1. One giant job blob
Symptoms:
- one workflow step does restore, compile, test, package, upload, and release prep
- the user says "CI failed" but cannot name the first failing stage
- the log is huge and the real error is buried near the middle

Recommended response:
- split jobs or at least clearly named stages
- preserve stage-specific artifacts/logs
- make later steps depend on earlier red/green gates

### 2. Cache superstition
Symptoms:
- the team repeatedly deletes `Library/`, `Intermediate/`, `Saved/`, or equivalent caches
- success depends on random cleanup rather than explicit keys or invalidation rules
- teams cannot tell what is safe to cache vs regenerate

Recommended response:
- describe cache scope in terms of engine version, dependency manifest, target platform, and build configuration
- distinguish package/dependency caches from generated build-state caches
- avoid recommending broad cache deletion as the steady-state workflow

### 3. Platform prerequisites discovered too late
Symptoms:
- packaging fails only after a long build/cook step
- Android/iOS/signing/toolchain issues surface at the end of the workflow
- environment assumptions live in one developer machine rather than CI checks

Recommended response:
- add explicit preflight verification for platform SDK, signing, provisioning, and build tools
- make platform readiness a named stage, not an implicit assumption

### 4. Artifact ambiguity
Symptoms:
- QA or publishers do not know which build to test
- branch/config/platform are unclear from filenames
- successful builds disappear too quickly or are overwritten

Recommended response:
- define an artifact naming convention with branch/channel, platform, configuration, and revision
- set retention expectations for QA/review builds
- separate candidate builds from shippable release artifacts

### 5. Slow pipelines nobody trusts
Symptoms:
- builds are expensive and still miss obvious regressions
- teams skip CI because feedback is too slow
- the pipeline is optimized for build completion, not decision confidence

Recommended response:
- keep the earliest confidence-building checks small and fast
- decide which tests or smoke checks should run before expensive packaging
- focus on the signal needed to unblock the team, not just maximum automation

## Engine-specific reminders

### Unity
- Ask about engine version, packages, lockfiles, platform modules, and whether editor-only code leaks into builds.
- Packaging failures often hide earlier compile/package-manager issues.
- `Editor.log` and package-manager logs are evidence sources, not the pipeline plan itself.

### Unreal
- Keep UBT/UHT, cook, package, and artifact stages mentally separate.
- Missing assets, redirectors, or plugin/module drift often explode during later packaging steps.
- AutomationTool output is frequently a downstream symptom; stage boundaries matter.

## Good next artifacts
- `workflow rewrite brief`
- `cache-key policy`
- `build matrix plan`
- `release artifact checklist`
- `platform preflight checklist`

Prefer one of those over a generic "improve CI" answer.
