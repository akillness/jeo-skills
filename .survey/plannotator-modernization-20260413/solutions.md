# Solution Landscape: plannotator modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current `plannotator` skill | Single large operational guide | Covers install, hooks, review, export, and troubleshooting in one place | 600 lines, weak trigger phrasing, missing `references/` + `evals/`, boundary blur | Current repo baseline |
| Modernized `plannotator` anchor | Short SKILL + support bundle | Better activation, easier maintenance, reusable route-outs, fixed eval harness | Requires support-file curation and doc updates | Best bounded improvement |
| Rely on adjacent orchestrators only | Implicit plan-review role through `jeo` / `vibe-kanban` | No extra rewrite work | Leaves core review skill vague and oversized | Reject |
| Add a new plan-review wrapper | New skill beside `plannotator` | Could preserve legacy content | Creates duplication on a core indexed skill | Reject |

## Categories
- **Keep and modernize:** `plannotator` as the canonical visual plan/diff review anchor
- **Route-out neighbors:** `task-planning`, `code-review`, `agentation`, `vibe-kanban`, `jeo`
- **Reject:** new overlapping wrapper skill or leaving the role implicit in orchestration-only skills

## What People Actually Use
In practice, users want one of three things: install/integrate plannotator with their agent platform, review a plan/diff and send structured feedback, or save the reviewed artifact to notes. They do not need a 600-line linear walkthrough every time. The highest-value pattern is a short decision-first skill with detailed setup and troubleshooting moved into references.

## Frequency Ranking
1. Keep `plannotator`, shorten it, and add support files.
2. Add evals that test route-outs and platform-specific review behavior.
3. Update discovery docs so `plannotator` is described as the visual approval gate instead of a generic visual review tool.
4. Do not create a new overlapping skill.

## Key Gaps
- No `references/` for mode selection, platform setup, or note-export caveats.
- No `evals/` for plan review vs diff review vs route-out decisions.
- No concise boundary doc for neighboring planning/review/orchestration skills.
- Discovery docs undersell the role as a human approval gate before execution.

## Contradictions
- Marketed role: visual plan/diff review anchor for multiple agent platforms.
- Current repo reality: long script-heavy doc with weak spec structure, no explicit `## Instructions` section, and no eval harness.

## Key Insight
The best next move is not another orchestration wrapper. It is to convert `plannotator` into a compact, decision-first review anchor whose main body explains when to use plan review, diff review, or note export, while platform setup and troubleshooting live in references and dry-run prompts live in evals.
