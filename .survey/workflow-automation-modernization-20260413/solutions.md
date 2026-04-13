# Solution Landscape: workflow-automation modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| npm scripts | Built-in package-manager task runner | Ubiquitous in JS/TS repos, zero extra dependency, easy discovery in `package.json` | Shell portability issues, weak composition, JS-centric | Good for thin local command entrypoints, not broad automation architecture |
| GNU Make | General task runner / build automation | Cross-language baseline, widely available, works for bootstrap + CI wrappers | Steep syntax/quoting costs, uneven Windows ergonomics | Still the common denominator in many repos |
| just | Developer-friendly command runner | Cleaner syntax than Make, good for human-facing repo commands | Still shell-centric, not universal | Strong fit for local workflow command surfaces |
| Task (go-task) | YAML task runner | Cross-platform task graphs, clearer task metadata | Another tool to install, YAML verbosity | Useful when portability matters more than ubiquity |
| mise tasks | Runtime manager + task layer | Pairs tool-version pinning with repo tasks | Added tool-layer overhead, can overlap with environment setup | Useful bridge between onboarding and workflow tasks |
| pre-commit | Hook-based quality automation | Fast local guardrails, portable lint/format policy | Not a full workflow layer, must stay mirrored in CI | Best as a workflow guardrail, not the skill's only answer |
| GitHub Actions | Hosted CI/repo automation | Strong for reusable workflows, scheduled jobs, repo automation | YAML sprawl, slower feedback, imperfect local parity | Route here when the problem becomes hosted CI/CD or repo automation |
| act | Local GitHub Actions runner | Helps debug CI locally, reduces PR iteration latency | Not perfect parity with hosted runners | Strong secondary tool, not the primary workflow abstraction |
| Dev Containers / Docker Compose | Containerized local dev | Strong onboarding and service parity | Heavier than repo-local glue, easily overlaps with environment setup | Useful boundary case for route-outs |
| Renovate / Dependabot | Repo maintenance automation | Automates dependency chores and update cadence | Noise/config tuning required | Useful for repo-maintenance automation mode |

## Categories
- **Local task runners**: npm scripts, Make, just, Task
- **Runtime + task bridges**: mise tasks
- **Local guardrails**: pre-commit
- **Hosted CI / repo automation**: GitHub Actions
- **CI-local parity**: act
- **Containerized local workflows**: Dev Containers, Docker Compose
- **Maintenance bots**: Renovate, Dependabot

## What People Actually Use
In practice, teams keep mixing shell scripts, Make targets, package scripts, CI YAML, hook tooling, and container commands instead of betting on one workflow product. The common persistent pattern is a thin repo-local command layer (`make dev`, `npm run ci`, `just bootstrap`) that wraps the real tools underneath. Manual glue persists around secrets, first-run setup, service startup, and CI parity.

## Frequency Ranking
1. GitHub Actions
2. npm scripts
3. Make
4. pre-commit
5. just / Task
6. act
7. Dev Containers / Docker Compose
8. Renovate / Dependabot
9. mise tasks

## Key Gaps
- Many solution pages teach tools, but not **how to choose the smallest repo-scoped automation layer**.
- Legacy guidance often blurs **repo workflow glue** with **environment provisioning** and **deployment automation**.
- Teams still need explicit guidance for **idempotent bootstrap**, **non-interactive scripts**, **local-vs-CI parity**, and **route-outs when the task belongs elsewhere**.
- Most generic workflow writeups under-specify how to decide between **task runners**, **hooks**, **local CI mirrors**, and **repo-maintenance automation** in one reusable intake.

## Contradictions
- Marketed claim: one modern tool can unify workflow automation. User reality: teams still layer shell scripts, task runners, CI YAML, and container tooling.
- Marketed claim: local CI simulators remove workflow drift. User reality: hosted CI and local machines still differ in images, secrets, and service topology.
- Marketed claim: containerized dev eliminates setup pain. User reality: onboarding still needs repo-specific bootstrap commands, secret handoff, and service checks.

## Key Insight
The highest-value rewrite is not another catalog of task runners. `workflow-automation` should become the **repo-scoped recurring-workflow anchor**: choose the right automation mode, build a thin repeatable entrypoint around existing tools, keep scripts idempotent and non-interactive, and route broader environment provisioning or deployment concerns to neighboring skills instead of swallowing them.
