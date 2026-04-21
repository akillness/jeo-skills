# Solution Landscape: workflow-automation structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| npm / yarn / pnpm scripts | package-manager command registry | zero-extra-tool default in JS/TS repos, easy CI pairing, familiar | stringly command sprawl, weaker composability, portability pain | Common first-hop surface for frontend/fullstack repos |
| GNU Make | generic repo task runner | ubiquitous, terse, good for simple entrypoints | syntax friction, phony-target overload, weaker Windows ergonomics | Still a de facto human-facing command layer in many polyglot repos |
| just | command-first task runner | readable, ergonomic, self-documenting | extra binary, less ubiquitous than Make | Strong fit when teams want project commands more than build semantics |
| Task (`go-task`) | YAML task runner | cross-platform, explicit dependencies, approachable | extra binary, YAML verbosity | Strong middle ground for polyglot repos |
| pre-commit | multi-language hook manager | reproducible hooks, broad ecosystem, repo-owned config | first-run friction, local env complexity, bypass pressure if slow | Best when hooks stay fast and CI mirrors policy |
| Husky | JS-focused hook layer | familiar in Node repos, easy script reuse | brittle install behavior across versions, hook friction in containers/GUI clients | Best for Node-heavy repos |
| lefthook | fast hook manager | speed, parallelism, polyglot fit | lower mindshare, extra install step | Good when hook latency is the main complaint |
| GitHub Actions | hosted CI/workflow surface | native GitHub integration, auditable, event-driven | YAML sprawl, slow debug cycle, secret/permission complexity | Enforcement layer, not the only local UX layer |
| act | local GitHub Actions runner | faster feedback for workflow editing | parity gaps with hosted runners | Useful for local CI parity, but not a full replacement |
| Dependabot | GitHub-native dependency updates | easy enablement, low setup cost | PR noise, less policy control than Renovate | Common default maintenance bot |
| Renovate | configurable maintenance bot | rich grouping/scheduling rules, polyglot support | steep config curve, noisy until tuned | Better fit for mature repos with ownership rules |

## Categories
- **Command registries / task runners** — package scripts, Make, just, Task
- **Hook guardrails** — pre-commit, Husky, lefthook
- **Hosted CI / workflow orchestration** — GitHub Actions
- **Local CI parity helpers** — act plus repo-local wrapper commands like `make ci`
- **Scheduled maintenance automation** — Dependabot, Renovate

## What People Actually Use
Real practice is layered rather than unified:
- README/docs remain the human router
- repo-local command entrypoints wrap shell/tool invocations
- hooks provide convenience and early feedback, but are bypassable when slow
- CI remains the actual enforcement source of truth
- dependency/maintenance chores are increasingly delegated to scheduled bots, while humans still own batching, merge policy, and exception handling

That layered reality argues against another broad automation wrapper. The stronger move is a smaller routing-first skill that:
1. classifies the recurring workflow,
2. chooses one primary mode,
3. names the smallest useful surface,
4. explicitly routes environment, deployment, Git policy, and test-policy questions away.

## Frequency Ranking
1. GitHub Actions
2. npm / yarn / pnpm scripts
3. GNU Make
4. Dependabot
5. Husky
6. pre-commit
7. Renovate
8. lefthook
9. Task (`go-task`)
10. just
11. act

## Key Gaps
- Most solutions own **one surface** (task runner, hooks, CI, or maintenance bot), but not the routing logic that decides which surface should be primary for a given repo problem.
- Repo automation often accumulates **too many front doors**: README commands, task runner files, shell scripts, hook configs, and CI YAML.
- Teams still need an explicit decision model for **local vs hosted enforcement**, **human-invoked vs scheduled automation**, and **repo-local vs environment/deployment ownership**.
- Maintenance bots solve cadence, not ownership; the skill needs to preserve the review/approval boundary.

## Contradictions
- Marketed tool story: one runner or one hook system will clean everything up.
  User reality: teams keep layered stacks and need a clear router more than another tool catalog.
- Marketed CI parity story: local mirrors can reproduce CI completely.
  User reality: secrets, service topology, matrices, and hosted-runner differences mean local parity is always partial.
- Marketed hook story: local hooks enforce policy.
  User reality: hooks are only trustworthy when fast, deterministic, and mirrored in CI because bypasses are built in.

## Key Insight
The opportunity is not a new workflow-automation wrapper. It is a bounded structural hardening pass on the existing `workflow-automation` skill so it behaves more like a routing-first front door: a smaller skill that quickly decides between task-entrypoints, bootstrap, local-CI parity, hook guardrails, repo-maintenance, and workflow-diagnosis; produces one packet-first output; and hands broader environment, deployment, Git, and test-policy concerns to neighboring skills instead of absorbing them.
