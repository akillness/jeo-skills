# Mode Selection and Fast Checks for `debugging`

Use this packet after the failure is concrete enough to test. The goal is to choose the cheapest *discriminating* check for the case type instead of defaulting to generic logging or broad patching.

## 1. Regression debugging
Choose this mode when the bug clearly used to work and you have a likely change window.

Fast checks:
- compare the suspect files or config range
- identify a last-known-good commit or release
- use `git bisect` if a reliable pass/fail check exists
- compare one good request/test/output against one bad one

Good prompts:
- "it started after the refactor"
- "this worked last week"
- "which commit introduced this"

Route out if:
- the task shifts into refactoring or PR-audit work → `code-review` / `code-refactoring`

## 2. Flaky-failure debugging
Choose this mode when the same code sometimes passes and sometimes fails.

Fast checks:
- measure the failure rate with repeated runs
- compare timing, shared state, retries, caching, clocks, random seeds, and order dependence
- decide whether the failure is product bug, test bug, or environment instability
- keep the rerun loop focused on one test, one scene, one worker, or one suspect boundary

Good prompts:
- "fails one out of eight runs"
- "passes locally, fails in CI"
- "non-deterministic"

Route out if:
- the job becomes suite-wide flake policy, quarantine design, or coverage planning → `testing-strategies`

## 3. Env / config mismatch debugging
Choose this mode when the bug only happens in CI, staging, prod, one device profile, or one runtime setup.

Fast checks:
- diff env vars, flags, dependency versions, secrets paths, locales, timezones, or container/runtime versions
- print or capture the exact config branch taken at runtime
- verify the same payload/input under both environments
- check file paths, permissions, seed data, and external-service assumptions

Good prompts:
- "only in staging"
- "works on my machine"
- "only in CI"
- "only on device X / browser Y"

Route out if:
- the task is really machine/setup reproducibility design → `system-environment-setup`

## 4. Artifact-led debugging
Choose this mode when you already have the first useful log, trace, screenshot, crash context, or failing request, but the cause is still unknown.

Fast checks:
- map the artifact to one suspect code path or state transition
- correlate the failing timestamp / request / span with the relevant module or config branch
- avoid broad log summaries once the meaningful clue is already known
- move from artifact → reproducible check as quickly as possible

Good prompts:
- "here's the first failing request payload"
- "the trace shows the crash in this span"
- "I know the failing step already"

Route out if:
- the task still mainly needs the first actionable failure identified → `log-analysis`

## 5. Runtime / browser / game-loop debugging
Choose this mode when live state, rendering, scene state, or user interaction matters as much as the raw code path.

Fast checks:
- reproduce the exact interaction path
- inspect runtime state, DOM/network events, scene state, or relevant engine/editor values
- reuse the same session when possible instead of recreating setup repeatedly
- separate logic bugs from frame-budget or perf-only complaints

Good prompts:
- "the button works in one browser but not another"
- "the scene breaks after this interaction"
- "the bug only appears while the game is running"

Route out if:
- the real task becomes profiling or bottleneck tradeoffs → `performance-optimization` / `game-performance-profiler`

## Practical summary
- **Known regression** → compare recent change, maybe bisect
- **Flaky** → repeated-run evidence first
- **Env-specific** → diff facts before patching code
- **Artifact clue already known** → map artifact to one suspect boundary fast
- **Runtime/UI/game interaction matters** → reproduce the exact interaction path and inspect live state
