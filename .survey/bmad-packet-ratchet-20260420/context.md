# Context: bmad packet ratchet

## Workflow Context
`bmad` sits at the front door of a multi-artifact BMAD/BMM workflow, but real users often arrive with a packet in hand rather than clean phase language. Upstream BMAD already reflects this reality through brownfield guidance, `bmad-help`, and `quick-dev`: existing repos need context generation and cleanup before artifact selection, while small bounded changes may start from issue links, file paths, or bug URLs rather than a formal phase transition.

Primary sources:
- BMAD established-project guidance: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/how-to/established-projects.md
- BMAD quick-dev / quick-fixes: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/explanation/quick-dev.md
- BMAD workflow map: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/reference/workflow-map.md
- BMAD game-dev studio README: https://raw.githubusercontent.com/bmad-code-org/bmad-module-game-dev-studio/main/README.md

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo developer | Decide what artifact or phase comes next for a live project | mixed |
| Founder / PM | Move from idea or PRD into architecture and execution without skipping review | mixed |
| Agent operator | Route runtime-specific execution to Claude/Codex/Gemini overlays without bloating the core front door | advanced |
| Brownfield maintainer | Start from existing repo state, docs, issues, or review feedback instead of greenfield phase assumptions | advanced |
| Game producer / designer | Move between concept, GDD, milestone plan, playtest notes, and launch pressure | mixed |

## Current Workarounds
1. Use `bmad-help` or manual phase interpretation after reading the current repo state.
   - Limitation: still requires the operator to infer which artifact packet matters most now.
2. Fall back to `quick-dev` for small changes.
   - Limitation: helps bounded work, but does not fully clarify the boundary between ideation, planning, solutioning, runtime execution, and game-production routing.
3. Route manually across neighboring skills like `bmad-idea`, `task-planning`, `plannotator`, `omc`, `omx`, `ohmg`, and `bmad-gds`.
   - Limitation: correct, but the front-door contract is still more phase-centric than packet-centric.
4. Use external docs, spreadsheets, issue trackers, or milestone boards as the practical system of record.
   - Limitation: artifact ownership and review gates can drift.

## Adjacent Problems
- Brownfield artifact generation can diverge from the real codebase: https://github.com/bmad-code-org/BMAD-METHOD/issues/1538
- PRD workflows can overreach on scoping/phasing/artifact creation: https://github.com/bmad-code-org/BMAD-METHOD/issues/1693
- Story/epic generation can cause brownfield file churn: https://github.com/bmad-code-org/BMAD-METHOD/issues/1823
- Larger teams may need external work-management systems such as Azure DevOps: https://github.com/bmad-code-org/BMAD-METHOD/issues/2270
- Subagent context starvation makes front-door packet normalization more valuable: https://github.com/bmad-code-org/BMAD-METHOD/issues/2280

## User Voices
> "Currently, bmad skills … are file-system-based. This is adequate for MVPs and small projects. But large projects usually consider a more established system, such as Azure DevOps, for work management."
- Source: https://github.com/bmad-code-org/BMAD-METHOD/issues/2270

> "Subagents have no context other than the summary the orchestrator provides… and without tool use they are not able to validate or extend the information."
- Source: https://github.com/bmad-code-org/BMAD-METHOD/issues/2280

> "The PRD creation workflow … takes autonomous action on high-impact decisions (scoping, phasing, artifact creation) without asking the user…"
- Source: https://github.com/bmad-code-org/BMAD-METHOD/issues/1693

> "When attempting to generate comprehensive planning or documentation from an existing project, the model often fails to fully read or understand the entire codebase…"
- Source: https://github.com/bmad-code-org/BMAD-METHOD/issues/1538
