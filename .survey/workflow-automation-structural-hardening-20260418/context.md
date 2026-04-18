# Context: workflow-automation structural hardening

## Workflow Context
Repo-scoped workflow automation appears anywhere a repository needs one stable command surface for recurring local work without turning the repo into a full platform-engineering project. The recurring patterns are consistent across CLI, frontend, backend, fullstack, and game repos:

- bootstrap/setup entrypoints such as `make setup`, `just bootstrap`, `task init`, or `npm run setup`
- stable dev/test/lint/build wrappers such as `make test`, `task ci`, or `npm run verify`
- hook-driven guardrails through Git hooks, `pre-commit`, Husky, or lefthook
- local CI parity commands that mirror the critical checks from hosted CI without pretending local and hosted runners are identical
- scheduled or bot-owned maintenance routines for dependency updates, lockfile refreshes, cleanup, or release-prep chores

The strongest recurring pain is not lack of automation tooling. It is command sprawl, drift between local scripts and CI YAML, hidden onboarding knowledge, and unclear ownership between repo-local glue vs environment setup vs deployment.

Evidence notes:
- `web_search` / `web_extract` were unreliable in this environment, so this survey used repo-local graph/wiki evidence plus source-backed synthesis from primary docs linked below.
- Primary docs consistently frame the layer as repo-owned automation rather than full environment or deployment ownership: npm scripts, GNU Make, just, Task, pre-commit, GitHub Actions, Dependabot, Renovate.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| New contributor | Get the repo running, find the right setup/test/lint commands, avoid tribal knowledge | Low to medium |
| Core maintainer | Keep commands discoverable, reduce support burden, align docs/local commands/CI | Medium to high |
| Reviewer / CI owner | Make pre-push feedback useful and keep CI as the real enforcement layer | Medium to high |
| Polyglot repo maintainer | Unify command entrypoints across mixed toolchains and languages | High |
| Platform / internal tooling maintainer | Standardize recurring repo workflows while keeping boundaries with deployment and environment setup | High |
| Game / toolchain team lead | Keep build, verify, content-validation, or maintenance chores repeatable without bloating into engine/runtime operations | Medium to high |

## Current Workarounds
1. **README command lists** — contributors copy/paste commands from docs because there is no single executable front door.
   - Limitation: docs drift faster than task entrypoints.
2. **Ad hoc shell scripts** — `scripts/*.sh` or `bin/*` wrappers become the hidden command layer.
   - Limitation: weak discoverability and inconsistent naming.
3. **Package-manager scripts used as the catch-all** — `npm run` or equivalent becomes the de facto task runner even in polyglot repos.
   - Limitation: command strings become opaque and portability suffers.
4. **CI YAML as the only source of truth** — teams tell contributors to read Actions workflows or push to discover failures.
   - Limitation: local feedback is slower and true workflow logic becomes invisible.
5. **Manual or bypassable hooks** — teams install Husky/pre-commit/raw hooks but treat them as advisory because they are slow or brittle.
   - Limitation: CI must duplicate enforcement anyway.
6. **Scheduled bots without a clear ownership contract** — dependency updates and maintenance PRs are automated, but review/merge policy lives elsewhere.
   - Limitation: noise, ambiguity, and drift between automation cadence and human ownership.

## Adjacent Problems
- **Environment setup** — machine provisioning, local services, devcontainers, Docker Compose topology, and cross-machine reproducibility are broader than repo command automation.
- **Deployment automation** — release rollout, hosted CI/CD architecture, cloud delivery, and rollback policy should stay separate from repo-local workflow glue.
- **Git workflow policy** — branch/rebase/recovery flows are adjacent, but not the same as task-runner or hook design.
- **Testing policy** — deciding test depth, merge gates, and flaky-suite strategy is different from choosing the command surface that runs those checks.
- **Monitoring / observability** — runtime telemetry and alerts are downstream runtime concerns, not repo automation.
- **Developer UX / discoverability** — tooling choice (`make`, `just`, `Task`, package scripts) changes ergonomics, but the underlying ownership problem is still the same routing problem.

## User Voices
> "Scripts are run from the root of the package folder..." — npm scripts docs emphasize repo-owned named command entrypoints rather than ad hoc shell history. Source: <https://docs.npmjs.com/cli/v10/using-npm/scripts>

> "pre-commit is a framework for managing and maintaining multi-language pre-commit hooks." — direct statement of the repo-local hook/guardrail layer. Source: <https://pre-commit.com/>

> "A workflow is a configurable automated process that will run one or more jobs." — GitHub Actions docs reinforce that CI workflows are repo automation, but they are a different surface from the local entrypoint layer. Source: <https://docs.github.com/en/actions/using-workflows/about-workflows>

> "just is a handy way to save and run project-specific commands." — just’s positioning shows the continued demand for a cleaner repo command router than raw shell or Make. Source: <https://just.systems/man/en/>

> Task’s guide centers `Taskfile.yml` as project automation, again signaling that teams keep reaching for a readable repo-owned command layer. Source: <https://taskfile.dev/docs/guide>

> Dependabot and Renovate both treat schedules/configuration as first-class for recurring update work, which confirms that maintenance automation is usually policy-plus-bot cadence rather than a human typing commands every time. Sources: <https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/about-dependabot-version-updates>, <https://docs.renovatebot.com/configuration-options/#schedule>
