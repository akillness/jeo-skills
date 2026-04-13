# Review modes and boundaries

## Core rule
`plannotator` is for **reviewing a concrete plan or diff in a visual browser UI**.
It should not quietly absorb planning, orchestration, or broad code-review policy work.

## Mode selection

### 1) Plan review
Use when:
- a plan already exists
- a human wants to approve or request changes before implementation begins
- the value comes from inline annotations and a clear gate

Do not use when:
- the real problem is writing the plan from scratch
- the plan is still at vague brainstorming level

Route out to:
- `task-planning`
- `ralph`
- `survey` when the work needs research before planning

### 2) Diff review
Use when:
- code already changed
- the reviewer wants visual, line-targeted markup
- feedback should be attached to a concrete diff or commit range

Do not use when:
- the user wants repo-wide approval policy, test/risk discussion, or architectural judgment without a concrete diff

Route out to:
- `code-review`
- `debugging` if the problem is root-cause isolation rather than review

### 3) Note export
Use when:
- the review result should be archived to Obsidian or Bear
- the review already happened or will happen as part of the same flow

Do not use when:
- the real task is note taxonomy, wiki organization, or ongoing knowledge-base maintenance

Route out to:
- `obsidian`
- `llm-wiki`

## Neighboring skills

| Skill | Owns | Do not steal from it |
|------|------|-----------------------|
| `task-planning` | Turning goals into execution-ready plans | The core planning/spec creation step |
| `ralph` | Spec-first / interview-first planning loops | Requirement shaping and spec refinement |
| `jeo` | Orchestration and execution gating across tools | Ledger/state/orchestration logic |
| `vibe-kanban` | Kanban/task movement and decomposition | Board management and work tracking |
| `code-review` | Risk/correctness/approval judgment on code changes | Broad PR-review policy |
| `agentation` | UI screenshot annotation → targeted code fixes | Visual UI bug markup separate from plan/diff review |
| `obsidian` / `llm-wiki` | Durable note/wiki management | General note-system administration |

## Review quality heuristics
Good feedback:
- names the exact step or line range
- asks for a concrete change
- includes acceptance criteria when requesting changes
- separates distinct issues into separate annotations

Weak feedback:
- bundles many issues into one comment
- asks the reviewer to invent the plan during review
- mixes UI, architecture, and release policy in one note
- uses diff review when no code exists yet
