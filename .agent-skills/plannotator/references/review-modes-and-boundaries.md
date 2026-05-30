# Review modes and boundaries

## Core rule
`plannotator` is for **reviewing a concrete plan, markdown artifact, or diff in a visual browser UI**.
It should not quietly absorb planning, orchestration, broad PR-policy review, or rendered-UI bug triage.

## Mode boundaries

### 1) Plan review
Use when:
- an implementation plan already exists
- a human wants to approve or request changes before execution
- the real value is the approval gate, not plan generation

Route out when:
- the plan is still being written or re-scoped → `task-planning`, `ralph`, `survey`
- the real blocker is orchestration state or handoff sequencing → `jeo`, `vibe-kanban`, `bmad`

### 2) Diff review
Use when:
- code already changed
- the reviewer wants visual markup on a commit range, branch diff, or PR
- feedback should attach to a concrete diff rather than a general policy discussion

Route out when:
- the main need is merge policy, risk judgment, or reviewer criteria → `code-review`
- the main need is debugging/root-cause isolation → `debugging`

### 3) Markdown review
Use when:
- the artifact is a spec, PRD, architecture note, generated plan package, or other markdown file
- a human wants to annotate or approve the concrete document before work continues

Route out when:
- the artifact is still being authored rather than reviewed → `task-planning`, `ralph`
- the real job is note taxonomy or durable wiki management → `obsidian`, `llm-wiki`

### 4) Platform setup / troubleshooting
Use when:
- the review job is conceptually correct but runtime hookup, browser launching, remote mode, or stable URL/port behavior is the blocker

Route out when:
- the real job is platform ownership or environment provisioning → `omc`, `omx`, `ohmg`, `system-environment-setup`

## Manual-vs-hook reminder
- Claude and Gemini are the clearest native/hook-driven plan-review fits.
- Codex should still be described honestly as manual/partial where upstream docs remain limited.
- OpenCode users may prefer manual control when auto-review feels too eager.

## Neighboring skills
| Skill | Owns | Do not steal from it |
|------|------|-----------------------|
| `task-planning` | Turning goals into execution-ready plans | The core planning/spec creation step |
| `ralph` | Spec-first / interview-first planning loops | Requirement shaping and spec refinement |
| `jeo` | Orchestration and execution gating across tools | Ledger/state/orchestration logic |
| `vibe-kanban` | Kanban/task movement and decomposition | Board management and work tracking |
| `code-review` | Risk/correctness/approval judgment on code changes | Broad PR-review policy |
| `agentation` | UI screenshot annotation → targeted code fixes | Rendered UI bug markup |
| `browser-harness` | Clean disposable browser verification | Fresh-session browser evidence |
| `obsidian` / `llm-wiki` | Durable note/wiki management | General note-system administration |

## Review quality heuristics
Good feedback:
- names the exact step, file, or diff range
- asks for a concrete change
- includes acceptance criteria when requesting changes
- separates distinct issues into separate annotations

Weak feedback:
- bundles many issues into one comment
- asks the reviewer to invent the plan during review
- mixes UI, architecture, merge policy, and setup in one note
- uses diff review when no code exists yet
