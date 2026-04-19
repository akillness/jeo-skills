# Intake Packets and Route-outs

Start from the validation packet the user already has. Do not force every question through a generic pyramid lecture.

## `change-risk-packet`
Use when the request is tied to one concrete feature, bugfix, migration, contract change, auth change, UI flow change, or config/deploy change.

Capture:
- what changed
- who or what path is exposed to risk
- the current decision point: local, PR, release, or mixed
- what evidence already exists

Common outputs:
- one layer-mix recommendation
- one gate split
- one named next owner

Route out when:
- implementation of the chosen tests is now the main work → `backend-testing`
- the packet is really one diff approval decision → `code-review`
- the change is dominated by performance benchmarking → `performance-optimization`

## `gate-design-packet`
Use when the team is debating what belongs in local, PR, release, and scheduled gates.

Capture:
- current gate pain: slow, flaky, expensive, noisy, or missing confidence
- which checks are blocking vs informational today
- where evidence arrives too late

Look for:
- one suite that should move to scheduled/nightly
- one missing release-only check
- one place where PR gates are broader than the risk justifies

Route out when:
- the next task is implementing or stabilizing a specific suite → `backend-testing` or `debugging`

## `flake-cost-packet`
Use when the suite is noisy, slow, brittle, or frequently rerun.

Capture:
- which suite or layer is causing pain
- whether failures are known flake, unknown flake, or real regressions
- who owns quarantine/fix follow-up
- whether the suite is in the wrong gate

Good policy outcomes:
- blocking vs informational rules
- quarantine with owner + timeout + follow-up expectation
- moving broad coverage to scheduled runs
- lowering confidence to the smallest honest blocking gate

Route out when:
- the task becomes reproducing why one flaky test is failing now → `debugging`
- the task becomes tool-specific CI implementation → implementation or infra skill

## `release-readiness-packet`
Use when a change is near deploy and the team needs final confidence, signoff, staging smoke, rollback notes, or checklist cleanup.

Capture:
- changed customer path or operational path
- rollout sensitivity: migration, feature flag, config, secret, queue, background job, dependency
- what production-facing proof is still missing

Look for:
- narrow smoke coverage
- migration / rollback / rollback-proof items
- explicit manual signoff when human judgment is still honest

Route out when:
- the work is now release execution rather than validation policy → `deployment-automation`
- the review is mostly UI/accessibility signoff → `web-accessibility` or `web-design-guidelines`

## `incident-ratchet-packet`
Use when an escaped bug, outage fix, or severe regression needs lasting protection.

Capture:
- what escaped
- what layer could have caught it earliest
- whether the previous gap was missing automation, missing gate placement, or missing release checklist proof

Good outcome:
- the lowest-layer regression that would have caught the issue
- a small gate change if needed
- explicit avoidance of unrelated coverage expansion

Route out when:
- the system still needs root-cause investigation → `debugging`
- the next job is implementing the regression test → `backend-testing`

## Quick route-out table
| If the real question is... | Route to |
|---|---|
| What validation policy should we use? | `testing-strategies` |
| How do we implement those tests? | `backend-testing` |
| Why is the suite red or flaky right now? | `debugging` |
| Is this specific diff ready to approve? | `code-review` |
| Is accessibility or visual behavior the main validation surface? | `web-accessibility` / `web-design-guidelines` |
| Is performance benchmarking or load confidence the main issue? | `performance-optimization` / `game-performance-profiler` |
| Is release execution or rollout choreography now the main task? | `deployment-automation` |

## Rule of thumb
A good packet is the smallest artifact set that lets you make one honest confidence decision. If the packet cannot support that decision yet, ask for one missing artifact or route to the neighboring skill that owns the next step.
