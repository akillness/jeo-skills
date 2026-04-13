# Context: plannotator modernization

## Workflow Context
`plannotator` sits in the plan-review lane between ideation/spec work (`ralph`, `task-planning`) and execution (`jeo`, `bmad`, `vibe-kanban`). In practice it is used when an agent has already produced a plan or diff and a human needs to approve, reject, annotate, or archive that work in a browser UI before implementation proceeds. The current skill mixes install/setup details, hook mechanics, review workflow, note export, and troubleshooting into one oversized page, which weakens activation and makes route-outs harder to spot.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo AI-assisted developer | Review plans/diffs before coding, keep a lightweight approval gate | Intermediate |
| Agent orchestrator user (`jeo`, `vibe-kanban`) | Pause execution until a plan is reviewed and approved | Intermediate–advanced |
| Team lead / reviewer | Give structured feedback on plans or diffs without writing a long chat reply | Intermediate |
| Knowledge-base user | Save reviewed plans to Obsidian or Bear for later retrieval | Intermediate |

## Current Workarounds
1. Read the whole `SKILL.md` and manually extract the setup path for the current platform.
2. Use direct CLI commands or scripts without a clear decision on whether the task is plan review, diff review, or note export.
3. Let adjacent orchestrators (`jeo`, `vibe-kanban`) imply the plan-gating role instead of `plannotator` naming it directly.
4. Copy troubleshooting details out of the long skill body instead of using a reusable reference bundle.

## Adjacent Problems
- Boundary confusion with `task-planning`, `code-review`, `agentation`, and `vibe-kanban`.
- Weak trigger phrasing despite high visibility in `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.
- Oversized skill body violates the repo’s own standardization guidance and makes maintenance harder.
- Missing `evals/` means future ratcheting has no fixed prompt set for plan-review routing.

## User Voices
- Plannotator upstream positions itself as “Interactive Plan & Code Review for AI Coding Agents” and highlights visual plan review, plan diff, code review, and annotate-any-file modes. Source: https://raw.githubusercontent.com/backnotprop/plannotator/main/README.md
- The current repo graph report says the next maintenance wins should prioritize “remaining legacy anchors that are widely indexed in docs but still lack both `references/` and `evals/`.” Source: `graphify-out/GRAPH_REPORT.md`
- Current discovery docs surface `plannotator` as a core orchestration skill (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`), which means wording quality on this skill materially affects activation.
