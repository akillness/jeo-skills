# Context: ralph support hardening

## Workflow Context
`ralph` sits at the spec-first and long-running automation boundary: clarify vague requests with a Socratic interview, freeze them into an immutable seed, then loop through execution and verification until the task is actually done. Upstream Ouroboros documents the same Interview → Seed → Execute → Evaluate → Evolve lifecycle and explicitly markets it as a specification-first system for agentic coding work.

Persistent completion is a real operator need, not just branding. LangGraph, AutoGen, and Claude/Codex docs all expose state checkpoints, resume flows, hooks, worktrees, and repo instruction files because unattended automation still depends on durable state and explicit operating contracts. In practice, users combine long-running loops with repo docs, hooks, review gates, and shell scripts rather than trusting one session to remember everything.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo builder using AI CLI tools | Turn vague goals into executable specs and keep iterating until verified completion | Intermediate |
| Maintainer running repo automation | Bound long loops with rules, checkpoints, and reproducible state | Advanced |
| Multi-agent operator | Coordinate planning, execution, approval, and recovery across runtime-specific toolchains | Advanced |
| Team lead / reviewer | Demand clear acceptance criteria and visible definition-of-done before letting automation run unattended | Intermediate |

## Current Workarounds
1. Use repo docs such as `AGENTS.md` / `CLAUDE.md` / prompt files to hold the spec and operating rules because chat context is not trusted to persist indefinitely. Sources: Codex AGENTS.md guide, Claude Code common workflows.
2. Rely on hooks, saved state files, and shell wrappers to resume or continue long jobs after a restart instead of assuming native persistent execution is universal. Sources: Ouroboros README and platform docs, LangGraph persistence, AutoGen state docs.
3. Split work across runtime-specific surfaces (`omc`, `omx`, `ohmg`, `jeo`, `plannotator`, `ralphmode`) so planning, permissions, and approval gates stay explicit rather than buried inside one prompt.
4. Manually keep repo-policy constraints visible because a completion loop can claim success while still violating branch or PR workflow expectations. Source: Ouroboros issue #61.

## Adjacent Problems
- Drift between the original goal and the agent’s final output when the spec is weak or hidden.
- Opaque evaluation criteria that make “done” hard to trust.
- Runtime-specific differences in hooks, approval systems, and persistent-state handling.
- Stale support examples that refer to old paths or commands, forcing users to translate installation/setup steps themselves.

## User Voices
- “It ignored my CLAUDE.md instruction: PR-based workflow. Never commit directly to main.” — Ouroboros issue #61, showing that completion loops still need repo-policy-aware verification. https://github.com/Q00/ouroboros/issues/61
- AutoGen users report long-running workflows that resume into a broken terminal state even when work remains, showing that persistence is still a reliability problem rather than a solved platform feature. https://github.com/microsoft/autogen/issues/7043
- Claude Code users ask for better context-management tooling because unattended sessions still require manual intervention when token pressure or compaction timing goes wrong. https://github.com/anthropics/claude-code/issues/42431

## Evidence notes
- `web_search` / `web_extract` were unavailable in this environment (invalid API-key errors), so evidence came from direct GitHub/raw-doc retrieval, vendor docs, and repo-local files.
