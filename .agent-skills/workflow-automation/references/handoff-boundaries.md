# Handoff Boundaries

Use this table to keep `workflow-automation` from absorbing neighboring skills.

| If the main question is... | Own it with... | Why |
|---|---|---|
| How do we make this repo runnable across machines, containers, local services, and toolchains? | `system-environment-setup` | That is broader environment reproducibility, not just repo command automation. |
| How should we deploy this app or design hosted CI/CD rollout? | `deployment-automation` | Deployment and cloud delivery are downstream of repo-local workflow glue. |
| How should we manage branches, commits, rebases, or recovery? | `git-workflow` | Local Git collaboration is a separate workflow layer. |
| What testing depth should be required before merge or release? | `testing-strategies` | Validation policy is adjacent, but not the same as command orchestration. |
| Why is this test or script failing right now? | `debugging` | Root-cause analysis should stay separate from automation design. |
| How should we observe production behavior or alerts? | `monitoring-observability` | Monitoring is a runtime concern, not a repo command-layer concern. |

## Simple rule
`workflow-automation` owns **repeatable repo-scoped workflow glue**.

That usually means:
- command entrypoints
- bootstrap wrappers
- local CI wrappers
- hook guardrails
- repo maintenance routines

It does **not** own:
- full machine provisioning
- deployment architecture
- local Git history management
- test strategy policy
- debugging current failures
- production observability design
