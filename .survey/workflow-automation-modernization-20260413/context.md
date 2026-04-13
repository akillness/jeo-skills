# Context: workflow-automation modernization

## Workflow Context
Developer workflow automation shows up where the same repo-scoped command chain must work across contributors, branches, and CI: bootstrap the repo, install dependencies, start local services, run quality gates, seed data, and mirror CI checks locally. The strongest recurring need is not "automate everything" but "make the next repeatable repo workflow obvious, idempotent, and non-interactive". Local task runners (`npm scripts`, Make, just, Task, mise tasks) persist because they give one entrypoint for recurring commands, while CI-local parity tools (`act`) and containerized dev environments (Dev Containers) exist to reduce drift between laptops and hosted runners.

Sources:
- https://docs.npmjs.com/cli/v10/using-npm/scripts
- https://just.systems/man/en/
- https://taskfile.dev/
- https://mise.jdx.dev/tasks/
- https://nektosact.com/
- https://containers.dev/
- https://docs.github.com/en/actions

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| New contributor / new hire | Get a repo running quickly without tribal knowledge | Low to medium |
| Fullstack developer | Coordinate frontend, backend, DB, background jobs, and quality checks | Medium |
| Maintainer / tech lead | Standardize commands, reduce CI drift, and keep workflows discoverable | Medium to high |
| DevEx / platform engineer | Decide when repo-local automation is enough vs when environment/platform tooling should take over | High |

## Current Workarounds
1. **Thin task catalogs** — `make`, `just`, `npm run`, `task`, and `mise tasks` standardize frequent commands but still depend on shell glue and conventions. Limitation: easy to sprawl into undocumented wrapper commands.
2. **Bootstrap scripts** — `bin/setup`, `script/bootstrap`, or `scripts/dev-setup.sh` handle onboarding and first-run flows. Limitation: they often become imperative, OS-specific, and interactive.
3. **CI mirror commands** — `make ci`, `npm run ci`, and `act` try to reproduce CI locally. Limitation: local and hosted runners still differ in images, secrets, and service topology.
4. **Containerized local dev** — Docker Compose and Dev Containers improve parity and onboarding. Limitation: they can slide into broader environment/system setup instead of staying repo-scoped workflow glue.
5. **Hook-based automation** — `pre-commit` and similar tools enforce fast local checks. Limitation: they are guardrails, not a full workflow layer, and must stay mirrored in CI.

## Adjacent Problems
- **System/environment setup** — broader machine/runtime/container reproducibility and local service topology; better handled by `system-environment-setup`.
- **Deployment automation** — cloud/server rollout, release orchestration, Docker/Kubernetes, and hosted CI/CD; better handled by `deployment-automation`.
- **Git collaboration** — commit shaping, rebases, recovery, and push safety; better handled by `git-workflow`.
- **Monitoring / observability** — runtime alerting and production instrumentation are downstream of workflow automation, not the same problem.
- **Secret architecture** — secret-manager design and security policy often constrain automation, but they are not owned by the repo-local workflow skill.

## User Voices
- "Run your GitHub Actions locally." — `act`'s core framing reflects the persistent CI-parity demand. Source: https://nektosact.com/
- "Task: The Modern Task Runner" — Task's positioning reflects continued demand for a simpler, cross-platform repo command layer than legacy Make-only setups. Source: https://taskfile.dev/
- "Open any folder or repository inside a Docker container..." — Dev Containers' framing reflects onboarding and parity pain as a workflow problem, not just a packaging problem. Source: https://containers.dev/
- GitHub Actions is positioned as a way to "automate, customize, and execute your software development workflows right in your repository", which is exactly the surface `workflow-automation` should route toward without absorbing deployment-specific complexity. Source: https://docs.github.com/en/actions
