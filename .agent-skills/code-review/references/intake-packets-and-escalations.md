# Intake Packets and Escalations

Start from the review packet the user already has. Do not demand a perfect PR template before doing useful work.

## Diff only
Use when the packet is mostly code changes with little supporting evidence.

Look for:
- the riskiest changed path
- obvious trust-boundary or state-transition changes
- whether one missing artifact blocks confident review

Escalate when:
- the change is too large to review confidently → recommend splitting or narrowing
- the real work is branch cleanup or commit surgery → `git-workflow`

## Diff + tests
Use when unit/integration tests are present and the main question is whether the evidence actually covers the risky path.

Look for:
- test coverage of the changed invariant
- false confidence from green tests that skip edge cases
- fixtures or mocks that hide the real risk

Escalate when:
- the conversation becomes broader coverage policy or flaky-suite design → `testing-strategies`

## Schema / auth / rollout packet
Use when the diff changes migrations, auth behavior, config, background jobs, release flow, or compatibility boundaries.

Look for:
- rollback and backfill assumptions
- backward compatibility
- permission or secret-handling changes
- missing migration or rollout notes

Escalate when:
- a live failure already exists and root-cause diagnosis is now the main task → `debugging`
- the next task is wider auth architecture or API contract redesign → route after naming the review concern

## Screenshots / preview / recording packet
Use when frontend, marketing-site, or product-facing interaction behavior matters.

Look for:
- mobile/tablet/desktop state coverage
- hover/focus/error/loading states
- whether the diff alone can explain the behavior
- maintainability issues even if the visuals look fine

Escalate when:
- the next task is pure design governance → `web-design-guidelines`
- the next task is accessibility remediation → `web-accessibility`

## CI bot / reviewdog / static-analysis packet
Use when automated findings already exist in the PR.

Look for:
- whether the bot surfaced a real blocker or a noisy policy issue
- risky behavior the bot cannot judge
- missing evidence that still blocks approval even after lint/static-analysis passes

Escalate when:
- the next task is repo-admin or CI policy maintenance rather than review judgment

## Game / runtime validation packet
Use when the diff affects gameplay, engine integration, runtime state, or asset-driven behavior.

Look for:
- determinism or state-sync risks
- config/data coupling
- whether code review can judge the change without playtest or engine validation
- what still needs manual validation on target hardware or in-editor/runtime

Escalate when:
- the next task is engine-specific profiler reading or runtime bottleneck analysis → `game-performance-profiler`
- the next task is reproducing a live bug → `debugging`

## Repo policy / admin packet
Use when the request mixes review with reviewer assignment, CODEOWNERS, branch protection, labels, merge queue, or PR operations.

Look for:
- whether there is still a real diff-review task to complete
- whether the request should be split into review judgment plus repo/PR workflow administration

Escalate when:
- the main task is PR lifecycle or repository administration rather than review judgment

## Rule of thumb
A good review packet is the smallest artifact set that lets you make one honest merge decision.
If the packet cannot support that decision yet, ask for one missing artifact or route to the neighboring skill that owns the next step.
